package acpfx_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// traceKey stands in for request-scoped metadata, such as a trace id, that
// the session must keep from the call that opened it.
type traceKey struct{}

// ctxClient records the context each session/update is delivered with.
type ctxClient struct {
	scriptedClient

	mu   sync.Mutex
	ctxs []context.Context
}

func (c *ctxClient) SessionUpdate(ctx context.Context, note *acpfx.SessionNotification) {
	c.mu.Lock()
	c.ctxs = append(c.ctxs, ctx)
	c.mu.Unlock()

	c.scriptedClient.SessionUpdate(ctx, note)
}

func (c *ctxClient) lastContext(t *testing.T) context.Context {
	t.Helper()

	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.ctxs) == 0 {
		t.Fatal("no session/update was delivered")
	}

	return c.ctxs[len(c.ctxs)-1]
}

// TestSessionUpdateContextLivesUntilClose pins the session's own context.
//
// Updates used to arrive with context.Background(), so a handler could not
// tell that the session was gone. They now carry a context that keeps the
// opening call's values, survives that call's cancellation, and ends when the
// session or its client is closed.
func TestSessionUpdateContextLivesUntilClose(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		close func(client *acpfx.Client, session *acpfx.Session)
	}{
		{
			name:  "session closed",
			close: func(_ *acpfx.Client, session *acpfx.Session) { session.Close() },
		},
		{
			name: "client closed",
			close: func(client *acpfx.Client, _ *acpfx.Session) {
				_ = client.Close()
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler := &ctxClient{}  //nolint:exhaustruct
			agent := &scriptedAgent{ //nolint:exhaustruct
				cancelCh: make(chan string, 1),
				onPrompt: func(
					_ context.Context,
					_ *acpfx.PromptRequest,
					emit acpfx.UpdateFunc,
				) (*acpfx.PromptResponse, error) {
					if err := emit(acpfx.SessionUpdate{ //nolint:exhaustruct
						SessionUpdate: acpfx.UpdateAgentMessageChunk,
						Content: &acpfx.ContentBlock{ //nolint:exhaustruct
							Type: acpfx.ContentBlockText, Text: "hello",
						},
					}); err != nil {
						return nil, err
					}

					return &acpfx.PromptResponse{StopReason: acpfx.StopReasonEndTurn}, nil
				},
			}

			client, _ := connectHandler(t, handler, agent)

			openCtx, cancelOpen := context.WithCancel(
				context.WithValue(t.Context(), traceKey{}, "trace-1"),
			)

			session, err := client.NewSession(openCtx, &acpfx.NewSessionRequest{ //nolint:exhaustruct
				Cwd: t.TempDir(),
			})
			if err != nil {
				t.Fatalf("NewSession: %v", err)
			}

			// The opening call is over; its cancellation must not reach the session.
			cancelOpen()

			if _, err := session.Prompt(
				t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
			); err != nil {
				t.Fatalf("Prompt: %v", err)
			}

			updateCtx := handler.lastContext(t)

			if err := updateCtx.Err(); err != nil {
				t.Fatalf("update context ended with the opening call: %v", err)
			}

			if got := updateCtx.Value(traceKey{}); got != "trace-1" {
				t.Fatalf("update context value = %v, want the opening call's trace-1", got)
			}

			tc.close(client, session)

			select {
			case <-updateCtx.Done():
			case <-time.After(5 * time.Second):
				t.Fatal("update context was not cancelled on close")
			}

			if err := updateCtx.Err(); !errors.Is(err, context.Canceled) {
				t.Fatalf("update context error = %v, want context.Canceled", err)
			}
		})
	}
}
