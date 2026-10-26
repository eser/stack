package acpfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// funcHandler adapts two closures to acpfx.Handler.
type funcHandler struct {
	request      func(ctx context.Context, method string, params json.RawMessage) (any, error)
	notification func(ctx context.Context, method string, params json.RawMessage) error
}

func (h funcHandler) HandleRequest(
	ctx context.Context,
	method string,
	params json.RawMessage,
) (any, error) {
	if h.request == nil {
		return nil, acpfx.ErrUnhandledMethod
	}

	return h.request(ctx, method, params)
}

func (h funcHandler) HandleNotification(
	ctx context.Context,
	method string,
	params json.RawMessage,
) error {
	if h.notification == nil {
		return nil
	}

	return h.notification(ctx, method, params)
}

// pair wires two connections to each other over in-memory pipes, modelling the
// real topology: an ACP connection is symmetric, so both ends can call and both
// ends must serve.
func pair(t *testing.T, clientSide, agentSide acpfx.Handler) (*acpfx.Conn, *acpfx.Conn) {
	t.Helper()

	clientReader, agentWriter := io.Pipe()
	agentReader, clientWriter := io.Pipe()

	client := acpfx.NewConn(clientReader, clientWriter, nil, clientSide)
	agent := acpfx.NewConn(agentReader, agentWriter, nil, agentSide)

	t.Cleanup(func() {
		_ = client.Close()
		_ = agent.Close()
	})

	return client, agent
}

func TestCallReturnsResult(t *testing.T) {
	t.Parallel()

	client, _ := pair(t, funcHandler{}, funcHandler{ //nolint:exhaustruct
		request: func(_ context.Context, method string, _ json.RawMessage) (any, error) {
			return map[string]string{"echoed": method}, nil
		},
	})

	var got struct {
		Echoed string `json:"echoed"`
	}

	if err := client.Call(t.Context(), "session/new", nil, &got); err != nil {
		t.Fatalf("Call: %v", err)
	}

	if got.Echoed != "session/new" {
		t.Fatalf("echoed = %q, want session/new", got.Echoed)
	}
}

func TestCallSurfacesRemoteError(t *testing.T) {
	t.Parallel()

	client, _ := pair(t, funcHandler{}, funcHandler{ //nolint:exhaustruct
		request: func(_ context.Context, _ string, _ json.RawMessage) (any, error) {
			return nil, errors.New("agent exploded") //nolint:err113
		},
	})

	err := client.Call(t.Context(), "session/prompt", nil, nil)
	if !errors.Is(err, acpfx.ErrRemote) {
		t.Fatalf("error = %v, want ErrRemote", err)
	}

	if !strings.Contains(err.Error(), "agent exploded") {
		t.Fatalf("error %q does not carry the remote message", err)
	}
}

// TestUnhandledMethodBecomesMethodNotFound pins how a client declines a
// capability it never advertised: ErrUnhandledMethod must become a JSON-RPC
// -32601 rather than a generic internal error, so the agent can tell
// "unsupported" from "broke".
func TestUnhandledMethodBecomesMethodNotFound(t *testing.T) {
	t.Parallel()

	_, agent := pair(t, funcHandler{}, funcHandler{}) //nolint:exhaustruct

	err := agent.Call(t.Context(), "fs/read_text_file", nil, nil)
	if !errors.Is(err, acpfx.ErrRemote) {
		t.Fatalf("error = %v, want ErrRemote", err)
	}

	if !strings.Contains(err.Error(), "fs/read_text_file") {
		t.Fatalf("error %q does not name the declined method", err)
	}

	// The name of this test is about the CODE, and until now nothing checked it.
	// ErrRemote plus the method name in the text would still hold if the peer
	// answered InternalError, so a regression that reported -32603 for an
	// unknown method -- which tells a caller "retry, the peer broke" instead of
	// "that method does not exist" -- passed unnoticed.
	var remote *acpfx.Error
	if !errors.As(err, &remote) {
		t.Fatalf("error %v is not a *RemoteError", err)
	}

	if remote.Code != acpfx.CodeMethodNotFound {
		t.Fatalf("code = %d, want CodeMethodNotFound (%d)", remote.Code, acpfx.CodeMethodNotFound)
	}
}

// TestSlowHandlerDoesNotBlockConnection is the load-bearing test of this
// package.
//
// A client-side handler can block for a very long time -- session/request_
// permission waits on a human. If inbound requests were served on the read
// loop, the loop would stop reading while that handler waits, so the response
// to the very session/prompt the agent is blocked on could never be read:
// total deadlock, no timeout, no error.
//
// Here the agent calls a client handler that blocks until released, and while
// it is blocked the client must still complete an unrelated round-trip.
func TestSlowHandlerDoesNotBlockConnection(t *testing.T) {
	t.Parallel()

	release := make(chan struct{})
	entered := make(chan struct{})

	client, agent := pair(t,
		funcHandler{ //nolint:exhaustruct
			request: func(_ context.Context, _ string, _ json.RawMessage) (any, error) {
				close(entered)
				<-release

				return map[string]string{"outcome": "allowed"}, nil
			},
		},
		funcHandler{ //nolint:exhaustruct
			request: func(_ context.Context, _ string, _ json.RawMessage) (any, error) {
				return map[string]bool{"ok": true}, nil
			},
		},
	)

	permissionDone := make(chan error, 1)

	go func() {
		permissionDone <- agent.Call(
			t.Context(), "session/request_permission", nil, nil,
		)
	}()

	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("client permission handler never ran")
	}

	// The permission handler is parked. Unrelated traffic must still flow.
	unrelated := make(chan error, 1)

	go func() {
		var out struct {
			OK bool `json:"ok"`
		}

		unrelated <- client.Call(t.Context(), "session/new", nil, &out)
	}()

	select {
	case err := <-unrelated:
		if err != nil {
			t.Fatalf("unrelated call failed while a handler was blocked: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("connection deadlocked: a blocked inbound handler stalled the read loop")
	}

	close(release)

	select {
	case err := <-permissionDone:
		if err != nil {
			t.Fatalf("permission call: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("permission call never completed after release")
	}
}

// safeBuffer is an io.Writer a handler goroutine can write to while the test
// reads it.
type safeBuffer struct {
	mu  sync.Mutex
	buf strings.Builder
}

func (b *safeBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.Write(p) //nolint:wrapcheck
}

func (b *safeBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

// TestReplyIsWrittenAfterReaderEOF pins that the read side ending does not
// discard replies the write side can still deliver.
//
// An agent on stdio hits this every time: the client closes stdin as its
// shutdown signal, but stdout is still open and the reply to the request that
// was in flight has to get out. Without the drain such a run exits 0 having
// written nothing at all, so the loss is silent.
func TestReplyIsWrittenAfterReaderEOF(t *testing.T) {
	t.Parallel()

	// One request, then immediate EOF -- the reader is done before the handler
	// has even started.
	request := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}` + "\n"

	var out safeBuffer

	conn := acpfx.NewConn(
		strings.NewReader(request), &out, nil,
		funcHandler{ //nolint:exhaustruct
			request: func(_ context.Context, _ string, _ json.RawMessage) (any, error) {
				// Long enough that an undrained connection is certain to lose it.
				time.Sleep(200 * time.Millisecond)

				return map[string]string{"handled": "yes"}, nil
			},
		},
	)

	select {
	case <-conn.Done():
	case <-time.After(15 * time.Second):
		t.Fatal("connection never stopped after reader EOF")
	}

	if got := out.String(); !strings.Contains(got, `"handled":"yes"`) {
		t.Fatalf("reply was lost on reader EOF; wrote %q", got)
	}
}

// TestReaderEOFDoesNotHangOnACallingHandler pins the drain's timeout.
//
// A handler that calls back to the far end is waiting for a reply that can no
// longer arrive, because the reader is what would have delivered it. Without a
// bound, the drain waits for the handler while the handler waits for the drain
// and the process never exits.
func TestReaderEOFDoesNotHangOnACallingHandler(t *testing.T) {
	t.Parallel()

	request := `{"jsonrpc":"2.0","id":1,"method":"session/prompt","params":{}}` + "\n"

	var out safeBuffer

	entered := make(chan struct{})

	// The handler needs the Conn that is still being constructed. Buffered by
	// one so the send below never blocks, and the handler waits rather than
	// racing a nil pointer.
	ready := make(chan *acpfx.Conn, 1)

	conn := acpfx.NewConn(
		strings.NewReader(request), &out, nil,
		funcHandler{ //nolint:exhaustruct
			request: func(ctx context.Context, _ string, _ json.RawMessage) (any, error) {
				close(entered)

				// Nothing will ever answer this: the reader is already at EOF.
				return nil, (<-ready).Call(ctx, "session/request_permission", nil, nil)
			},
		},
	)

	ready <- conn

	select {
	case <-entered:
	case <-time.After(10 * time.Second):
		t.Fatal("handler never ran")
	}

	select {
	case <-conn.Done():
	case <-time.After(30 * time.Second):
		t.Fatal("drain deadlocked: it waited for a handler that was waiting for it")
	}
}

func TestNotificationsAreDelivered(t *testing.T) {
	t.Parallel()

	notified := make(chan string, 1)

	_, agent := pair(t,
		funcHandler{ //nolint:exhaustruct
			notification: func(_ context.Context, method string, _ json.RawMessage) error {
				notified <- method

				return nil
			},
		},
		funcHandler{}, //nolint:exhaustruct
	)

	if err := agent.Notify("session/update", map[string]string{"sessionId": "s1"}); err != nil {
		t.Fatalf("Notify: %v", err)
	}

	select {
	case method := <-notified:
		if method != "session/update" {
			t.Fatalf("method = %q, want session/update", method)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("notification never delivered")
	}
}

// TestLargeMessageSurvives guards the framing choice.
//
// bufio.Scanner -- used elsewhere in this repo with a 1 MB cap -- fails the
// whole stream on an over-long line. ACP messages legitimately carry file
// contents and terminal output well past that, so this package decodes with
// json.Decoder, which has no line limit.
func TestLargeMessageSurvives(t *testing.T) {
	t.Parallel()

	const payloadSize = 4 << 20 // 4 MiB, far past bufio.Scanner's default 64 KiB

	big := strings.Repeat("x", payloadSize)

	client, _ := pair(t, funcHandler{}, funcHandler{ //nolint:exhaustruct
		request: func(_ context.Context, _ string, params json.RawMessage) (any, error) {
			var in struct {
				Content string `json:"content"`
			}

			if err := json.Unmarshal(params, &in); err != nil {
				return nil, err //nolint:wrapcheck
			}

			return map[string]int{"length": len(in.Content)}, nil
		},
	})

	var out struct {
		Length int `json:"length"`
	}

	err := client.Call(
		t.Context(),
		"fs/write_text_file",
		map[string]string{"content": big},
		&out,
	)
	if err != nil {
		t.Fatalf("large Call: %v", err)
	}

	if out.Length != payloadSize {
		t.Fatalf("agent saw %d bytes, want %d", out.Length, payloadSize)
	}
}

func TestCloseUnblocksPendingCalls(t *testing.T) {
	t.Parallel()

	client, _ := pair(t, funcHandler{}, funcHandler{ //nolint:exhaustruct
		request: func(ctx context.Context, _ string, _ json.RawMessage) (any, error) {
			<-ctx.Done() // never answers

			return nil, ctx.Err() //nolint:wrapcheck
		},
	})

	done := make(chan error, 1)

	go func() { done <- client.Call(t.Context(), "session/prompt", nil, nil) }()

	time.Sleep(100 * time.Millisecond)

	_ = client.Close()

	select {
	case err := <-done:
		if !errors.Is(err, acpfx.ErrConnClosed) {
			t.Fatalf("error = %v, want ErrConnClosed", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not unblock the pending Call")
	}
}

func TestContextCancellationUnblocksCall(t *testing.T) {
	t.Parallel()

	client, _ := pair(t, funcHandler{}, funcHandler{ //nolint:exhaustruct
		request: func(ctx context.Context, _ string, _ json.RawMessage) (any, error) {
			<-ctx.Done()

			return nil, ctx.Err() //nolint:wrapcheck
		},
	})

	ctx, cancel := context.WithCancel(t.Context())

	done := make(chan error, 1)

	go func() { done <- client.Call(ctx, "session/prompt", nil, nil) }()

	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("error = %v, want context.Canceled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancelling ctx did not unblock the Call")
	}
}

// TestConcurrentCallsCorrelateIndependently guards the pending-map and the
// write mutex: many in-flight requests must each receive their own reply.
func TestConcurrentCallsCorrelateIndependently(t *testing.T) {
	t.Parallel()

	client, _ := pair(t, funcHandler{}, funcHandler{ //nolint:exhaustruct
		request: func(_ context.Context, _ string, params json.RawMessage) (any, error) {
			var in struct {
				N int `json:"n"`
			}

			if err := json.Unmarshal(params, &in); err != nil {
				return nil, err //nolint:wrapcheck
			}

			return map[string]int{"n": in.N}, nil
		},
	})

	const callers = 32

	var wg sync.WaitGroup

	wg.Add(callers)

	errs := make(chan error, callers)

	for i := range callers {
		go func() {
			defer wg.Done()

			var out struct {
				N int `json:"n"`
			}

			if err := client.Call(
				t.Context(), "session/prompt", map[string]int{"n": i}, &out,
			); err != nil {
				errs <- err

				return
			}

			if out.N != i {
				errs <- errors.New("reply correlated to the wrong request") //nolint:err113
			}
		}()
	}

	wg.Wait()
	close(errs)

	for err := range errs {
		t.Fatalf("concurrent call: %v", err)
	}
}
