package acpfx_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// This file pins the fs half of the client-side capability host.
//
// The jail is the only thing standing between an agent and the rest of the
// filesystem on the fs/* path -- unlike terminal/*, there is no permission
// prompt in front of it. So the escape tests here are the point of the file,
// and the happy-path tests exist mostly to prove the jail is not simply
// refusing everything.

const testSessionID = "sess-1"

// newHostSession builds a host with one registered session rooted at a fresh
// temp directory, and returns the resolved root.
//
// The root is returned resolved because macOS makes every temp path a symlink
// (/var -> /private/var): a test that compared against the unresolved path
// would be asserting the wrong string and would pass for the wrong reason.
func newHostSession(t *testing.T, extra ...string) (*acpfx.Host, string) {
	t.Helper()

	root := t.TempDir()

	host := acpfx.NewHost(acpfx.HostOptions{}) //nolint:exhaustruct
	host.SessionStarted(testSessionID, acpfx.SessionRoots{
		Cwd:                   root,
		AdditionalDirectories: extra,
	})

	t.Cleanup(host.ReleaseAll)

	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve temp root: %v", err)
	}

	return host, resolved
}

func writeFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func readFileFromHost(
	t *testing.T,
	host *acpfx.Host,
	path string,
) (*acpfx.ReadTextFileResponse, error) {
	t.Helper()

	return host.ReadTextFile(t.Context(), &acpfx.ReadTextFileRequest{ //nolint:exhaustruct
		SessionID: testSessionID,
		Path:      path,
	})
}

// TestHostDeniesPathsOutsideSessionRoots covers the escapes that need no
// filesystem trickery: the ones an agent reaches by asking.
func TestHostDeniesPathsOutsideSessionRoots(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	outside := t.TempDir()

	writeFile(t, filepath.Join(outside, "secret.txt"), "classified")

	cases := map[string]string{
		"absolute path elsewhere": filepath.Join(outside, "secret.txt"),
		"parent traversal":        filepath.Join(root, "..", "escape.txt"),
		"relative path":           "relative.txt",
		"empty path":              "",
		"the root's parent":       filepath.Dir(root),
	}

	for name, path := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			if _, err := readFileFromHost(t, host, path); err == nil {
				t.Fatalf("reading %q was allowed; it is outside the session roots", path)
			}
		})
	}
}

// TestHostDeniesSymlinkEscape is the escape a lexical path check misses.
//
// The requested path is textually inside the root -- every prefix test on the
// string passes -- and it resolves to a file that is not. Only expanding
// symlinks before comparing catches it.
func TestHostDeniesSymlinkEscape(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.txt")

	writeFile(t, secret, "classified")

	link := filepath.Join(root, "innocent.txt")
	if err := os.Symlink(secret, link); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	resp, err := readFileFromHost(t, host, link)
	if err == nil {
		t.Fatalf(
			"a symlink inside the root read %q from outside it: got %q",
			secret, resp.Content,
		)
	}

	if !errors.Is(err, acpfx.ErrPathOutsideRoots) {
		t.Fatalf("denied for the wrong reason: %v", err)
	}
}

// TestHostDeniesWriteThroughSymlinkedDirectory is the same escape on the write
// path, where the target does not exist yet.
//
// This is what resolveExisting is for: EvalSymlinks refuses a path whose last
// component is missing, so checking the full path would fail open on every
// create. The directory above it is a symlink out of the root, and that is
// what has to be caught.
func TestHostDeniesWriteThroughSymlinkedDirectory(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	outside := t.TempDir()

	link := filepath.Join(root, "docs")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	target := filepath.Join(link, "planted.txt")

	_, err := host.WriteTextFile(t.Context(), &acpfx.WriteTextFileRequest{
		SessionID: testSessionID,
		Path:      target,
		Content:   "owned",
	})
	if err == nil {
		t.Fatal("a write through a symlinked directory escaped the session roots")
	}

	if _, statErr := os.Stat(filepath.Join(outside, "planted.txt")); statErr == nil {
		t.Fatal("the file was created outside the roots")
	}
}

// TestHostDeniesUnregisteredSession pins the fail-closed default.
//
// A session id the host was never told about must be refused outright. The
// tempting alternative -- fall back to the process working directory -- would
// silently grant the agent whatever directory the daemon happened to start in.
func TestHostDeniesUnregisteredSession(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	path := filepath.Join(root, "readable.txt")

	writeFile(t, path, "hello")

	_, err := host.ReadTextFile(t.Context(), &acpfx.ReadTextFileRequest{ //nolint:exhaustruct
		SessionID: "never-registered",
		Path:      path,
	})
	if err == nil {
		t.Fatal("an unregistered session was served")
	}

	if !errors.Is(err, acpfx.ErrNoSessionRoots) {
		t.Fatalf("denied for the wrong reason: %v", err)
	}
}

// TestHostAllowsAdditionalDirectories proves the jail is scoped to every root,
// not just the cwd.
func TestHostAllowsAdditionalDirectories(t *testing.T) {
	t.Parallel()

	extra := t.TempDir()
	host, _ := newHostSession(t, extra)

	path := filepath.Join(extra, "shared.txt")
	writeFile(t, path, "shared")

	resp, err := readFileFromHost(t, host, path)
	if err != nil {
		t.Fatalf("read from an additional directory: %v", err)
	}

	if resp.Content != "shared" {
		t.Fatalf("content = %q, want %q", resp.Content, "shared")
	}
}

// TestHostReadsWholeFileVerbatim pins that a plain read is byte-exact,
// including the absence of a trailing newline.
func TestHostReadsWholeFileVerbatim(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)

	for name, content := range map[string]string{
		"trailing newline":    "alpha\nbeta\n",
		"no trailing newline": "alpha\nbeta",
		"empty":               "",
		"blank lines":         "\n\n\n",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			path := filepath.Join(root, strings.ReplaceAll(name, " ", "-")+".txt")
			writeFile(t, path, content)

			resp, err := readFileFromHost(t, host, path)
			if err != nil {
				t.Fatalf("read: %v", err)
			}

			if resp.Content != content {
				t.Fatalf("content = %q, want %q", resp.Content, content)
			}
		})
	}
}

// TestHostReadsLineRange pins line/limit, including the two boundary meanings
// the schema encodes as null-versus-zero.
func TestHostReadsLineRange(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	path := filepath.Join(root, "lines.txt")

	writeFile(t, path, "one\ntwo\nthree\nfour\n")

	line := func(n int) *int { return &n }

	cases := []struct {
		line  *int
		limit *int
		name  string
		want  string
	}{
		{name: "whole file", line: nil, limit: nil, want: "one\ntwo\nthree\nfour\n"},
		{name: "from line 2", line: line(2), limit: nil, want: "two\nthree\nfour\n"},
		{name: "two lines from 2", line: line(2), limit: line(2), want: "two\nthree\n"},
		{name: "limit past the end", line: line(3), limit: line(99), want: "three\nfour\n"},
		{name: "start past the end", line: line(99), limit: nil, want: ""},

		// An absent limit is "the whole file"; a zero limit is "no lines".
		// Collapsing the two would make a request for nothing return
		// everything, which on a large file is the opposite of what was asked.
		{name: "zero limit", line: nil, limit: line(0), want: ""},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			resp, err := host.ReadTextFile(t.Context(), &acpfx.ReadTextFileRequest{
				SessionID: testSessionID,
				Path:      path,
				Line:      testCase.line,
				Limit:     testCase.limit,
			})
			if err != nil {
				t.Fatalf("read: %v", err)
			}

			if resp.Content != testCase.want {
				t.Fatalf("content = %q, want %q", resp.Content, testCase.want)
			}
		})
	}
}

// TestHostRejectsOversizeRead pins that a file over the cap is an error, not a
// silent truncation.
//
// A shortened read is indistinguishable from a short file. An agent that edits
// on the strength of one deletes everything it could not see, so the failure
// has to be loud.
func TestHostRejectsOversizeRead(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	host := acpfx.NewHost(acpfx.HostOptions{MaxReadBytes: 64}) //nolint:exhaustruct
	host.SessionStarted(testSessionID, acpfx.SessionRoots{Cwd: root, AdditionalDirectories: nil})

	path := filepath.Join(root, "big.txt")
	writeFile(t, path, strings.Repeat("x\n", 200))

	_, err := readFileFromHost(t, host, path)
	if err == nil {
		t.Fatal("a file over the read cap was returned")
	}

	if !errors.Is(err, acpfx.ErrFileTooLarge) {
		t.Fatalf("failed for the wrong reason: %v", err)
	}

	// The cap is on the response, not the file: a bounded range still works.
	limit := 3

	resp, err := host.ReadTextFile(t.Context(), &acpfx.ReadTextFileRequest{ //nolint:exhaustruct
		SessionID: testSessionID,
		Path:      path,
		Limit:     &limit,
	})
	if err != nil {
		t.Fatalf("bounded read of the same file: %v", err)
	}

	if resp.Content != "x\nx\nx\n" {
		t.Fatalf("content = %q", resp.Content)
	}
}

// TestHostRejectsNonRegularFile keeps directories and fifos off the read path:
// one returns platform-dependent garbage, the other blocks forever.
func TestHostRejectsNonRegularFile(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)

	dir := filepath.Join(root, "subdir")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	if _, err := readFileFromHost(t, host, dir); err == nil {
		t.Fatal("reading a directory was allowed")
	}
}

// TestHostWriteCreatesParentDirectories pins that a new file in a new
// subdirectory works, since ACP has no mkdir method to do it beforehand.
func TestHostWriteCreatesParentDirectories(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	target := filepath.Join(root, "src", "deep", "new.ts")

	if _, err := host.WriteTextFile(t.Context(), &acpfx.WriteTextFileRequest{
		SessionID: testSessionID,
		Path:      target,
		Content:   "export const x = 1\n",
	}); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := os.ReadFile(target) //nolint:gosec // a path this test just built
	if err != nil {
		t.Fatalf("read back: %v", err)
	}

	if string(got) != "export const x = 1\n" {
		t.Fatalf("content = %q", got)
	}
}

// TestHostWritePreservesFileMode pins that editing a script leaves it
// executable. os.WriteFile applies its mode only on create, which is the
// behaviour being relied on -- this test is what would notice if the write
// path changed to something that recreates the file.
func TestHostWritePreservesFileMode(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	script := filepath.Join(root, "run.sh")

	if err := os.WriteFile(script, []byte("#!/bin/sh\necho old\n"), 0o755); err != nil {
		t.Fatalf("seed script: %v", err)
	}

	if _, err := host.WriteTextFile(t.Context(), &acpfx.WriteTextFileRequest{
		SessionID: testSessionID,
		Path:      script,
		Content:   "#!/bin/sh\necho new\n",
	}); err != nil {
		t.Fatalf("write: %v", err)
	}

	info, err := os.Stat(script)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	if info.Mode().Perm()&0o111 == 0 {
		t.Fatalf("the executable bit was lost: mode = %v", info.Mode().Perm())
	}
}

// ---------------------------------------------------------------------------
// Over the wire
// ---------------------------------------------------------------------------

// hostClient is a ClientHandler that gains fs/* and terminal/* by embedding.
type hostClient struct {
	*acpfx.Host
}

func (c *hostClient) RequestPermission(
	_ context.Context,
	_ *acpfx.RequestPermissionRequest,
) (acpfx.PermissionOutcome, error) {
	return acpfx.CancelPermission(), nil
}

func (c *hostClient) SessionUpdate(_ context.Context, _ *acpfx.SessionNotification) {}

// TestClientAdvertisesWhatTheHostServes pins the derivation that keeps
// initialize honest.
//
// Advertising a capability we do not serve makes the agent call a method we
// answer with "method not found" mid-turn, which surfaces as an agent bug. The
// capability set is computed from the handler's interfaces for exactly that
// reason, and this asserts embedding a Host is enough to turn both on.
func TestClientAdvertisesWhatTheHostServes(t *testing.T) {
	t.Parallel()

	seen := make(chan acpfx.ClientCapabilities, 1)

	agent := &scriptedAgent{ //nolint:exhaustruct
		cancelCh: make(chan string, 1),
		onInitialize: func(req *acpfx.InitializeRequest) {
			seen <- req.ClientCapabilities
		},
	}

	handler := &hostClient{Host: acpfx.NewHost(acpfx.HostOptions{})} //nolint:exhaustruct
	t.Cleanup(handler.ReleaseAll)

	connectHandler(t, handler, agent)

	caps := <-seen

	if !caps.Fs.ReadTextFile || !caps.Fs.WriteTextFile {
		t.Fatalf("fs capability not advertised: %+v", caps.Fs)
	}

	if !caps.Terminal {
		t.Fatal("terminal capability not advertised")
	}
}

// TestSessionRootsReachTheHostBeforeNewSessionReturns is the wiring test.
//
// Nothing in the caller's code registers roots: the client tells the handler
// as part of creating the session. If that call were moved after the session
// was published -- or dropped -- this read would be denied.
func TestSessionRootsReachTheHostBeforeNewSessionReturns(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, filepath.Join(root, "note.txt"), "from the workspace")

	agent := &scriptedAgent{cancelCh: make(chan string, 1)} //nolint:exhaustruct
	handler := &hostClient{Host: acpfx.NewHost(acpfx.HostOptions{})}
	t.Cleanup(handler.ReleaseAll)

	connected, served := connectHandler(t, handler, agent)

	session, err := connected.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: root,
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	// The agent calls back into us, over the same pipe, using the typed path.
	resp, err := served.ReadTextFile(t.Context(), &acpfx.ReadTextFileRequest{ //nolint:exhaustruct
		SessionID: session.ID(),
		Path:      filepath.Join(root, "note.txt"),
	})
	if err != nil {
		t.Fatalf("agent-initiated fs/read_text_file: %v", err)
	}

	if resp.Content != "from the workspace" {
		t.Fatalf("content = %q", resp.Content)
	}
}

// TestJailViolationIsInvalidParamsOverTheWire pins the error code.
//
// -32603 "internal error" invites the agent to retry, because it describes a
// fault on our side. A path outside the workspace is not that: the request was
// wrong and will be wrong again, which is what -32602 says.
func TestJailViolationIsInvalidParamsOverTheWire(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	outside := t.TempDir()

	writeFile(t, filepath.Join(outside, "secret.txt"), "classified")

	agent := &scriptedAgent{cancelCh: make(chan string, 1)} //nolint:exhaustruct
	handler := &hostClient{Host: acpfx.NewHost(acpfx.HostOptions{})}
	t.Cleanup(handler.ReleaseAll)

	connected, served := connectHandler(t, handler, agent)

	session, err := connected.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: root,
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	_, err = served.ReadTextFile(t.Context(), &acpfx.ReadTextFileRequest{ //nolint:exhaustruct
		SessionID: session.ID(),
		Path:      filepath.Join(outside, "secret.txt"),
	})
	if err == nil {
		t.Fatal("the agent read a file outside the session roots")
	}

	var rpcErr *acpfx.Error
	if !errors.As(err, &rpcErr) {
		t.Fatalf("error did not carry a JSON-RPC code: %v", err)
	}

	if rpcErr.Code != acpfx.CodeInvalidParams {
		t.Fatalf("code = %d, want %d (invalid params)", rpcErr.Code, acpfx.CodeInvalidParams)
	}
}
