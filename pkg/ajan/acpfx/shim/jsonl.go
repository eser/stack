// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package shim

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// ErrVendorReported marks an error the vendor itself announced on its stream,
// as opposed to one this shim inferred from an exit status or a broken pipe.
var ErrVendorReported = errors.New("vendor reported an error")

// vendorEventKind is what one line of a vendor's JSONL stream meant.
type vendorEventKind int

const (
	// vendorText is content to stream to the client.
	vendorText vendorEventKind = iota

	// vendorDone is the vendor's terminal event for the turn.
	vendorDone

	// vendorError is a failure the vendor announced.
	vendorError
)

// vendorEvent is one line of a vendor's output, already classified.
type vendorEvent struct {
	text string
	kind vendorEventKind
}

// jsonlSpec is the vendor-specific half of a JSONL stream translation.
type jsonlSpec struct {
	// mapEvent classifies one decoded JSON object. Returning nil means "not a
	// shape this vendor's vocabulary covers", and the generic text fallback
	// gets a turn at it.
	mapEvent func(map[string]json.RawMessage) *vendorEvent

	// prose says whether a line that is not JSON should be treated as answer
	// text. It is true for a CLI whose machine-readable flag still lets prose
	// through, and false for one that promises a strict JSONL stream -- there,
	// a non-JSON line is a diagnostic, not an answer.
	prose bool
}

// drainJSONL reads the vendor's stdout a line at a time and translates it.
//
// A bufio.Reader rather than a bufio.Scanner: Scanner refuses a line over 64
// KiB, and a single JSON event carrying a long answer or a large tool input
// passes that easily. The failure is silent truncation of exactly the output
// that mattered most.
func drainJSONL(
	ctx context.Context,
	stdout io.Reader,
	emit acpfx.UpdateFunc,
	spec jsonlSpec,
) (turnOutcome, error) {
	reader := bufio.NewReader(stdout)
	outcome := newTurnOutcome()

	for {
		// Cancellation is checked between lines rather than mid-read: killing
		// the CLI is what actually stops it, and Close does that on the way out.
		if ctx.Err() != nil {
			outcome.reason = acpfx.StopReasonCancelled

			return outcome, nil
		}

		line, readErr := reader.ReadString('\n')

		// The line is handled before the error: a final line with no trailing
		// newline arrives together with io.EOF, and checking the error first
		// would discard it.
		if err := applyJSONLLine(line, emit, spec, &outcome); err != nil {
			return outcome, err
		}

		if readErr == nil {
			continue
		}

		if errors.Is(readErr, io.EOF) {
			return outcome, nil
		}

		if ctx.Err() != nil {
			outcome.reason = acpfx.StopReasonCancelled

			return outcome, nil
		}

		return outcome, fmt.Errorf("read vendor stream: %w", readErr)
	}
}

// applyJSONLLine translates one line and folds it into the outcome.
func applyJSONLLine(
	line string,
	emit acpfx.UpdateFunc,
	spec jsonlSpec,
	outcome *turnOutcome,
) error {
	event := classifyJSONLLine(line, spec)
	if event == nil {
		return nil
	}

	switch event.kind {
	case vendorText:
		return emit(textUpdate(acpfx.UpdateAgentMessageChunk, event.text))

	case vendorDone:
		// Reading continues: a terminal event is the vendor's statement about
		// the turn, not a promise that the pipe is closed.
		outcome.sawResult = true

		return nil

	case vendorError:
		// Failing the turn rather than streaming the message as content. In ACP
		// the updates already sent are notifications the client has, and a failed
		// prompt response does not retract them -- so failing loses no output and
		// gains the reason, where reporting end_turn would present the vendor's
		// error text as the assistant's answer.
		return fmt.Errorf("%w: %s", ErrVendorReported, event.text)

	default:
		return nil
	}
}

// classifyJSONLLine decides what one line of vendor output is.
func classifyJSONLLine(line string, spec jsonlSpec) *vendorEvent {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return nil
	}

	var obj map[string]json.RawMessage

	if err := json.Unmarshal([]byte(trimmed), &obj); err != nil {
		if spec.prose {
			return &vendorEvent{kind: vendorText, text: line}
		}

		return nil
	}

	if event := spec.mapEvent(obj); event != nil {
		return event
	}

	// An object the vendor's vocabulary does not cover is searched for a
	// text-bearing field and otherwise skipped.
	//
	// Skipped, specifically, rather than emitted as text: the CLI adapters this
	// replaces echoed any unrecognised line into the answer, which is how a raw
	// JSON blob ends up presented to the user as what the agent said. Their own
	// comments documented that as a shipped bug.
	return genericText(obj)
}

// genericText recovers content from an object whose type this shim does not
// know, on the theory that a field literally named "text" or "content" holding
// a string is content.
func genericText(obj map[string]json.RawMessage) *vendorEvent {
	for _, field := range []string{"text", "content"} {
		if text, ok := stringField(obj, field); ok && text != "" {
			return &vendorEvent{kind: vendorText, text: text}
		}
	}

	return nil
}

// stringField reads a string field, reporting whether it was present and a
// string. A field of another type is absent as far as callers are concerned.
func stringField(obj map[string]json.RawMessage, name string) (string, bool) {
	raw, ok := obj[name]
	if !ok {
		return "", false
	}

	var value string

	if err := json.Unmarshal(raw, &value); err != nil {
		return "", false
	}

	return value, true
}

// boolField reads a bool field, reporting whether it was present and true.
func boolField(obj map[string]json.RawMessage, name string) bool {
	raw, ok := obj[name]
	if !ok {
		return false
	}

	var value bool

	if err := json.Unmarshal(raw, &value); err != nil {
		return false
	}

	return value
}

// nestedMessage digs a human-readable message out of an error object, trying
// the nested shape first and the flat one second.
//
//	{"error": {"message": "..."}}   and   {"message": "..."}
func nestedMessage(obj map[string]json.RawMessage, fallback string) string {
	if raw, ok := obj["error"]; ok {
		var nested struct {
			Message string `json:"message"`
		}

		if err := json.Unmarshal(raw, &nested); err == nil && nested.Message != "" {
			return nested.Message
		}

		// A plain string error field is the other common shape.
		if text, ok := stringField(obj, "error"); ok && text != "" {
			return text
		}
	}

	if text, ok := stringField(obj, "message"); ok && text != "" {
		return text
	}

	return fallback
}
