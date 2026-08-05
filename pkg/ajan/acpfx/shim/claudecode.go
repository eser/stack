// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package shim

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// ErrClaudeCode wraps failures from the claude CLI itself.
var ErrClaudeCode = errors.New("claude-code")

// DefaultClaudeCommand is the vendor binary this backend drives.
const DefaultClaudeCommand = "claude"

// ClaudeCode drives the Claude Code CLI in its bidirectional stream-json mode.
//
// The prompt goes in on stdin as a JSON message rather than as argv, which is
// what makes this safe for prompts of any size: the argv path every ad-hoc
// shell-out in this repo uses is bounded by ARG_MAX.
type ClaudeCode struct {
	// Command overrides the binary. Empty means DefaultClaudeCommand.
	Command string

	// ExtraArgs are appended to the invocation, for flags this backend does not
	// model (--model, --permission-mode, ...).
	ExtraArgs []string
}

// Name implements Backend.
func (c *ClaudeCode) Name() string { return "claude-code" }

// Capabilities implements Backend.
//
// loadSession is false: --resume needs the vendor session id, which the shim
// only learns after a first turn, so a cold resume cannot be honoured. Saying
// so here is the protocol-native way to represent the gap.
func (c *ClaudeCode) Capabilities() acpfx.AgentCapabilities {
	return acpfx.AgentCapabilities{
		LoadSession: false,
		Prompt: acpfx.PromptCapabilities{ //nolint:exhaustruct
			EmbeddedContext: true,
		},
	}
}

func (c *ClaudeCode) command() string {
	if c.Command != "" {
		return c.Command
	}

	return DefaultClaudeCommand
}

// args builds the invocation.
//
// --verbose is required alongside --output-format stream-json; without it the
// CLI rejects the combination. --resume carries the conversation forward when
// a previous turn reported a session id.
func (c *ClaudeCode) args(vendorSessionID string) []string {
	args := []string{
		"--print",
		"--input-format", "stream-json",
		"--output-format", "stream-json",
		"--verbose",
	}

	if vendorSessionID != "" {
		args = append(args, "--resume", vendorSessionID)
	}

	return append(args, c.ExtraArgs...)
}

// RunTurn implements Backend.
func (c *ClaudeCode) RunTurn(
	ctx context.Context,
	turn *Turn,
) (acpfx.StopReason, string, error) {
	outcome, err := runVendorTurn(ctx, vendorInvocation{
		sentinel: ErrClaudeCode,
		command:  c.command(),
		args:     c.args(turn.VendorSessionID),
		cwd:      turn.Cwd,
		writeStdin: func(stdin io.Writer) error {
			return writeUserMessage(stdin, turn.Prompt)
		},
		drain: func(ctx context.Context, stdout io.Reader) (turnOutcome, error) {
			return c.drain(ctx, stdout, turn)
		},
	})
	if err != nil {
		return "", "", err
	}

	return outcome.reason, outcome.vendorID, nil
}

// drain reads the CLI's stream-json output and translates it to session/update.
//
// A json.Decoder rather than the line reader the JSONL backends use: stream-json
// is a concatenation of JSON values, and the decoder handles one that spans
// lines.
func (c *ClaudeCode) drain(
	ctx context.Context,
	stdout io.Reader,
	turn *Turn,
) (turnOutcome, error) {
	decoder := json.NewDecoder(stdout)

	outcome := newTurnOutcome()

	for {
		// Cancellation is checked between events rather than mid-read: killing
		// the CLI is what actually stops it, and Close does that on the way out.
		if ctx.Err() != nil {
			outcome.reason = acpfx.StopReasonCancelled

			return outcome, nil
		}

		var event claudeEvent

		if err := decoder.Decode(&event); err != nil {
			if errors.Is(err, io.EOF) {
				return outcome, nil
			}

			if ctx.Err() != nil {
				outcome.reason = acpfx.StopReasonCancelled

				return outcome, nil
			}

			return outcome, fmt.Errorf("decode stream-json: %w", err)
		}

		if event.SessionID != "" {
			outcome.vendorID = event.SessionID
		}

		if event.Type == claudeEventResult {
			outcome.reason = mapResultSubtype(event.Subtype)
			outcome.sawResult = true
		}

		if err := emitClaudeEvent(turn, &event); err != nil {
			return outcome, err
		}
	}
}

// Claude Code stream-json event types this backend acts on.
const (
	claudeEventSystem    = "system"
	claudeEventAssistant = "assistant"
	claudeEventResult    = "result"
	claudeEventError     = "error"
)

// claudeEvent is one line of the CLI's stream-json output.
//
// Only the fields the translation needs are modelled; the format carries more,
// and ignoring the rest is what keeps this from breaking on a point release.
type claudeEvent struct {
	Type      string `json:"type"`
	Subtype   string `json:"subtype"`
	SessionID string `json:"session_id"`

	Message struct {
		Content []claudeContent `json:"content"`
	} `json:"message"`

	// Result is the final answer on a result event.
	Result string `json:"result"`
}

type claudeContent struct {
	Type  string          `json:"type"`
	Text  string          `json:"text"`
	ID    string          `json:"id"`
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

// mapResultSubtype translates the CLI's result subtype to an ACP stop reason.
//
// The vendor has no analogue for refusal or max_turn_requests, so anything
// unrecognised maps to end_turn rather than being invented.
func mapResultSubtype(subtype string) acpfx.StopReason {
	switch subtype {
	case "success":
		return acpfx.StopReasonEndTurn
	case "error_max_turns":
		return acpfx.StopReasonMaxTurnRequests
	case "error_max_tokens":
		return acpfx.StopReasonMaxTokens
	default:
		return acpfx.StopReasonEndTurn
	}
}

// emitClaudeEvent streams one vendor event as ACP session/updates.
func emitClaudeEvent(turn *Turn, event *claudeEvent) error {
	switch event.Type {
	case claudeEventAssistant:
		return emitAssistantContent(turn, event.Message.Content)

	case claudeEventError:
		// Surface the failure as transcript content: the turn still ends with a
		// stop reason, and swallowing this leaves the user with a silent stop.
		return turn.Emit(textUpdate(acpfx.UpdateAgentMessageChunk, event.Result))

	case claudeEventSystem, claudeEventResult:
		// system carries init metadata already captured via session_id; result's
		// text duplicates the assistant chunks already streamed.
		return nil

	default:
		return nil
	}
}

func emitAssistantContent(turn *Turn, blocks []claudeContent) error {
	for _, block := range blocks {
		switch block.Type {
		case "text":
			if strings.TrimSpace(block.Text) == "" {
				continue
			}

			if err := turn.Emit(textUpdate(acpfx.UpdateAgentMessageChunk, block.Text)); err != nil {
				return err
			}

		case "thinking":
			if err := turn.Emit(textUpdate(acpfx.UpdateAgentThoughtChunk, block.Text)); err != nil {
				return err
			}

		case "tool_use":
			if err := turn.Emit(acpfx.SessionUpdate{ //nolint:exhaustruct
				SessionUpdate: acpfx.UpdateToolCall,
				ToolCall: &acpfx.ToolCall{ //nolint:exhaustruct
					ToolCallID: block.ID,
					Title:      block.Name,
					Kind:       classifyToolKind(block.Name),
					Status:     acpfx.ToolCallPending,
					RawInput:   block.Input,
				},
			}); err != nil {
				return err
			}
		}
	}

	return nil
}

// classifyToolKind maps a Claude Code tool name to an ACP tool kind.
//
// ACP's kind is a better durability signal than name-matching alone, because a
// consumer can act on "edit" without knowing every tool that writes.
func classifyToolKind(name string) string {
	switch name {
	case "Read", "Glob", "Grep", "NotebookRead":
		return "read"
	case "Write", "Edit", "MultiEdit", "NotebookEdit":
		return "edit"
	case "Bash", "BashOutput", "KillShell":
		return "execute"
	case "WebFetch", "WebSearch":
		return "fetch"
	default:
		return "other"
	}
}

// writeUserMessage sends the prompt as one stream-json user message.
//
// Non-text blocks are dropped with their type noted rather than silently: the
// CLI's stream-json input accepts text content, and pretending an image was
// delivered would be worse than saying it was not.
func writeUserMessage(stdin io.Writer, blocks []acpfx.ContentBlock) error {
	parts := make([]map[string]string, 0, len(blocks))

	for _, block := range blocks {
		if block.Type == acpfx.ContentBlockText {
			parts = append(parts, map[string]string{"type": "text", "text": block.Text})

			continue
		}

		parts = append(parts, map[string]string{
			"type": "text",
			"text": fmt.Sprintf("[unsupported content block: %s]", block.Type),
		})
	}

	msg := map[string]any{
		"type": "user",
		"message": map[string]any{
			"role":    "user",
			"content": parts,
		},
	}

	if err := json.NewEncoder(stdin).Encode(msg); err != nil {
		return fmt.Errorf("write prompt: %w", err)
	}

	return nil
}
