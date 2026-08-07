// Package acpfx implements a client for the Agent Client Protocol (ACP) --
// the JSON-RPC 2.0 protocol coding agents speak over stdio, standardising
// spawning, prompting, streaming, tool calls, permissions and session resume.
//
// This package targets ACP **v1**, the stable revision. The v2 draft changes
// session/prompt semantics (v1 blocks and returns a stop reason; v2 returns
// immediately and reports completion via notifications), so the version is not
// interchangeable.
//
// The defining property of an ACP connection, and the reason this file exists
// rather than reusing the repo's FFI-bridge request/response shape, is that it
// is **symmetric**: the same pipe carries our requests to the agent *and* the
// agent's requests to us (permission prompts, file reads, terminal control).
// A client that can only send is not an ACP client.
package acpfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"
)

// Sentinel errors for the JSON-RPC transport.
var (
	ErrConnClosed       = errors.New("acp connection closed")
	ErrRemote           = errors.New("acp remote error")
	ErrUnhandledMethod  = errors.New("acp method not handled")
	ErrMalformedMessage = errors.New("acp malformed message")

	// ErrInvalidParams marks a handler error as the caller's fault rather than
	// ours. Wrap it to answer with -32602 instead of -32603: an agent told
	// "internal error" reasonably retries, while "invalid params" tells it the
	// request itself was wrong and retrying it unchanged is pointless.
	ErrInvalidParams = errors.New("acp invalid params")
)

// jsonRPCVersion is the only value permitted in the jsonrpc field.
const jsonRPCVersion = "2.0"

// Error is a JSON-RPC 2.0 error object.
type Error struct {
	Data    json.RawMessage `json:"data,omitempty"`
	Message string          `json:"message"`
	Code    int             `json:"code"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("%d %s", e.Code, e.Message)
}

// Standard JSON-RPC 2.0 error codes.
const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603
)

// message is the wire envelope. One struct covers requests, responses and
// notifications because JSON-RPC distinguishes them by which fields are
// present, not by a type tag:
//
//	request       method + id
//	notification  method, no id
//	response      id + (result | error), no method
type message struct {
	ID      json.RawMessage `json:"id,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *Error          `json:"error,omitempty"`
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method,omitempty"`
}

// Handler serves the methods the *agent* calls on *us*. Returning
// ErrUnhandledMethod produces a JSON-RPC "method not found" response, which is
// how a client declines a capability it never advertised.
type Handler interface {
	// HandleRequest serves an inbound request and returns its result payload.
	HandleRequest(ctx context.Context, method string, params json.RawMessage) (any, error)

	// HandleNotification serves an inbound notification. It has no reply, so a
	// returned error can only be logged -- never sent to the agent.
	HandleNotification(ctx context.Context, method string, params json.RawMessage) error
}

// Conn is a bidirectional JSON-RPC 2.0 connection over a byte stream.
//
// Safe for concurrent use. Exactly one goroutine reads; writes are serialised
// by a mutex because inbound-request handlers reply concurrently with outgoing
// calls.
type Conn struct {
	writer  io.Writer
	closer  io.Closer
	handler Handler

	// pending correlates outgoing request ids to the goroutine awaiting each
	// reply. Buffered by one so a delivery never blocks the reader even if the
	// caller's context died first.
	pending   map[int64]chan *message
	pendingMu sync.Mutex

	done      chan struct{}
	closeOnce sync.Once

	// readErr explains why the reader stopped; read only after done is closed.
	readErr error

	// serving counts inbound handlers still running, so a reader that reaches
	// EOF can let them finish writing before the connection is torn down.
	serving sync.WaitGroup

	writeMu sync.Mutex
	nextID  atomic.Int64
}

// serveDrainTimeout bounds how long a reader that hit EOF waits for in-flight
// handlers to finish.
//
// The bound is load-bearing, not belt-and-braces: a handler that calls back to
// the far end (an agent asking session/request_permission) is waiting for a
// reply that can no longer arrive, so it would otherwise wait on the drain
// while the drain waits on it.
const serveDrainTimeout = 5 * time.Second

// NewConn creates a connection over the given streams and starts its reader.
//
// closer is invoked by Close to tear the underlying transport down; pass nil
// when the caller owns that lifecycle (as the subprocess path does, where
// shellfx owns the child).
func NewConn(reader io.Reader, writer io.Writer, closer io.Closer, handler Handler) *Conn {
	conn := &Conn{
		writer:  writer,
		closer:  closer,
		handler: handler,
		pending: make(map[int64]chan *message),
		done:    make(chan struct{}),
	}

	go conn.readLoop(reader)

	return conn
}

// Done is closed when the connection stops serving.
func (c *Conn) Done() <-chan struct{} { return c.done }

// Err reports why the connection stopped. Valid only after Done is closed.
func (c *Conn) Err() error { return c.readErr }

// Call sends a request and blocks until the reply arrives, ctx is cancelled, or
// the connection dies.
func (c *Conn) Call(ctx context.Context, method string, params any, result any) error {
	id := c.nextID.Add(1)

	reply := make(chan *message, 1)

	c.pendingMu.Lock()
	c.pending[id] = reply
	c.pendingMu.Unlock()

	defer func() {
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
	}()

	rawID, err := json.Marshal(id)
	if err != nil {
		return fmt.Errorf("marshal request id: %w", err)
	}

	if err := c.write(&message{
		JSONRPC: jsonRPCVersion,
		ID:      rawID,
		Method:  method,
		Params:  mustRaw(params),
	}); err != nil {
		return err
	}

	select {
	case msg := <-reply:
		if msg.Error != nil {
			return fmt.Errorf("%w: %s: %w", ErrRemote, method, msg.Error)
		}

		if result == nil || len(msg.Result) == 0 {
			return nil
		}

		if err := json.Unmarshal(msg.Result, result); err != nil {
			return fmt.Errorf("decode %s result: %w", method, err)
		}

		return nil

	case <-ctx.Done():
		return ctx.Err() //nolint:wrapcheck

	case <-c.done:
		return fmt.Errorf("%w: awaiting %s: %w", ErrConnClosed, method, c.readErr)
	}
}

// Notify sends a notification. It has no id and no reply, so it returns as soon
// as the frame is written -- notably session/cancel, which is why cancellation
// must still drain until the agent actually stops.
func (c *Conn) Notify(method string, params any) error {
	return c.write(&message{
		JSONRPC: jsonRPCVersion,
		Method:  method,
		Params:  mustRaw(params),
	})
}

// Close shuts the connection down and unblocks every waiting Call.
func (c *Conn) Close() error {
	var err error

	c.closeOnce.Do(func() {
		if c.readErr == nil {
			c.readErr = ErrConnClosed
		}

		close(c.done)

		if c.closer != nil {
			err = c.closer.Close()
		}
	})

	return err //nolint:wrapcheck
}

// write serialises one frame. json.Encoder appends the newline that delimits
// frames on the wire.
func (c *Conn) write(msg *message) error {
	select {
	case <-c.done:
		return fmt.Errorf("%w: %w", ErrConnClosed, c.readErr)
	default:
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if err := json.NewEncoder(c.writer).Encode(msg); err != nil {
		return fmt.Errorf("write %s: %w", msg.Method, err)
	}

	return nil
}

// readLoop is the single reader. It demultiplexes replies (matched by id) from
// inbound requests and notifications.
//
// Inbound *requests* are dispatched on their own goroutine deliberately: a
// client-side handler may block for a long time -- session/request_permission
// waits on a human -- and running one inline would stall every other reply on
// the connection behind it.
//
// Inbound *notifications* are served inline, which is equally deliberate and
// for the opposite reason. session/update carries the transcript, and chunk
// order is the transcript: dispatching each on its own goroutine lets two
// chunks race to the session queue and silently swaps them. Serving them here
// makes delivery order the wire order by construction. The cost is that a
// notification handler blocks the reader, which is the backpressure
// updateQueueDepth is designed around -- see the contract on
// ClientHandler.SessionUpdate.
func (c *Conn) readLoop(reader io.Reader) {
	decoder := json.NewDecoder(reader)

	for {
		var msg message

		if err := decoder.Decode(&msg); err != nil {
			c.stop(err)

			return
		}

		select {
		case <-c.done:
			return
		default:
		}

		switch {
		case msg.Method != "" && len(msg.ID) > 0:
			c.serving.Add(1)

			go func() {
				defer c.serving.Done()

				c.serveRequest(&msg)
			}()

		case msg.Method != "":
			// Inline, so notifications reach handlers in wire order. No serving
			// accounting is needed: the reader cannot reach EOF while it is in
			// here, so stop can never race this.
			c.serveNotification(&msg)

		case len(msg.ID) > 0:
			c.deliverReply(&msg)

		default:
			// Neither a method nor an id: not addressable in either direction.
			c.stop(fmt.Errorf("%w: no method and no id", ErrMalformedMessage))

			return
		}
	}
}

// stop records why the reader ended and releases everyone waiting.
//
// Unlike Close, this drains in-flight handlers first. The reader ending means
// the far end stopped *sending*; it does not mean we can no longer write. An
// agent on stdio sees exactly this when its client closes stdin, and exiting
// immediately would truncate the reply to whatever request was in flight.
func (c *Conn) stop(err error) {
	c.closeOnce.Do(func() {
		if errors.Is(err, io.EOF) {
			err = ErrConnClosed
		}

		c.readErr = err

		// done is still open here, so write() lets these replies through.
		c.drainServing()

		close(c.done)

		if c.closer != nil {
			_ = c.closer.Close()
		}
	})
}

// drainServing waits for in-flight handlers, bounded by serveDrainTimeout.
func (c *Conn) drainServing() {
	drained := make(chan struct{})

	go func() {
		defer close(drained)

		c.serving.Wait()
	}()

	timer := time.NewTimer(serveDrainTimeout)
	defer timer.Stop()

	select {
	case <-drained:
	case <-timer.C:
	}
}

// deliverReply routes a response to its waiting Call. An unknown id means the
// caller already gave up (context cancelled) -- dropping it is correct.
func (c *Conn) deliverReply(msg *message) {
	var id int64
	if err := json.Unmarshal(msg.ID, &id); err != nil {
		return
	}

	c.pendingMu.Lock()
	reply, ok := c.pending[id]
	c.pendingMu.Unlock()

	if !ok {
		return
	}

	// Buffered by one, so this never blocks.
	reply <- msg
}

func (c *Conn) serveRequest(msg *message) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Bind the handler's lifetime to the connection: if the agent dies while a
	// permission prompt is open, the handler should unwind rather than linger.
	go func() {
		select {
		case <-c.done:
			cancel()
		case <-ctx.Done():
		}
	}()

	result, err := c.handler.HandleRequest(ctx, msg.Method, msg.Params)

	reply := &message{
		JSONRPC: jsonRPCVersion,
		ID:      msg.ID,
	}

	switch {
	case err == nil:
		reply.Result = mustRaw(result)

	case errors.Is(err, ErrUnhandledMethod):
		reply.Error = &Error{
			Code:    CodeMethodNotFound,
			Message: msg.Method,
		}

	case errors.Is(err, ErrInvalidParams):
		reply.Error = &Error{
			Code:    CodeInvalidParams,
			Message: err.Error(),
		}

	default:
		reply.Error = &Error{
			Code:    CodeInternalError,
			Message: err.Error(),
		}
	}

	// The connection may have died while the handler ran; a failed write here
	// is not actionable.
	_ = c.write(reply)
}

func (c *Conn) serveNotification(msg *message) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		select {
		case <-c.done:
			cancel()
		case <-ctx.Done():
		}
	}()

	// A notification has no reply channel, so an error has nowhere to go.
	_ = c.handler.HandleNotification(ctx, msg.Method, msg.Params)
}

// mustRaw encodes params/results, falling back to JSON null. Marshal failure
// here means a caller passed an unencodable value -- a programmer error that
// must not take the connection down mid-stream.
func mustRaw(value any) json.RawMessage {
	if value == nil {
		return nil
	}

	raw, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage("null")
	}

	return raw
}
