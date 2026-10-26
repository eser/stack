package acpfx_test

import (
	"context"
	"strconv"
	"testing"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// This file pins the two ordering guarantees a transcript depends on.
//
// Both are behavioural: the JSON Schema says a session/update is well-formed,
// never that it arrived in the right order or that it arrived at all before the
// turn was reported finished. Nothing else in the suite can catch a regression
// here, because every other test either emits one update or polls until the
// count is right -- polling is exactly what hides both defects.

// orderedChunks is large enough that a scheduler racing N goroutines will
// reorder some of them. One or two chunks would pass by luck.
const orderedChunks = 200

// TestUpdatesArriveInWireOrder pins that the transcript is not reordered.
//
// The handler contract says updates for a session arrive in order, because
// chunk order *is* the transcript: reordered chunks are silently corrupted
// output, not a dropped frame someone will notice.
func TestUpdatesArriveInWireOrder(t *testing.T) {
	t.Parallel()

	client := &scriptedClient{onPermission: nil}            //nolint:exhaustruct
	agent := &scriptedAgent{cancelCh: make(chan string, 1)} //nolint:exhaustruct

	agent.onPrompt = func(
		_ context.Context,
		_ *acpfx.PromptRequest,
		emit acpfx.UpdateFunc,
	) (*acpfx.PromptResponse, error) {
		for i := range orderedChunks {
			err := emit(acpfx.SessionUpdate{ //nolint:exhaustruct
				SessionUpdate: acpfx.UpdateAgentMessageChunk,
				Content: &acpfx.ContentBlock{ //nolint:exhaustruct
					Type: acpfx.ContentBlockText,
					Text: strconv.Itoa(i),
				},
			})
			if err != nil {
				return nil, err
			}
		}

		return &acpfx.PromptResponse{StopReason: acpfx.StopReasonEndTurn}, nil
	}

	connected, _ := connect(t, client, agent)

	session, err := connected.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("stream")},
	); err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	waitFor(t, "every chunk to arrive", func() bool {
		return len(client.snapshot()) >= orderedChunks
	})

	for i, update := range client.snapshot() {
		if update.Content == nil {
			t.Fatalf("update %d carries no content", i)
		}

		if got := update.Content.Text; got != strconv.Itoa(i) {
			t.Fatalf("update %d is chunk %q: the transcript was reordered", i, got)
		}
	}
}

// TestPromptReturnsAfterEveryUpdateIsDelivered pins the turn boundary.
//
// v1's session/prompt blocks and returns a stop reason, so callers reasonably
// treat its return as "the turn is over, the transcript is complete". If
// updates are still in flight at that moment, a caller that reads the
// transcript on return silently loses the tail of the answer -- and the loss is
// timing-dependent, so it shows up in production and not in tests.
//
// The wire cannot violate this: updates precede the response on a single
// stream. Only our own delivery path can, which is what this asserts.
func TestPromptReturnsAfterEveryUpdateIsDelivered(t *testing.T) {
	t.Parallel()

	client := &scriptedClient{onPermission: nil}            //nolint:exhaustruct
	agent := &scriptedAgent{cancelCh: make(chan string, 1)} //nolint:exhaustruct

	agent.onPrompt = func(
		_ context.Context,
		_ *acpfx.PromptRequest,
		emit acpfx.UpdateFunc,
	) (*acpfx.PromptResponse, error) {
		for i := range orderedChunks {
			err := emit(acpfx.SessionUpdate{ //nolint:exhaustruct
				SessionUpdate: acpfx.UpdateAgentMessageChunk,
				Content: &acpfx.ContentBlock{ //nolint:exhaustruct
					Type: acpfx.ContentBlockText,
					Text: strconv.Itoa(i),
				},
			})
			if err != nil {
				return nil, err
			}
		}

		return &acpfx.PromptResponse{StopReason: acpfx.StopReasonEndTurn}, nil
	}

	connected, _ := connect(t, client, agent)

	session, err := connected.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	resp, err := session.Prompt(t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("stream")})
	if err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if resp.StopReason != acpfx.StopReasonEndTurn {
		t.Fatalf("stopReason = %q, want end_turn", resp.StopReason)
	}

	// No polling: the count is read once, immediately. Polling here would test
	// nothing, since the missing updates do eventually arrive.
	if got := len(client.snapshot()); got != orderedChunks {
		t.Fatalf(
			"Prompt returned with %d of %d updates delivered: the turn was "+
				"reported complete while its transcript was still in flight",
			got, orderedChunks,
		)
	}
}
