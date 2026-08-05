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

// ErrKiro wraps failures from the kiro CLI itself.
var ErrKiro = errors.New("kiro")

// DefaultKiroCommand is the vendor binary this backend drives.
const DefaultKiroCommand = "kiro"

// Kiro drives the Kiro CLI.
//
// The prompt goes in on stdin and the answer comes back as JSONL, which is the
// most the CLI offers: it has no session id, no resume, and no tool-call
// stream. What it can do is translated faithfully and what it cannot is stated
// in Capabilities, rather than left as the silent behavioural difference the
// aifx adapter shipped.
type Kiro struct {
	// Command overrides the binary. Empty means DefaultKiroCommand.
	Command string

	// ExtraArgs are appended to the invocation, for flags this backend does not
	// model (--model, --max-tokens, ...).
	ExtraArgs []string

	// convo supplies the conversational memory the CLI itself has none of.
	convo conversations
}

// Name implements Backend.
func (k *Kiro) Name() string { return "kiro" }

// Capabilities implements Backend.
//
// Every field here is false, and each false is a vendor gap rather than
// caution:
//
//   - loadSession: the CLI has no session id, so there is nothing for a cold
//     resume to attach to. Continuity within a live session comes from
//     re-sending the transcript (see conversations), which a freshly spawned
//     shim cannot reconstruct.
//   - embeddedContext, image, audio: the prompt is flattened to plain text on
//     stdin, so an embedded resource would arrive as a description of itself.
//
// One gap ACP cannot express: kiro emits no tool-call events, so a client sees
// answer text and nothing else even when the agent has been editing files.
// AgentCapabilities has no flag for that -- tool calls are session/update
// variants rather than a negotiated capability -- so it is documented here
// instead of advertised. A client that needs to see tool calls should not
// choose this backend.
func (k *Kiro) Capabilities() acpfx.AgentCapabilities {
	return acpfx.AgentCapabilities{
		LoadSession: false,
		Prompt:      acpfx.PromptCapabilities{Image: false, Audio: false, EmbeddedContext: false},
	}
}

func (k *Kiro) command() string {
	if k.Command != "" {
		return k.Command
	}

	return DefaultKiroCommand
}

// args builds the invocation.
//
// --output json asks for machine-readable output. There is no resume flag to
// pass, which is the whole reason conversations exists.
func (k *Kiro) args() []string {
	return append([]string{"--output", "json"}, k.ExtraArgs...)
}

// RunTurn implements Backend.
func (k *Kiro) RunTurn(ctx context.Context, turn *Turn) (acpfx.StopReason, string, error) {
	prompt := promptText(turn.Prompt)

	var answer strings.Builder

	outcome, err := runVendorTurn(ctx, vendorInvocation{
		sentinel: ErrKiro,
		command:  k.command(),
		args:     k.args(),
		cwd:      turn.Cwd,
		writeStdin: func(stdin io.Writer) error {
			return writePlainPrompt(stdin, k.convo.render(turn.SessionID, prompt))
		},
		drain: func(ctx context.Context, stdout io.Reader) (turnOutcome, error) {
			return drainJSONL(ctx, stdout, recordingEmit(turn.Emit, &answer), kiroSpec())
		},
	})
	if err != nil {
		return "", "", err
	}

	k.convo.record(turn.SessionID, prompt, answer.String())

	// No vendor session id: the CLI never names one, and inventing a value here
	// would make the shim ask for a resume the vendor cannot honour.
	return outcome.reason, "", nil
}

// kiroSpec is kiro's JSONL vocabulary.
//
// prose is true because --output json is a *result* format rather than a
// promise of a pure stream: the CLI still emits plain lines, and dropping them
// would lose the answer entirely on the runs where that is all it emits.
func kiroSpec() jsonlSpec {
	return jsonlSpec{mapEvent: mapKiroEvent, prose: true}
}

// mapKiroEvent classifies one line of kiro output.
//
// Moved from aifx.mapKiroStreamEvent rather than rewritten. Two things did not
// survive the move, both because ACP has nowhere to put them: token usage on a
// result event (SessionUpdate carries no usage) and the distinction between
// "done" and "result", which mean the same thing to a turn that is ending.
func mapKiroEvent(obj map[string]json.RawMessage) *vendorEvent {
	eventType, typed := stringField(obj, "type")
	if !typed {
		// A typeless object with done:true is the terminal event in the shape
		// some builds emit.
		if boolField(obj, "done") {
			return &vendorEvent{kind: vendorDone, text: ""}
		}

		return nil
	}

	switch eventType {
	case "content", "text":
		text, ok := stringField(obj, "text")
		if !ok || text == "" {
			text, _ = stringField(obj, "content")
		}

		if text != "" {
			return &vendorEvent{kind: vendorText, text: text}
		}

	case "done", "result":
		return &vendorEvent{kind: vendorDone, text: ""}

	case "error":
		return &vendorEvent{kind: vendorError, text: nestedMessage(obj, "unknown kiro error")}
	}

	return nil
}

// Compile-time interface assertion.
var _ Backend = (*Kiro)(nil)
