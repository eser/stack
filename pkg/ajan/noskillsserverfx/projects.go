package noskillsserverfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// ── Registry ──────────────────────────────────────────────────────────────────

// DaemonState is persisted to ~/.noskills/daemon.json.
type DaemonState struct {
	Projects map[string]string `json:"projects"` // slug → absolute local path
}

// loadDaemonState reads daemon.json. Returns an empty state if the file does
// not yet exist.
func (s *Server) loadDaemonState() (DaemonState, error) {
	path := filepath.Join(s.config.DataDir, "daemon.json")

	data, err := os.ReadFile(path) //nolint:gosec // dataDir+daemon.json, not user-supplied
	if os.IsNotExist(err) {
		return DaemonState{Projects: make(map[string]string)}, nil
	}

	if err != nil {
		return DaemonState{}, fmt.Errorf("read daemon.json: %w", err)
	}

	var ds DaemonState

	if err := json.Unmarshal(data, &ds); err != nil {
		return DaemonState{}, fmt.Errorf("parse daemon.json: %w", err)
	}

	if ds.Projects == nil {
		ds.Projects = make(map[string]string)
	}

	return ds, nil
}

// saveDaemonState writes daemon.json atomically via a .tmp+rename.
func (s *Server) saveDaemonState(ds DaemonState) error {
	if err := os.MkdirAll(s.config.DataDir, 0o700); err != nil {
		return fmt.Errorf("mkdir data-dir: %w", err)
	}

	data, err := json.MarshalIndent(ds, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal daemon.json: %w", err)
	}

	tmp := filepath.Join(s.config.DataDir, "daemon.json.tmp")

	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write daemon.json.tmp: %w", err)
	}

	if err := os.Rename(tmp, filepath.Join(s.config.DataDir, "daemon.json")); err != nil {
		return fmt.Errorf("rename daemon.json: %w", err)
	}

	return nil
}

// ── Slug helpers ──────────────────────────────────────────────────────────────

// maxSlugLen bounds a slug so it always fits in a single filesystem component.
const maxSlugLen = 100

var ( //nolint:gochecknoglobals
	nonSlugRe = regexp.MustCompile(`[^a-z0-9]+`)

	// slugRe is exactly the shape slugify emits: lowercase alphanumerics joined
	// by single dashes, no leading or trailing dash. It admits no separator, no
	// "." and no "..", which is what makes a slug safe to join into a path.
	slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

	// gitRemoteHelperRe matches git's `transport::address` remote-helper syntax.
	// An address such as https://[::1]/repo.git is not matched: its "::" sits
	// after "://", not directly after a bare transport name.
	gitRemoteHelperRe = regexp.MustCompile(`^[A-Za-z0-9+.-]+::`)
)

var (
	errInvalidSlug     = errors.New("slug must be lowercase alphanumerics joined by single dashes")
	errSlugTooLong     = errors.New("slug is too long")
	errPathRelative    = errors.New("path must be absolute")
	errPathNotDir      = errors.New("path is not a directory")
	errPathInDataDir   = errors.New("path is inside the daemon data directory")
	errBadCloneDest    = errors.New("clone destination is not a direct child of the projects dir")
	errGitRemoteHelper = errors.New("git URL uses a remote-helper transport")
)

// slugify normalises a name to a URL-safe, lowercase slug.
func slugify(name string) string {
	s := strings.ToLower(name)
	s = nonSlugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")

	return s
}

// validateSlug rejects any slug that is not already in canonical slugify shape.
//
// The slug names the git-clone destination under DataDir/projects/<slug>, so a
// slug carrying a separator or a ".." segment is a directory-traversal
// primitive: POST /api/projects with {"git": "…", "slug": "../../../.ssh"}
// would otherwise clone a caller-controlled repository on top of the user's
// ~/.ssh. Slugs derived here always come out of slugify and already satisfy
// this; the check exists for the explicit `slug` request field, which reached
// the path join untouched. It rejects rather than re-slugifying so a caller
// never ends up with a project registered under a name it did not ask for.
func validateSlug(slug string) error {
	if len(slug) > maxSlugLen {
		return fmt.Errorf("%w: %d characters, limit is %d", errSlugTooLong, len(slug), maxSlugLen)
	}

	if !slugRe.MatchString(slug) {
		return fmt.Errorf("%w: %q", errInvalidSlug, slug)
	}

	return nil
}

// ── Path containment ──────────────────────────────────────────────────────────

// containsPath reports whether target is base itself or lives underneath it.
// Containment is decided with filepath.Rel rather than a strings.HasPrefix on
// the raw strings, which would accept "/home/u/.noskills-evil" as living inside
// "/home/u/.noskills". Both arguments must be cleaned absolute paths.
func containsPath(base, target string) (bool, error) {
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return false, fmt.Errorf("relate %q to %q: %w", target, base, err)
	}

	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) ||
		filepath.IsAbs(rel) {
		return false, nil
	}

	return true, nil
}

// resolvedDataDir returns DataDir as a cleaned absolute path with symlinks
// resolved, so containment checks compare real paths on machines where
// ~/.noskills is a link to another volume.
func (s *Server) resolvedDataDir() (string, error) {
	abs, err := filepath.Abs(s.config.DataDir)
	if err != nil {
		return "", fmt.Errorf("resolve data-dir: %w", err)
	}

	// DataDir is created lazily on first write, so a missing directory is not an
	// error here — the cleaned absolute form is still a sound comparison base.
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return abs, nil //nolint:nilerr
	}

	return resolved, nil
}

// resolveWorkspacePath validates the caller-supplied `path` field of an add
// request and returns the real absolute directory to record.
//
// Registering a workspace anywhere on the machine is the point of this endpoint
// — the daemon then runs agent sessions in that directory — so there is no base
// directory to confine it to; the PIN is the authorization boundary. What is
// enforced is that the recorded root is unambiguous and cannot be aimed at the
// daemon's own state:
//
//   - absolute only: filepath.Abs would otherwise resolve a relative path
//     against whatever working directory launchd or systemd handed the daemon,
//     so the same request would register different directories per host.
//   - symlinks resolved: the root is stored once and reused by every later spec
//     and session, so a link retargeted after registration would silently move
//     the workspace out from under the daemon.
//   - inside DataDir rejected: ~/.noskills holds auth.json (the PIN hash and
//     live tokens) plus every session ledger. Registering it as a project would
//     let spec scaffolding and agent tooling rewrite the daemon's own
//     credentials.
func (s *Server) resolveWorkspacePath(raw string) (string, error) {
	if !filepath.IsAbs(raw) {
		return "", fmt.Errorf("%w: %q", errPathRelative, raw)
	}

	// EvalSymlinks cleans the path and fails when it does not exist, which is
	// also the existence check the register-existing flow needs.
	resolved, err := filepath.EvalSymlinks(raw)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}

	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat path: %w", err)
	}

	if !info.IsDir() {
		return "", fmt.Errorf("%w: %q", errPathNotDir, raw)
	}

	dataDir, err := s.resolvedDataDir()
	if err != nil {
		return "", err
	}

	inside, err := containsPath(dataDir, resolved)
	if err != nil {
		return "", err
	}

	if inside {
		return "", fmt.Errorf("%w: %q", errPathInDataDir, raw)
	}

	return resolved, nil
}

// cloneDestination creates DataDir/projects and returns the directory a clone
// for slug may write to. slug is already validated by the time it gets here, so
// the containment check is a second gate that fails closed should slug handling
// ever loosen again.
func (s *Server) cloneDestination(slug string) (string, error) {
	dataDir, err := s.resolvedDataDir()
	if err != nil {
		return "", err
	}

	base := filepath.Join(dataDir, "projects")

	if err := os.MkdirAll(base, 0o700); err != nil {
		return "", fmt.Errorf("mkdir projects dir: %w", err)
	}

	// Resolve after MkdirAll so containment compares the directory git will
	// actually write into.
	realBase, err := filepath.EvalSymlinks(base)
	if err != nil {
		return "", fmt.Errorf("resolve projects dir: %w", err)
	}

	dest := filepath.Join(realBase, slug)

	inside, err := containsPath(realBase, dest)
	if err != nil {
		return "", err
	}

	// Containment alone would still accept a nested "a/b"; a project directory
	// is always a direct child, so anything deeper means slug carried a
	// separator and must not reach git.
	if !inside || filepath.Dir(dest) != realBase {
		return "", fmt.Errorf("%w: %q", errBadCloneDest, slug)
	}

	return dest, nil
}

// validateGitURL rejects git remote-helper URLs. `git clone -- 'ext::sh -c id'`
// makes git execute the trailing command, so handing the raw `git` request
// field to git clone turns project registration into arbitrary command
// execution as the daemon user. Ordinary https, ssh, git and scp-style
// addresses are unaffected, and the existing `--` already stops a URL that
// starts with a dash from being read as an option.
func validateGitURL(url string) error {
	if gitRemoteHelperRe.MatchString(url) {
		return fmt.Errorf("%w: %q", errGitRemoteHelper, url)
	}

	return nil
}

// ── REST handlers ─────────────────────────────────────────────────────────────

type projectInfo struct {
	Slug string `json:"slug"`
	Path string `json:"path"`
}

func (s *Server) handleListProjects(ctx *httpfx.Context) httpfx.Result {
	ds, err := s.loadDaemonState()
	if err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("load registry: %w", err)))
	}

	list := make([]projectInfo, 0, len(ds.Projects))

	for slug, path := range ds.Projects {
		list = append(list, projectInfo{Slug: slug, Path: path})
	}

	return ctx.Results.JSON(list)
}

type addProjectRequest struct {
	// Path registers an already-cloned local workspace. It must be an absolute
	// path to an existing directory outside the daemon's own data directory.
	Path string `json:"path,omitempty"`
	// Git triggers a clone-on-demand into DataDir/projects/<slug>.
	Git string `json:"git,omitempty"`
	// Slug is optional; derived from Path/Git base name when omitted. When given
	// it must already be in canonical slug form — see validateSlug.
	Slug string `json:"slug,omitempty"`
}

type addProjectResponse struct {
	Slug string `json:"slug"`
	Path string `json:"path"`
}

func (s *Server) handleAddProject(ctx *httpfx.Context) httpfx.Result {
	var req addProjectRequest
	if err := ctx.ParseJSONBody(&req); err != nil {
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("parse body: %w", err)))
	}

	if req.Path == "" && req.Git == "" {
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("one of path or git is required"))) //nolint:err113
	}

	// Derive slug from explicit field, path basename, or git URL basename.
	slug := req.Slug

	if slug == "" && req.Path != "" {
		slug = slugify(filepath.Base(req.Path))
	}

	if slug == "" && req.Git != "" {
		base := req.Git
		base = strings.TrimSuffix(base, ".git")
		slug = slugify(filepath.Base(base))
	}

	if slug == "" {
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("could not derive slug"))) //nolint:err113
	}

	// The slug is joined into DataDir/projects/<slug>; validate before it ever
	// reaches a path join. See validateSlug.
	if err := validateSlug(slug); err != nil {
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("invalid slug: %w", err)))
	}

	ds, err := s.loadDaemonState()
	if err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("load registry: %w", err)))
	}

	if _, exists := ds.Projects[slug]; exists {
		return ctx.Results.Error(http.StatusConflict,
			httpfx.WithSanitizedError(fmt.Errorf("slug %q already registered", slug))) //nolint:err113
	}

	var localPath string

	switch {
	case req.Path != "":
		// Register-existing: the workspace must already exist on disk.
		abs, err := s.resolveWorkspacePath(req.Path)
		if err != nil {
			return ctx.Results.Error(http.StatusBadRequest,
				httpfx.WithSanitizedError(fmt.Errorf("register path: %w", err)))
		}

		localPath = abs

	case req.Git != "":
		if err := validateGitURL(req.Git); err != nil {
			return ctx.Results.Error(http.StatusBadRequest,
				httpfx.WithSanitizedError(fmt.Errorf("register git url: %w", err)))
		}

		// Clone-on-demand into DataDir/projects/<slug>.
		dest, err := s.cloneDestination(slug)
		if err != nil {
			return ctx.Results.Error(http.StatusInternalServerError,
				httpfx.WithSanitizedError(fmt.Errorf("prepare clone destination: %w", err)))
		}

		cmd := exec.CommandContext(ctx.Request.Context(), "git", "clone", "--", req.Git, dest)
		out, err := cmd.CombinedOutput()

		if err != nil {
			return ctx.Results.Error(http.StatusUnprocessableEntity,
				httpfx.WithSanitizedError(fmt.Errorf("git clone failed: %w — %s", err, string(out))))
		}

		localPath = dest
	}

	ds.Projects[slug] = localPath

	if err := s.saveDaemonState(ds); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("save registry: %w", err)))
	}

	return ctx.Results.JSON(&addProjectResponse{Slug: slug, Path: localPath})
}

func (s *Server) handleDeleteProject(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	ds, err := s.loadDaemonState()
	if err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("load registry: %w", err)))
	}

	if _, exists := ds.Projects[slug]; !exists {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug))) //nolint:err113
	}

	delete(ds.Projects, slug)

	if err := s.saveDaemonState(ds); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("save registry: %w", err)))
	}

	return ctx.Results.Ok()
}

// projectPath resolves slug → absolute path or returns ("", false).
func (s *Server) projectPath(slug string) (string, bool) {
	ds, err := s.loadDaemonState()
	if err != nil {
		return "", false
	}

	path, ok := ds.Projects[slug]

	return path, ok
}
