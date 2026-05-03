package noskillsserverfx

import (
	"encoding/json"
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

var nonSlugRe = regexp.MustCompile(`[^a-z0-9]+`) //nolint:gochecknoglobals

// slugify normalises a name to a URL-safe, lowercase slug.
func slugify(name string) string {
	s := strings.ToLower(name)
	s = nonSlugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")

	return s
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
	// Path registers an already-cloned local workspace.
	Path string `json:"path,omitempty"`
	// Git triggers a clone-on-demand into DataDir/projects/<slug>.
	Git string `json:"git,omitempty"`
	// Slug is optional; derived from Path/Git base name when omitted.
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
		// Register-existing: path must already exist.
		abs, err := filepath.Abs(req.Path)
		if err != nil {
			return ctx.Results.Error(http.StatusBadRequest,
				httpfx.WithSanitizedError(fmt.Errorf("resolve path: %w", err)))
		}

		if _, err := os.Stat(abs); err != nil {
			return ctx.Results.Error(http.StatusBadRequest,
				httpfx.WithSanitizedError(fmt.Errorf("path not found: %w", err)))
		}

		localPath = abs

	case req.Git != "":
		// Clone-on-demand into DataDir/projects/<slug>.
		dest := filepath.Join(s.config.DataDir, "projects", slug)

		if err := os.MkdirAll(filepath.Dir(dest), 0o700); err != nil {
			return ctx.Results.Error(http.StatusInternalServerError,
				httpfx.WithSanitizedError(fmt.Errorf("mkdir projects dir: %w", err)))
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
