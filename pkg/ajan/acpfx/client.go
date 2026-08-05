package acpfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"
)

// Sentinel errors for the client.
var (
	ErrProtocolVersion  = errors.New("acp protocol version not supported by agent")
	ErrAuthRequired     = errors.New("acp agent requires authentication")
	ErrLoadSessionUnsup = errors.New("acp agent does not support session/load")
)

// ClientHandler is the baseline every ACP client must serve.
//
// Optional capabilities are separate interfaces (FsHandler, TerminalHandler) so
// that what we advertise in initialize is derived from what the handler
// actually implements, and the two cannot drift apart.
type ClientHandler interface {
	// RequestPermission decides whether a tool call may proceed. It may block
	// for a long time -- a human is often the decider -- which is why inbound
	// requests are dispatched off the read loop.
	RequestPermission(
		ctx context.Context,
		req *RequestPermissionRequest,
	) (PermissionOutcome, error)

	// SessionUpdate receives one streamed change. Calls for a given session
	// arrive in order; chunk order is the transcript, so this must not be
	// reordered or dropped.
	//
	// It must not call back into the connection -- no Prompt, no Cancel, no
	// waiting on anything that needs a reply from the agent. Updates are
	// delivered from a bounded queue that applies backpressure to the reader
	// when full, so a handler that blocks on the connection blocks the reply it
	// is blocking on. Hand slow work to another goroutine instead.
	SessionUpdate(ctx context.Context, note *SessionNotification)
}

// FsHandler is the optional fs/* capability. Host implements it.
type FsHandler interface {
	ReadTextFile(ctx context.Context, req *ReadTextFileRequest) (*ReadTextFileResponse, error)
	WriteTextFile(ctx context.Context, req *WriteTextFileRequest) (*WriteTextFileResponse, error)
}

// TerminalHandler is the optional terminal/* capability. Host implements it.
//
// Back this with shellfx/exec, not shellfx/pty: ACP terminals keep stdout and
// stderr distinguishable, while a PTY merges them and injects VT escape
// sequences, which would corrupt every tool output the agent reads back.
type TerminalHandler interface {
	CreateTerminal(
		ctx context.Context, req *CreateTerminalRequest,
	) (*CreateTerminalResponse, error)
	TerminalOutput(
		ctx context.Context, req *TerminalOutputRequest,
	) (*TerminalOutputResponse, error)
	ReleaseTerminal(
		ctx context.Context, req *ReleaseTerminalRequest,
	) (*ReleaseTerminalResponse, error)
	WaitForExit(
		ctx context.Context, req *WaitForTerminalExitRequest,
	) (*WaitForTerminalExitResponse, error)
	KillTerminal(
		ctx context.Context, req *KillTerminalRequest,
	) (*KillTerminalResponse, error)
}

// SessionRoots are the directories a session is scoped to.
type SessionRoots struct {
	Cwd                   string
	AdditionalDirectories []string
}

// SessionObserver, when implemented by a ClientHandler, is told about every
// session as it is created or loaded.
//
// This is how a capability handler learns which directories a session may
// touch. Routing it through the handler rather than a separate registration
// call is deliberate: a client that embeds Host is wired by construction, so
// there is no setup step to forget, and a handler that never hears about a
// session denies it rather than falling back to some ambient default.
type SessionObserver interface {
	SessionStarted(sessionID string, roots SessionRoots)
}

// process is the subset of a spawned child that Client needs for shutdown.
//
// Kept as an interface so the stream-only constructor stays free of any
// process concept, and so tests can drive a Client over plain pipes.
type process interface {
	// CloseStdin signals shutdown without killing: ACP agents exit on stdin EOF.
	CloseStdin() error

	// Exited closes once the child has been reaped.
	Exited() <-chan struct{}

	io.Closer
}

// Client is a connected ACP agent.
type Client struct {
	conn    *Conn
	handler ClientHandler
	info    *Implementation

	// proc is set only when this client spawned its own agent; nil when the
	// caller supplied the streams and owns the far end.
	proc process

	agent     AgentCapabilities
	agentInfo *Implementation
	auth      []AuthMethod

	sessionsMu sync.RWMutex
	sessions   map[string]*Session
}

// NewClient wraps an established byte stream in an ACP client and performs the
// initialize handshake.
//
// Capabilities are derived from handler by interface assertion, so advertising
// and serving can never disagree.
func NewClient(
	ctx context.Context,
	reader io.Reader,
	writer io.Writer,
	closer io.Closer,
	handler ClientHandler,
	info *Implementation,
) (*Client, error) {
	return newClient(ctx, reader, writer, closer, nil, handler, info)
}

func newClient(
	ctx context.Context,
	reader io.Reader,
	writer io.Writer,
	closer io.Closer,
	proc process,
	handler ClientHandler,
	info *Implementation,
) (*Client, error) {
	client := &Client{ //nolint:exhaustruct
		handler:  handler,
		info:     info,
		proc:     proc,
		sessions: make(map[string]*Session),
	}

	client.conn = NewConn(reader, writer, closer, client)

	if err := client.initialize(ctx); err != nil {
		_ = client.conn.Close()

		return nil, err
	}

	return client, nil
}

// capabilities derives what we advertise from what the handler implements.
func (c *Client) capabilities() ClientCapabilities {
	caps := ClientCapabilities{} //nolint:exhaustruct

	if fs, ok := c.handler.(FsHandler); ok && fs != nil {
		caps.Fs.ReadTextFile = true
		caps.Fs.WriteTextFile = true
	}

	if term, ok := c.handler.(TerminalHandler); ok && term != nil {
		caps.Terminal = true
	}

	return caps
}

func (c *Client) initialize(ctx context.Context) error {
	var resp InitializeResponse

	err := c.conn.Call(ctx, MethodInitialize, &InitializeRequest{
		ProtocolVersion:    ProtocolVersion,
		ClientCapabilities: c.capabilities(),
		ClientInfo:         c.info,
	}, &resp)
	if err != nil {
		return fmt.Errorf("initialize: %w", err)
	}

	// The agent picks the version. A higher number means it ignored our
	// request and we would be decoding a shape we do not implement.
	if resp.ProtocolVersion > ProtocolVersion {
		return fmt.Errorf(
			"%w: agent chose v%d, this client speaks v%d",
			ErrProtocolVersion, resp.ProtocolVersion, ProtocolVersion,
		)
	}

	c.agent = resp.AgentCapabilities
	c.agentInfo = resp.AgentInfo
	c.auth = resp.AuthMethods

	return nil
}

// AgentCapabilities reports what the agent advertised.
func (c *Client) AgentCapabilities() AgentCapabilities { return c.agent }

// AgentInfo reports the agent's implementation identity, if it sent one.
func (c *Client) AgentInfo() *Implementation { return c.agentInfo }

// AuthMethods lists authentication methods the agent offers.
//
// A non-empty list means Authenticate must be called before session/new, and
// callers should surface it as an actionable error rather than letting the
// first session/new fail with a generic RPC error.
func (c *Client) AuthMethods() []AuthMethod { return c.auth }

// Authenticate performs the agent's authentication flow.
func (c *Client) Authenticate(ctx context.Context, methodID string) error {
	if err := c.conn.Call(
		ctx, MethodAuthenticate, &AuthenticateRequest{MethodID: methodID}, nil,
	); err != nil {
		return fmt.Errorf("authenticate: %w", err)
	}

	return nil
}

// NewSession starts a session rooted at cwd.
func (c *Client) NewSession(ctx context.Context, req *NewSessionRequest) (*Session, error) {
	if len(c.auth) > 0 {
		return nil, fmt.Errorf("%w: methods available: %d", ErrAuthRequired, len(c.auth))
	}

	// Required by the schema even when empty; a nil slice marshals to null and
	// agents reject it.
	if req.McpServers == nil {
		req.McpServers = []McpServer{}
	}

	var resp NewSessionResponse

	if err := c.conn.Call(ctx, MethodSessionNew, req, &resp); err != nil {
		return nil, fmt.Errorf("session/new: %w", err)
	}

	return c.registerSession(resp.SessionID, resp.Modes, SessionRoots{
		Cwd:                   req.Cwd,
		AdditionalDirectories: req.AdditionalDirectories,
	}), nil
}

// LoadSession resumes a previous session. Only valid when the agent advertised
// the loadSession capability.
func (c *Client) LoadSession(ctx context.Context, req *LoadSessionRequest) (*Session, error) {
	if !c.agent.LoadSession {
		return nil, ErrLoadSessionUnsup
	}

	if req.McpServers == nil {
		req.McpServers = []McpServer{}
	}

	var resp LoadSessionResponse

	if err := c.conn.Call(ctx, MethodSessionLoad, req, &resp); err != nil {
		return nil, fmt.Errorf("session/load: %w", err)
	}

	// The agent replays history as session/update notifications after load;
	// they arrive through the normal handler path.
	return c.registerSession(req.SessionID, resp.Modes, SessionRoots{
		Cwd:                   req.Cwd,
		AdditionalDirectories: req.AdditionalDirectories,
	}), nil
}

func (c *Client) registerSession(
	id string,
	modes *SessionModeState,
	roots SessionRoots,
) *Session {
	session := newSession(c, id, modes)

	c.sessionsMu.Lock()
	c.sessions[id] = session
	c.sessionsMu.Unlock()

	// Before returning: the agent may issue an fs or terminal request the
	// moment session/new is answered, and a handler that has not yet been told
	// the roots would deny it.
	if observer, ok := c.handler.(SessionObserver); ok {
		observer.SessionStarted(id, roots)
	}

	return session
}

func (c *Client) lookupSession(id string) *Session {
	c.sessionsMu.RLock()
	defer c.sessionsMu.RUnlock()

	return c.sessions[id]
}

// Close tears the connection down and unblocks every in-flight call.
//
// For a spawned agent this is graceful first: stdin EOF is ACP's shutdown
// signal, so the agent gets shutdownGrace to flush and exit on its own before
// the connection close kills it. An agent killed mid-write can leave a
// half-written frame and a truncated transcript, which is why the courtesy is
// worth the wait.
func (c *Client) Close() error {
	if c.proc != nil {
		_ = c.proc.CloseStdin()

		timer := time.NewTimer(shutdownGrace)
		defer timer.Stop()

		select {
		case <-c.proc.Exited():
		case <-timer.C:
		}
	}

	return c.conn.Close()
}

// Done is closed when the underlying connection stops.
func (c *Client) Done() <-chan struct{} { return c.conn.Done() }

// ---------------------------------------------------------------------------
// Handler: the methods the agent calls on us
// ---------------------------------------------------------------------------

func (c *Client) HandleRequest(
	ctx context.Context,
	method string,
	params json.RawMessage,
) (any, error) {
	switch method {
	case MethodRequestPermission:
		return c.handlePermission(ctx, params)

	case MethodFsReadTextFile, MethodFsWriteTextFile:
		fs, ok := c.handler.(FsHandler)
		if !ok {
			return nil, ErrUnhandledMethod
		}

		return dispatchFs(ctx, fs, method, params)

	case MethodTerminalCreate, MethodTerminalOutput, MethodTerminalRelease,
		MethodTerminalWaitForExit, MethodTerminalKill:
		term, ok := c.handler.(TerminalHandler)
		if !ok {
			return nil, ErrUnhandledMethod
		}

		return dispatchTerminal(ctx, term, method, params)

	default:
		return nil, ErrUnhandledMethod
	}
}

func (c *Client) handlePermission(
	ctx context.Context,
	params json.RawMessage,
) (any, error) {
	var req RequestPermissionRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("decode permission request: %w", err)
	}

	// Track it so a cancel can answer it rather than leaving the agent waiting.
	if session := c.lookupSession(req.SessionID); session != nil {
		session.trackPermission(req.ToolCall.ToolCallID)
		defer session.untrackPermission(req.ToolCall.ToolCallID)
	}

	outcome, err := c.handler.RequestPermission(ctx, &req)
	if err != nil {
		return nil, err
	}

	return &RequestPermissionResponse{Outcome: outcome}, nil
}

// decodeParams unmarshals an inbound payload.
//
// A payload we cannot parse is the agent's error, not ours, so it is reported
// as invalid params rather than an internal failure.
func decodeParams[T any](method string, params json.RawMessage, dst *T) error {
	if err := json.Unmarshal(params, dst); err != nil {
		return fmt.Errorf("%w: %s: %w", ErrInvalidParams, method, err)
	}

	return nil
}

func dispatchFs(
	ctx context.Context,
	fs FsHandler,
	method string,
	params json.RawMessage,
) (any, error) {
	switch method {
	case MethodFsReadTextFile:
		var req ReadTextFileRequest
		if err := decodeParams(method, params, &req); err != nil {
			return nil, err
		}

		return fs.ReadTextFile(ctx, &req)

	case MethodFsWriteTextFile:
		var req WriteTextFileRequest
		if err := decodeParams(method, params, &req); err != nil {
			return nil, err
		}

		return fs.WriteTextFile(ctx, &req)

	default:
		return nil, ErrUnhandledMethod
	}
}

func dispatchTerminal(
	ctx context.Context,
	term TerminalHandler,
	method string,
	params json.RawMessage,
) (any, error) {
	switch method {
	case MethodTerminalCreate:
		var req CreateTerminalRequest
		if err := decodeParams(method, params, &req); err != nil {
			return nil, err
		}

		return term.CreateTerminal(ctx, &req)

	case MethodTerminalOutput:
		var req TerminalOutputRequest
		if err := decodeParams(method, params, &req); err != nil {
			return nil, err
		}

		return term.TerminalOutput(ctx, &req)

	case MethodTerminalRelease:
		var req ReleaseTerminalRequest
		if err := decodeParams(method, params, &req); err != nil {
			return nil, err
		}

		return term.ReleaseTerminal(ctx, &req)

	case MethodTerminalWaitForExit:
		var req WaitForTerminalExitRequest
		if err := decodeParams(method, params, &req); err != nil {
			return nil, err
		}

		return term.WaitForExit(ctx, &req)

	case MethodTerminalKill:
		var req KillTerminalRequest
		if err := decodeParams(method, params, &req); err != nil {
			return nil, err
		}

		return term.KillTerminal(ctx, &req)

	default:
		return nil, ErrUnhandledMethod
	}
}

func (c *Client) HandleNotification(
	ctx context.Context,
	method string,
	params json.RawMessage,
) error {
	if method != MethodSessionUpdate {
		return nil
	}

	var note SessionNotification
	if err := json.Unmarshal(params, &note); err != nil {
		return fmt.Errorf("decode session update: %w", err)
	}

	if session := c.lookupSession(note.SessionID); session != nil {
		session.enqueue(ctx, &note)

		return nil
	}

	// An update for a session we do not know: deliver it anyway rather than
	// dropping transcript content.
	c.handler.SessionUpdate(ctx, &note)

	return nil
}
