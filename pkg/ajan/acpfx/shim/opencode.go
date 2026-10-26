// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package shim

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// ErrOpenCode wraps failures from the opencode CLI itself.
var ErrOpenCode = errors.New("opencode")

// DefaultOpenCodeCommand is the vendor binary this backend drives.
const DefaultOpenCodeCommand = "opencode"

// OpenCode drives the OpenCode CLI in its stream-json mode.
//
// It is shaped like Kiro because the vendors are shaped alike: a plain-text
// prompt on stdin, a JSONL answer, no session id to resume. They are kept as
// two backends rather than one parameterised type because the thing that
// differs -- the event vocabulary -- is exactly the thing that drifts when a
// vendor ships a release.
type OpenCode struct {
	// Command overrides the binary. Empty means DefaultOpenCodeCommand.
	Command string

	// ExtraArgs are appended to the invocation, for flags this backend does not
	// model (--model, --max-tokens, ...).
	ExtraArgs []string

	// convo supplies the conversational memory the CLI itself has none of.
	convo conversations
}

// Name implements Backend.
func (o *OpenCode) Name() string { return "opencode" }

// Capabilities implements Backend.
//
// False for the same reasons as Kiro: no session id to resume, and a prompt
// flattened to plain text on stdin. OpenCode likewise streams no tool calls,
// which ACP's capability surface has no way to say -- see the note on
// Kiro.Capabilities.
func (o *OpenCode) Capabilities() acpfx.AgentCapabilities {
	return acpfx.AgentCapabilities{
		LoadSession: false,
		Prompt:      acpfx.PromptCapabilities{Image: false, Audio: false, EmbeddedContext: false},
	}
}

func (o *OpenCode) command() string {
	if o.Command != "" {
		return o.Command
	}

	return DefaultOpenCodeCommand
}

// args builds the invocation.
//
// stream-json rather than the json the aifx adapter asked for on its one-shot
// path: a shim always streams, because the client is watching the turn happen
// rather than waiting for a value.
func (o *OpenCode) args() []string {
	return append([]string{"--output-format", "stream-json"}, o.ExtraArgs...)
}

// RunTurn implements Backend.
func (o *OpenCode) RunTurn(ctx context.Context, turn *Turn) (acpfx.StopReason, string, error) {
	prompt := promptText(turn.Prompt)

	var answer strings.Builder

	outcome, err := runVendorTurn(ctx, vendorInvocation{
		sentinel: ErrOpenCode,
		command:  o.command(),
		args:     o.args(),
		cwd:      turn.Cwd,
		writeStdin: func(stdin io.Writer) error {
			return writePlainPrompt(stdin, o.convo.render(turn.SessionID, prompt))
		},
		drain: func(ctx context.Context, stdout io.Reader) (turnOutcome, error) {
			return drainJSONL(ctx, stdout, recordingEmit(turn.Emit, &answer), openCodeSpec())
		},
	})
	if err != nil {
		return "", "", err
	}

	o.convo.record(turn.SessionID, prompt, answer.String())

	return outcome.reason, "", nil
}

// openCodeSpec is opencode's JSONL vocabulary.
//
// prose is false, unlike kiro: --output-format stream-json promises a stream of
// JSON objects, so a line that is not one is a diagnostic rather than an
// answer, and streaming it as content would put the vendor's warnings in the
// transcript as if the agent had said them.
func openCodeSpec() jsonlSpec {
	return jsonlSpec{mapEvent: mapOpenCodeEvent, prose: false}
}

// mapOpenCodeEvent classifies one line of opencode output.
//
// Moved from aifx.mapOpenCodeStreamEvent. As with kiro, token usage on a result
// event is dropped because ACP's SessionUpdate has nowhere to carry it.
func mapOpenCodeEvent(obj map[string]json.RawMessage) *vendorEvent {
	eventType, typed := stringField(obj, "type")
	if !typed {
		if boolField(obj, "done") {
			return &vendorEvent{kind: vendorDone, text: ""}
		}

		return nil
	}

	switch eventType {
	case "content_block_delta", "assistant":
		if text := openCodeText(obj); text != "" {
			return &vendorEvent{kind: vendorText, text: text}
		}

	case "result":
		return &vendorEvent{kind: vendorDone, text: ""}

	case "error":
		return &vendorEvent{kind: vendorError, text: nestedMessage(obj, "unknown opencode error")}
	}

	return nil
}

// openCodeText pulls answer text out of the two shapes opencode uses for it.
//
//	content_block_delta: {"delta": {"text": "..."}}
//	assistant:           {"message": {"content": [{"text": "..."}]}}
func openCodeText(obj map[string]json.RawMessage) string {
	if raw, ok := obj["delta"]; ok {
		var delta struct {
			Text string `json:"text"`
		}

		if err := json.Unmarshal(raw, &delta); err == nil && delta.Text != "" {
			return delta.Text
		}
	}

	if raw, ok := obj["message"]; ok {
		var message struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		}

		if err := json.Unmarshal(raw, &message); err == nil {
			var builder strings.Builder

			// Every block, not just the first: the aifx original read
			// Content[0] and dropped the rest, so a multi-block assistant
			// message lost everything after its opening sentence.
			for _, block := range message.Content {
				builder.WriteString(block.Text)
			}

			return builder.String()
		}
	}

	return ""
}

// Compile-time interface assertion.
var _ Backend = (*OpenCode)(nil)
