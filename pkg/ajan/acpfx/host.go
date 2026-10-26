package acpfx

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Sentinel errors for the client-side capability host.
var (
	ErrNoSessionRoots   = errors.New("acp host: session has no registered roots")
	ErrPathNotAbsolute  = errors.New("acp host: path must be absolute")
	ErrPathOutsideRoots = errors.New("acp host: path is outside the session roots")
	ErrNotRegularFile   = errors.New("acp host: not a regular file")
	ErrFileTooLarge     = errors.New("acp host: file exceeds the read limit")
	ErrNoSuchTerminal   = errors.New("acp host: no such terminal")
	ErrTooManyTerminals = errors.New("acp host: terminal limit reached")
)

// Host defaults. Each is a guard against a runaway agent rather than a policy:
// they are sized so that no plausible legitimate request hits them.
const (
	defaultMaxReadBytes    = 8 << 20 // 8 MiB
	defaultOutputByteLimit = 1 << 20 // 1 MiB
	defaultMaxTerminals    = 32
)

// HostOptions configures a Host. The zero value is valid; every field falls
// back to a default.
type HostOptions struct {
	// MaxReadBytes caps a single fs/read_text_file response. Exceeding it is an
	// error rather than a truncation: a silently shortened file read is
	// indistinguishable from a short file, and an agent that edits based on one
	// will delete whatever it could not see.
	MaxReadBytes int

	// OutputByteLimit caps retained terminal output when the agent does not
	// specify a limit of its own.
	OutputByteLimit int

	// MaxTerminals caps concurrently live terminals per session.
	MaxTerminals int
}

// Host serves the client side of ACP: fs/* and terminal/*.
//
// Embed it in a ClientHandler to gain both capabilities. Because Client derives
// what it advertises in initialize from the handler's interfaces, embedding is
// also what declares them -- there is no second place to keep in sync.
//
//	type handler struct {
//		*acpfx.Host
//	}
//
// # What the jail does and does not do
//
// fs/* is confined to the session's cwd plus its additionalDirectories,
// resolved through symlinks. This is a real boundary: the agent has no other
// way to reach the filesystem through fs/*.
//
// terminal/* is not confined, and cannot be. The agent supplies a command that
// runs with this process's privileges; a cwd inside the roots does not stop
// `cat /etc/passwd`. ACP's gate for that is session/request_permission, which
// the *caller's* handler serves. Do not read the fs jail as sandboxing the
// terminal.
type Host struct {
	opts HostOptions

	mu sync.Mutex
	// roots maps a session id to its resolved, symlink-free root directories.
	// A session absent from this map is denied, which is what makes an
	// unregistered session fail closed rather than default to the process cwd.
	roots     map[string][]string
	terminals map[string]*terminal
	nextID    uint64
}

// NewHost builds a Host, filling in defaults for any unset option.
func NewHost(opts HostOptions) *Host {
	if opts.MaxReadBytes <= 0 {
		opts.MaxReadBytes = defaultMaxReadBytes
	}

	if opts.OutputByteLimit <= 0 {
		opts.OutputByteLimit = defaultOutputByteLimit
	}

	if opts.MaxTerminals <= 0 {
		opts.MaxTerminals = defaultMaxTerminals
	}

	return &Host{ //nolint:exhaustruct
		opts:      opts,
		roots:     make(map[string][]string),
		terminals: make(map[string]*terminal),
	}
}

// SessionStarted records the directories a session may touch.
//
// Client calls this for every session it creates or loads, before the session
// is returned to the caller, so the roots are in place before the agent can
// send its first fs request.
func (h *Host) SessionStarted(sessionID string, roots SessionRoots) {
	dirs := make([]string, 0, 1+len(roots.AdditionalDirectories))

	for _, dir := range append([]string{roots.Cwd}, roots.AdditionalDirectories...) {
		if dir == "" {
			continue
		}

		// Resolve at registration so the comparison in resolveWithin is
		// symlink-free on both sides. On macOS this is load-bearing rather than
		// defensive: /tmp and /var are themselves symlinks, so an unresolved
		// root would reject every path under a temp directory.
		resolved, err := filepath.EvalSymlinks(dir)
		if err != nil {
			// A root that does not exist yet stays unresolved. Any real path
			// under it will resolve to something else and be denied, which is
			// the safe direction to fail.
			resolved = filepath.Clean(dir)
		}

		dirs = append(dirs, resolved)
	}

	h.mu.Lock()
	h.roots[sessionID] = dirs
	h.mu.Unlock()
}

// sessionRoots returns a session's roots, or an error if it has none.
func (h *Host) sessionRoots(sessionID string) ([]string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	dirs, ok := h.roots[sessionID]
	if !ok || len(dirs) == 0 {
		return nil, fmt.Errorf("%w: %w: %q", ErrInvalidParams, ErrNoSessionRoots, sessionID)
	}

	return dirs, nil
}

// resolve maps a request path to a real path inside the session's roots.
func (h *Host) resolve(sessionID string, path string) (string, error) {
	dirs, err := h.sessionRoots(sessionID)
	if err != nil {
		return "", err
	}

	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%w: %w: %q", ErrInvalidParams, ErrPathNotAbsolute, path)
	}

	real := resolveExisting(filepath.Clean(path))

	for _, dir := range dirs {
		if real == dir || strings.HasPrefix(real, dir+string(filepath.Separator)) {
			return real, nil
		}
	}

	return "", fmt.Errorf("%w: %w: %q", ErrInvalidParams, ErrPathOutsideRoots, path)
}

// resolveExisting expands symlinks as far down the path as it exists, then
// rejoins the components that do not.
//
// EvalSymlinks fails outright when the last component is missing, which is the
// normal case for a write that creates a file -- so checking the raw path
// would either reject every create or skip the symlink check entirely.
// Resolving the deepest existing ancestor keeps the check meaningful: a
// component that does not exist cannot be a symlink, so it cannot redirect
// anywhere.
//
// This leaves a TOCTOU window: a symlink planted between this check and the
// open would not be seen. Closing it fully needs openat2/O_BENEATH, which Go
// does not portably expose. Stated rather than papered over -- the agent is a
// local process we launched, not an untrusted remote.
func resolveExisting(path string) string {
	var missing []string

	current := path

	for {
		if resolved, err := filepath.EvalSymlinks(current); err == nil {
			return filepath.Join(append([]string{resolved}, missing...)...)
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached the filesystem root without resolving anything.
			return path
		}

		missing = append([]string{filepath.Base(current)}, missing...)
		current = parent
	}
}

// ---------------------------------------------------------------------------
// fs/*
// ---------------------------------------------------------------------------

// ReadTextFile serves fs/read_text_file.
func (h *Host) ReadTextFile(
	_ context.Context,
	req *ReadTextFileRequest,
) (*ReadTextFileResponse, error) {
	target, err := h.resolve(req.SessionID, req.Path)
	if err != nil {
		return nil, err
	}

	file, err := os.Open(target) //nolint:gosec // confined to the session roots above
	if err != nil {
		return nil, fmt.Errorf("fs/read_text_file: %w", err)
	}

	defer func() { _ = file.Close() }()

	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("fs/read_text_file: %w", err)
	}

	// A directory read returns garbage on some platforms and an error on
	// others; a fifo blocks forever. Neither is a text file.
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("%w: %w: %q", ErrInvalidParams, ErrNotRegularFile, req.Path)
	}

	start := 1
	if req.Line != nil && *req.Line > 1 {
		start = *req.Line
	}

	limit := -1
	if req.Limit != nil {
		limit = *req.Limit
	}

	content, err := readSlice(bufio.NewReader(file), start, limit, h.opts.MaxReadBytes)
	if err != nil {
		return nil, err
	}

	return &ReadTextFileResponse{Content: content}, nil
}

// readSlice returns the requested line range with terminators intact.
//
// Splitting on newlines and rejoining would silently add a trailing newline to
// a file that had none, or drop one that did. For a file the agent is about to
// write back, that is a real edit nobody asked for.
func readSlice(reader *bufio.Reader, start int, limit int, maxBytes int) (string, error) {
	var out strings.Builder

	// limit < 0 means unlimited; limit == 0 means the agent asked for no lines.
	for line := 1; limit != 0; line++ {
		chunk, err := reader.ReadString('\n')

		if line >= start && chunk != "" {
			if out.Len()+len(chunk) > maxBytes {
				return "", fmt.Errorf(
					"%w: over %d bytes -- request a line range instead",
					ErrFileTooLarge, maxBytes,
				)
			}

			out.WriteString(chunk)

			if limit > 0 {
				limit--
			}
		}

		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}

			return "", fmt.Errorf("fs/read_text_file: %w", err)
		}
	}

	return out.String(), nil
}

// WriteTextFile serves fs/write_text_file.
func (h *Host) WriteTextFile(
	_ context.Context,
	req *WriteTextFileRequest,
) (*WriteTextFileResponse, error) {
	target, err := h.resolve(req.SessionID, req.Path)
	if err != nil {
		return nil, err
	}

	// Creating parent directories is what makes "write src/new/thing.ts" work
	// without a preceding mkdir the protocol has no method for. The parent of a
	// path inside a root is itself inside that root, so this cannot escape.
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return nil, fmt.Errorf("fs/write_text_file: %w", err)
	}

	// The mode applies only when creating; an existing file keeps its own,
	// which is what preserves the executable bit on a script the agent edits.
	if err := os.WriteFile(target, []byte(req.Content), 0o644); err != nil { //nolint:gosec
		return nil, fmt.Errorf("fs/write_text_file: %w", err)
	}

	return &WriteTextFileResponse{}, nil
}
