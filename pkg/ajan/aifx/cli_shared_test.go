package aifx

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// ─── cross-platform test helpers ─────────────────────────────────────────────
//
// The CLI adapters spawn real subprocesses. The tests below originally hardcoded
// Unix binaries (/bin/sh, /usr/bin/true) and Unix shell syntax (echo $VAR, cat,
// pwd, >&2). These helpers produce the equivalent command for the host OS so the
// tests exercise the same subprocess-lifecycle paths on Windows, Linux and macOS.

// shellBinary returns the path to the system shell interpreter.
func shellBinary() string {
	if runtime.GOOS == "windows" {
		return "cmd"
	}

	return "/bin/sh"
}

// shellArgs wraps a shell script in the host shell's "run this command" flags.
func shellArgs(script string) []string {
	if runtime.GOOS == "windows" {
		return []string{"/c", script}
	}

	return []string{"-c", script}
}

// unixTruePath is /usr/bin/true: a binary that ignores all args and stdin,
// writes nothing to stdout, and exits 0. The model adapters' buildArgs prepend
// provider flags (e.g. --output json --model X), so the success-path tests need
// a binary that tolerates arbitrary trailing arguments and still exits 0.
const unixTruePath = "/usr/bin/true"

// skipIfNoUnixTrue skips the calling test on Windows, where there is no clean
// analog of /usr/bin/true: .bat/.cmd files cannot be executed directly via
// CreateProcess, and no shipped .exe swallows unknown flags (the production
// buildArgs prepends them) and exits 0. The test still runs fully on Unix CI.
func skipIfNoUnixTrue(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("no Windows analog of /usr/bin/true: cannot ignore prepended provider flags and exit 0")
	}
}

// echoScript builds a shell script that prints the given text on its own line.
// On Windows cmd, single quotes are literal, so the Unix `echo 'x'` form would
// emit the quotes; this helper emits the text unquoted.
func echoScript(text string) string {
	if runtime.GOOS == "windows" {
		return "echo " + text
	}

	return "echo '" + text + "'"
}

// catBinary / catArgs spawn a process that copies stdin to stdout verbatim,
// the cross-platform stand-in for Unix `cat`.
//   - Unix: /bin/sh -c "cat"
//   - Windows: findstr "^"  (matches every line and echoes it to stdout)
func catBinary() string {
	if runtime.GOOS == "windows" {
		return "findstr"
	}

	return "/bin/sh"
}

func catArgs() []string {
	if runtime.GOOS == "windows" {
		return []string{"^"}
	}

	return []string{"-c", "cat"}
}

// printFileCommand writes content (a trailing newline is added) to a file in
// t.TempDir() and returns a binary+args that print that file verbatim to
// stdout. Printing from a file — rather than echoing the payload as a shell
// argument — avoids per-shell quoting differences, which matters for JSON
// payloads whose double quotes would otherwise be mangled by Go's CreateProcess
// argument escaping interacting with cmd.exe's own parsing.
//   - Unix: cat <file>
//   - Windows: cmd /c type <file>
func printFileCommand(t *testing.T, content string) (string, []string) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "payload.txt")
	if err := os.WriteFile(path, []byte(content+"\n"), 0o600); err != nil {
		t.Fatalf("write payload file: %v", err)
	}

	if runtime.GOOS == "windows" {
		return "cmd", []string{"/c", "type", path}
	}

	return "cat", []string{path}
}

// echoEnvScript builds a shell script that prints the value of the named
// environment variable (sh: $NAME, cmd: %NAME%).
func echoEnvScript(name string) string {
	if runtime.GOOS == "windows" {
		return "echo %" + name + "%"
	}

	return "echo $" + name
}

// printCwdScript builds a shell script that prints the working directory
// (sh: pwd, cmd: cd with no args prints the current directory).
func printCwdScript() string {
	if runtime.GOOS == "windows" {
		return "cd"
	}

	return "pwd"
}

// stderrAndFailScript builds a shell script that writes the given text to
// stderr and exits with a non-zero status.
//   - sh:  echo 'text' >&2; exit 1
//   - cmd: echo text 1>&2& exit 1
func stderrAndFailScript(text string) string {
	if runtime.GOOS == "windows" {
		return "echo " + text + " 1>&2& exit 1"
	}

	return "echo '" + text + "' >&2; exit 1"
}

func TestClassifyExitCode(t *testing.T) {
	t.Parallel()

	t.Run("zero exit is nil", func(t *testing.T) {
		t.Parallel()

		if err := ClassifyExitCode("test", 0, ""); err != nil {
			t.Errorf("expected nil, got %v", err)
		}
	})

	t.Run("126 maps to ErrBinaryNotFound", func(t *testing.T) {
		t.Parallel()

		err := ClassifyExitCode("myprovider", 126, "")
		if err == nil {
			t.Fatal("expected error")
		}

		if !isErrBinaryNotFound(err) {
			t.Errorf("expected ErrBinaryNotFound in chain, got %v", err)
		}
	})

	t.Run("127 maps to ErrBinaryNotFound", func(t *testing.T) {
		t.Parallel()

		err := ClassifyExitCode("myprovider", 127, "")
		if !isErrBinaryNotFound(err) {
			t.Errorf("expected ErrBinaryNotFound in chain, got %v", err)
		}
	})

	t.Run("non-zero with stderr", func(t *testing.T) {
		t.Parallel()

		err := ClassifyExitCode("myprovider", 1, "some error message")
		if err == nil {
			t.Fatal("expected error")
		}

		if !isErrCliExitError(err) {
			t.Errorf("expected ErrCliExitError in chain, got %v", err)
		}
	})

	t.Run("non-zero without stderr", func(t *testing.T) {
		t.Parallel()

		err := ClassifyExitCode("myprovider", 2, "")
		if !isErrCliExitError(err) {
			t.Errorf("expected ErrCliExitError, got %v", err)
		}
	})
}

func isErrBinaryNotFound(err error) bool { return errors.Is(err, ErrBinaryNotFound) }
func isErrCliExitError(err error) bool   { return errors.Is(err, ErrCliExitError) }

func TestFormatMessagesAsText(t *testing.T) {
	t.Parallel()

	t.Run("messages only", func(t *testing.T) {
		t.Parallel()

		msgs := []Message{
			NewTextMessage(RoleUser, "hello"),
			NewTextMessage(RoleAssistant, "world"),
		}

		got := FormatMessagesAsText(msgs, "")
		if got != "hello\nworld" {
			t.Errorf("unexpected output: %q", got)
		}
	})

	t.Run("with system prompt", func(t *testing.T) {
		t.Parallel()

		msgs := []Message{NewTextMessage(RoleUser, "hi")}
		got := FormatMessagesAsText(msgs, "you are helpful")

		if got != "you are helpful\n\nhi" {
			t.Errorf("unexpected output: %q", got)
		}
	})

	t.Run("non-text blocks skipped", func(t *testing.T) {
		t.Parallel()

		msgs := []Message{
			{
				Role: RoleUser,
				Content: []ContentBlock{
					{Type: ContentBlockImage, Image: &ImagePart{URL: "https://example.com/img.jpg"}},
					{Type: ContentBlockText, Text: "describe this"},
				},
			},
		}

		got := FormatMessagesAsText(msgs, "")
		if got != "describe this" {
			t.Errorf("unexpected output: %q", got)
		}
	})

	t.Run("empty messages and no system", func(t *testing.T) {
		t.Parallel()

		got := FormatMessagesAsText([]Message{}, "")
		if got != "" {
			t.Errorf("expected empty string, got %q", got)
		}
	})
}

func TestParseJsonlStream(t *testing.T) {
	t.Parallel()

	t.Run("valid JSONL lines emit events", func(t *testing.T) {
		t.Parallel()

		input := `{"text":"hello"}
{"text":"world"}
`
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(reader, ch, func(raw json.RawMessage) *StreamEvent {
			var m map[string]string
			_ = json.Unmarshal(raw, &m)

			return &StreamEvent{Type: StreamEventContentDelta, TextDelta: m["text"]}
		})

		close(ch)

		var deltas []string
		for ev := range ch {
			deltas = append(deltas, ev.TextDelta)
		}

		if len(deltas) != 2 || deltas[0] != "hello" || deltas[1] != "world" {
			t.Errorf("unexpected deltas: %v", deltas)
		}
	})

	t.Run("malformed lines are skipped", func(t *testing.T) {
		t.Parallel()

		input := "not json\n{\"text\":\"ok\"}\n"
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(reader, ch, func(raw json.RawMessage) *StreamEvent {
			var m map[string]string
			_ = json.Unmarshal(raw, &m)

			ev := StreamEvent{Type: StreamEventContentDelta, TextDelta: m["text"]}

			return &ev
		})

		close(ch)

		var count int
		for range ch {
			count++
		}

		if count != 1 {
			t.Errorf("expected 1 valid event, got %d", count)
		}
	})

	t.Run("nil return from mapper is skipped", func(t *testing.T) {
		t.Parallel()

		input := "{\"skip\":true}\n"
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(reader, ch, func(_ json.RawMessage) *StreamEvent {
			return nil
		})

		close(ch)

		if len(ch) != 0 {
			t.Errorf("expected 0 events for nil mapper return, got %d", len(ch))
		}
	})

	t.Run("empty lines are skipped", func(t *testing.T) {
		t.Parallel()

		input := "\n\n{\"text\":\"x\"}\n\n"
		reader := bytes.NewBufferString(input)
		ch := make(chan StreamEvent, 10)

		ParseJsonlStream(reader, ch, func(raw json.RawMessage) *StreamEvent {
			var m map[string]string
			_ = json.Unmarshal(raw, &m)

			ev := StreamEvent{TextDelta: m["text"]}

			return &ev
		})

		close(ch)

		if len(ch) != 1 {
			t.Errorf("expected 1 event, got %d", len(ch))
		}
	})
}

func TestReadTextOutput(t *testing.T) {
	t.Parallel()

	t.Run("trims whitespace", func(t *testing.T) {
		t.Parallel()

		reader := bytes.NewBufferString("  hello world  \n")
		text, err := ReadTextOutput(reader)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if text != "hello world" {
			t.Errorf("expected 'hello world', got %q", text)
		}
	})

	t.Run("empty input returns empty string", func(t *testing.T) {
		t.Parallel()

		reader := bytes.NewBufferString("")
		text, err := ReadTextOutput(reader)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if text != "" {
			t.Errorf("expected empty, got %q", text)
		}
	})
}

func TestResolveBinary_FromConfig(t *testing.T) {
	t.Parallel()

	config := &ConfigTarget{
		Properties: map[string]any{
			"binPath": "/usr/local/bin/myprog",
		},
	}

	path, err := ResolveBinary("myprog", config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if path != "/usr/local/bin/myprog" {
		t.Errorf("expected /usr/local/bin/myprog, got %q", path)
	}
}

func TestResolveBinary_NotFound(t *testing.T) {
	t.Parallel()

	_, err := ResolveBinary("this-binary-does-not-exist-9876", nil)
	if err == nil {
		t.Fatal("expected error for missing binary")
	}

	if !isErrBinaryNotFound(err) {
		t.Errorf("expected ErrBinaryNotFound, got %v", err)
	}
}

func TestResolveBinary_FromPath(t *testing.T) {
	t.Parallel()

	// "sh" exists on all POSIX systems; "cmd" is always on PATH on Windows.
	name := "sh"
	if runtime.GOOS == "windows" {
		name = "cmd"
	}

	path, err := ResolveBinary(name, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if path == "" {
		t.Errorf("expected non-empty path for %q", name)
	}
}
