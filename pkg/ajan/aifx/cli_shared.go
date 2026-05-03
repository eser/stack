package aifx

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// Sentinel errors for CLI-based adapters.
var (
	ErrBinaryNotFound = errors.New("binary not found")
	ErrCliExitError   = errors.New("cli process exited with error")
)

// CliProcess wraps a running CLI subprocess with piped I/O.
type CliProcess struct {
	Cmd    *exec.Cmd
	Stdout io.ReadCloser
	Stderr io.ReadCloser
	Stdin  io.WriteCloser
}

// SpawnOptions configures a CLI subprocess.
type SpawnOptions struct {
	Binary    string
	Args      []string
	StdinData string // written to stdin and closed immediately; piped only when non-empty
	Env       []string
	Cwd       string
}

// ResolveBinary resolves the absolute path to a binary by name.
// Checks the "binPath" property in config first, then falls back to PATH lookup.
func ResolveBinary(name string, config *ConfigTarget) (string, error) {
	if config != nil {
		if binPath, ok := config.Properties["binPath"].(string); ok && binPath != "" {
			return binPath, nil
		}
	}

	path, err := exec.LookPath(name)
	if err != nil {
		return "", fmt.Errorf("%w: %q not found on PATH", ErrBinaryNotFound, name)
	}

	return path, nil
}

// SpawnCliProcess launches a subprocess with piped stdout and stderr.
// When SpawnOptions.StdinData is non-empty, stdin is piped and the data is
// written asynchronously then closed immediately to avoid ARG_MAX limits.
func SpawnCliProcess(ctx context.Context, opts SpawnOptions) (*CliProcess, error) {
	cmd := exec.CommandContext(ctx, opts.Binary, opts.Args...) //nolint:gosec

	if opts.Cwd != "" {
		cmd.Dir = opts.Cwd
	}

	if len(opts.Env) > 0 {
		cmd.Env = append(os.Environ(), opts.Env...)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	var stdin io.WriteCloser

	if opts.StdinData != "" {
		stdin, err = cmd.StdinPipe()
		if err != nil {
			return nil, fmt.Errorf("stdin pipe: %w", err)
		}
	}

	if err = cmd.Start(); err != nil {
		return nil, fmt.Errorf("start process: %w", err)
	}

	// Write stdin asynchronously and close immediately.
	if stdin != nil {
		go func() {
			_, _ = io.WriteString(stdin, opts.StdinData)
			_ = stdin.Close()
		}()
	}

	return &CliProcess{ //nolint:exhaustruct
		Cmd:    cmd,
		Stdout: stdout,
		Stderr: stderr,
		Stdin:  stdin,
	}, nil
}

// WaitForExit waits for the process to terminate and returns the exit code.
// A nil error is returned for all clean exits (including non-zero codes).
func (p *CliProcess) WaitForExit() (int, error) {
	err := p.Cmd.Wait()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return exitErr.ExitCode(), nil
		}

		return -1, err
	}

	return 0, nil
}

// CaptureStderr reads all remaining data from stderr and returns it trimmed.
func (p *CliProcess) CaptureStderr() string {
	data, _ := io.ReadAll(p.Stderr)

	return strings.TrimSpace(string(data))
}

// ParseJsonlStream reads a JSONL stream line by line and sends each parsed
// message to the provided event channel. Malformed lines are silently skipped.
// The channel is closed when the stream ends or an error occurs.
func ParseJsonlStream(reader io.Reader, eventCh chan<- StreamEvent, mapFn func(json.RawMessage) *StreamEvent) {
	scanner := bufio.NewScanner(reader)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// Validate as JSON before passing to mapper.
		if !json.Valid([]byte(line)) {
			continue
		}

		event := mapFn(json.RawMessage(line))
		if event != nil {
			eventCh <- *event
		}
	}
}

// ReadTextOutput reads all stdout bytes and returns them as a trimmed string.
func ReadTextOutput(reader io.Reader) (string, error) {
	var buf bytes.Buffer

	_, err := io.Copy(&buf, reader)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(buf.String()), nil
}

// ClassifyExitCode maps a process exit code to an error.
// Returns nil for code 0 (success).
// Exit codes 126/127 indicate the binary was not found or not executable.
func ClassifyExitCode(provider string, code int, stderr string) error {
	if code == 0 {
		return nil
	}

	if code == 126 || code == 127 { //nolint:mnd
		return fmt.Errorf(
			"%w: %s binary not found or not executable (exit code %d)",
			ErrBinaryNotFound, provider, code,
		)
	}

	if stderr != "" {
		return fmt.Errorf("%w: %s exited with code %d: %s", ErrCliExitError, provider, code, stderr)
	}

	return fmt.Errorf("%w: %s exited with code %d", ErrCliExitError, provider, code)
}

// FormatMessagesAsText converts messages and an optional system prompt into
// a plain text string suitable for CLI adapters that accept stdin prompts.
func FormatMessagesAsText(messages []Message, system string) string {
	var parts []string

	if system != "" {
		parts = append(parts, system)
		parts = append(parts, "")
	}

	for _, msg := range messages {
		for _, block := range msg.Content {
			if block.Type == ContentBlockText {
				parts = append(parts, block.Text)
			}
		}
	}

	return strings.Join(parts, "\n")
}
