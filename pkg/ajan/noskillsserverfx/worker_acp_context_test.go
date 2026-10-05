package noskillsserverfx

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// modeAgent is a scriptedAgent that serves session/set_mode and holds each
// call open until the test releases it, so a test can end the call from the
// client side while the agent is still working on it.
type modeAgent struct {
	scriptedAgent

	entered chan struct{}
	release chan struct{}
}

func (a *modeAgent) SetMode(ctx context.Context, _ *acpfx.SetSessionModeRequest) error {
	a.entered <- struct{}{}

	select {
	case <-a.release:
	case <-ctx.Done():
	}

	return nil
}

var _ acpfx.AgentModeSetter = (*modeAgent)(nil)

// TestACPWorkerSetModeEndsWithTheCallerOrTheWorker pins the contexts SetMode
// runs under.
//
// SetMode used to call the agent with context.Background(), so a client that
// disconnected or a worker that closed left the call waiting on the agent.
// It now ends when either the caller's context or the worker's own context
// ends.
func TestACPWorkerSetModeEndsWithTheCallerOrTheWorker(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		end  func(worker *acpWorker, cancelCaller context.CancelFunc)
	}{
		{
			name: "caller gave up",
			end:  func(_ *acpWorker, cancelCaller context.CancelFunc) { cancelCaller() },
		},
		{
			name: "worker closed",
			// Cancel only the worker's context, not the whole worker: Close also
			// closes the connection, which would end the call for a different
			// reason and prove nothing about the context.
			end: func(worker *acpWorker, _ context.CancelFunc) { worker.cancel() },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			agent := &modeAgent{ //nolint:exhaustruct
				entered: make(chan struct{}, 1),
				release: make(chan struct{}),
			}
			defer close(agent.release)

			worker := connectACPWorkerHandler(t, &agent.scriptedAgent, agent, "")

			if err := worker.SendQueryStart(t.Context(), t.TempDir(), "sess-test", ""); err != nil {
				t.Fatalf("SendQueryStart: %v", err)
			}

			callerCtx, cancelCaller := context.WithCancel(t.Context())
			defer cancelCaller()

			returned := make(chan error, 1)

			go func() { returned <- worker.SetMode(callerCtx, "plan") }()

			select {
			case <-agent.entered:
			case <-time.After(5 * time.Second):
				t.Fatal("session/set_mode never reached the agent")
			}

			tc.end(worker, cancelCaller)

			select {
			case err := <-returned:
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("SetMode error = %v, want context.Canceled", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("SetMode kept waiting on the agent after its context ended")
			}
		})
	}
}

// TestACPWorkerStopTaskCancelsTheTurn pins that StopTask, which now takes the
// caller's context, still reaches the agent as session/cancel mid-turn.
func TestACPWorkerStopTaskCancelsTheTurn(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})

	agent := &scriptedAgent{ //nolint:exhaustruct
		turn: func(
			ctx context.Context, _ *acpfx.PromptRequest, _ acpfx.UpdateFunc,
		) acpfx.StopReason {
			close(started)
			<-ctx.Done()

			return acpfx.StopReasonCancelled
		},
	}

	worker := connectACPWorker(t, agent, "")

	if err := worker.SendQueryStart(t.Context(), t.TempDir(), "sess-test", ""); err != nil {
		t.Fatalf("SendQueryStart: %v", err)
	}

	if err := worker.PushMessage(t.Context(), "long turn"); err != nil {
		t.Fatalf("PushMessage: %v", err)
	}

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("the turn never started")
	}

	if err := worker.StopTask(t.Context()); err != nil {
		t.Fatalf("StopTask: %v", err)
	}

	select {
	case <-agent.cancelled:
	case <-time.After(5 * time.Second):
		t.Fatal("session/cancel never reached the agent")
	}
}
