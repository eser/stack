package aifx

import (
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// ErrBinaryNotFound is returned when a provider's binary cannot be located.
var ErrBinaryNotFound = errors.New("binary not found")

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

// FormatMessagesAsText converts messages and an optional system prompt into
// a plain text string.
//
// It is a lossy view and always was: non-text blocks vanish, and so does the
// boundary between who said what. It survives because an ACP prompt is content
// blocks rather than a message list, so the history still has to be flattened
// somewhere -- see ACPModel.runTurn, which is the only caller.
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

// The subprocess half of this file -- CliProcess, SpawnOptions,
// SpawnCliProcess, WaitForExit, CaptureStderr, ReadTextOutput,
// ClassifyExitCode and ErrCliExitError -- was deleted with the claude-code,
// kiro and opencode adapters that were its only callers.
//
// It is not worth reviving for the next CLI-shaped provider: it drove os/exec
// directly, without the process-group kill, WaitDelay or explicit pipe closing
// that shellfx/exec grew after those omissions were found to hang the daemon.
// Anything that needs to run a subprocess should use shellfx/exec.
