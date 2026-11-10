package noskillsserverfx

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

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

// underDir reports whether target is dirInfo's directory itself, or lives
// beneath it, comparing filesystem identity rather than spelling.
//
// containsPath is a lexical test, and lexical tests lose on a case-insensitive
// filesystem: macOS stats "/Users/u/.NOSKILLS" successfully, EvalSymlinks keeps
// whatever case it was handed, and filepath.Rel then reports the path as
// somewhere else entirely. os.SameFile compares device and inode, so every
// spelling of the same directory collapses to one answer.
//
// Walking up from target rather than down keeps this O(depth) and needs no
// directory listing. target is a path of the daemon's own configuration; a
// caller's path is checked with underDirInRoot.
func underDir(dirInfo os.FileInfo, target string) bool {
	for current := filepath.Clean(target); ; {
		if info, err := os.Stat(current); err == nil && os.SameFile(info, dirInfo) {
			return true
		}

		parent := filepath.Dir(current)
		if parent == current {
			return false
		}

		current = parent
	}
}

// underDirInRoot is underDir for rel, a local path inside root: it walks up
// from rel through root, then on through the directories above root.
func underDirInRoot(dirInfo os.FileInfo, root *os.Root, rel string) bool {
	for current := rel; ; current = filepath.Dir(current) {
		if info, err := root.Stat(current); err == nil && os.SameFile(info, dirInfo) {
			return true
		}

		if current == "." {
			return underDir(dirInfo, root.Name())
		}
	}
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

// resolvedWorkspaceRoot returns WorkspaceRoot as an absolute path with
// symlinks resolved. Unlike DataDir it must exist: a workspace is registered
// inside it.
func (s *Server) resolvedWorkspaceRoot() (string, error) {
	if s.config.WorkspaceRoot == "" {
		return "", errNoWorkspaceRoot
	}

	abs, err := filepath.Abs(s.config.WorkspaceRoot)
	if err != nil {
		return "", fmt.Errorf("resolve workspace root: %w", err)
	}

	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("resolve workspace root: %w", err)
	}

	return resolved, nil
}

// resolveWorkspacePath validates the caller-supplied `path` field of an add
// request and returns the real absolute directory to record.
//
// The daemon then runs agent sessions in that directory and scaffolds specs
// into it, so the path is confined to WorkspaceRoot (the home directory by
// default), and every other rule below applies inside it:
//
//   - absolute only: filepath.Abs would otherwise resolve a relative path
//     against whatever working directory launchd or systemd handed the daemon,
//     so the same request would register different directories per host.
//   - symlinks resolved, then confined: the root is stored once and reused by
//     every later spec and session, so a link retargeted after registration
//     would silently move the workspace out from under the daemon, and a link
//     inside WorkspaceRoot that points out of it is refused. The directory is
//     then opened through os.Root, which refuses a symlink that escapes the
//     root, so a link swapped in after the check does not get out either.
//   - DataDir itself, or anything under it, rejected: ~/.noskills holds
//     auth.json (the PIN hash and live tokens) plus every session ledger, and
//     registering it as a project would point spec scaffolding at the daemon's
//     own credentials.
//
// The DataDir check catches a misconfiguration, not an attacker, and the
// distinction is worth stating plainly. WorkspaceRoot itself, the home
// directory by default, is still accepted, because a home directory is a
// legitimate workspace and refusing it would break real use. Such a root
// contains ~/.noskills anyway, so an agent running there reaches auth.json
// regardless. Confining what a session may read is the sandbox's job; no
// amount of path arithmetic here can substitute for it.
func (s *Server) resolveWorkspacePath(raw string) (string, error) {
	if !filepath.IsAbs(raw) {
		return "", fmt.Errorf("%w: %q", errPathRelative, raw)
	}

	rootDir, err := s.resolvedWorkspaceRoot()
	if err != nil {
		return "", err
	}

	// EvalSymlinks cleans the path and fails when it does not exist, which is
	// also the existence check the register-existing flow needs.
	resolved, err := filepath.EvalSymlinks(raw)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}

	rel, err := filepath.Rel(rootDir, resolved)
	if err != nil {
		return "", fmt.Errorf("%w: %q", errPathOutsideRoot, raw)
	}

	// Lexical, on two paths with symlinks resolved; os.Root below holds the
	// line on the filesystem.
	if !filepath.IsLocal(rel) {
		return "", fmt.Errorf("%w: %q", errPathOutsideRoot, raw)
	}

	root, err := os.OpenRoot(rootDir)
	if err != nil {
		return "", fmt.Errorf("open workspace root: %w", err)
	}
	defer root.Close() //nolint:errcheck // a directory opened for reading

	info, err := root.Stat(rel)
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

	// A DataDir that does not exist yet holds nothing to protect, and Stat
	// failing for any other reason must not silently skip the check.
	dataDirInfo, err := os.Stat(dataDir)
	if err != nil {
		if !os.IsNotExist(err) {
			return "", fmt.Errorf("stat data-dir: %w", err)
		}
	} else if underDirInRoot(dataDirInfo, root, rel) {
		return "", fmt.Errorf("%w: %q", errPathInDataDir, raw)
	}

	return filepath.Join(rootDir, rel), nil
}

// workspaceRootOrHome returns root, or the home directory when root is empty.
// Without either, a workspace cannot be registered by path; cloning by git URL
// still works.
func workspaceRootOrHome(root string) string {
	if root != "" {
		return root
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	return home
}
