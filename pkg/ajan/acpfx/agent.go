package acpfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// ErrAgentHandler is returned to the client when a handler fails for a reason
// it did not classify itself.
var ErrAgentHandler = errors.New("acp agent handler failed")

// UpdateFunc streams one session/update for the turn it was handed to.
//
// It is bound to a single session id, so a handler cannot misattribute output,
// and it is valid only for the duration of the call that received it.
type UpdateFunc func(SessionUpdate) error

// AgentHandler is the agent half of ACP: what a client calls on an agent.
//
// This is the mirror of ClientHandler. Implementing it is how a shim presents a
// vendor CLI as an ACP agent -- the translation layer Phase 4 needs so that
// everything upstream of the shim speaks one protocol.
type AgentHandler interface {
	// Initialize negotiates the protocol version and capabilities. The agent
	// must not choose a version higher than the client asked for.
	Initialize(ctx context.Context, req *InitializeRequest) (*InitializeResponse, error)

	// NewSession starts a session rooted at req.Cwd.
	NewSession(ctx context.Context, req *NewSessionRequest) (*NewSessionResponse, error)

	// Prompt runs one turn and blocks until it ends -- that is v1 semantics.
	// Stream the turn's output through emit; the returned stop reason ends it.
	Prompt(ctx context.Context, req *PromptRequest, emit UpdateFunc) (*PromptResponse, error)

	// Cancel asks the turn to stop. It is a notification, so it cannot fail and
	// cannot reply: the turn ends when Prompt returns StopReasonCancelled.
	//
	// This runs on its own goroutine while Prompt is still blocked, which is the
	// whole reason inbound requests are not served on the read loop.
	Cancel(ctx context.Context, note *CancelNotification)
}

// AgentAuthenticator is the optional authenticate capability.
type AgentAuthenticator interface {
	Authenticate(ctx context.Context, req *AuthenticateRequest) error
}

// AgentSessionLoader is the optional session/load capability. An agent that
// implements it must also advertise loadSession in its InitializeResponse.
type AgentSessionLoader interface {
	LoadSession(ctx context.Context, req *LoadSessionRequest) (*LoadSessionResponse, error)
}

// AgentModeSetter is the optional session/set_mode capability.
type AgentModeSetter interface {
	SetMode(ctx context.Context, req *SetSessionModeRequest) error
}

// Agent serves the agent side of an ACP connection.
//
// It is the same Conn the client uses, with the roles swapped: the connection
// is symmetric, so an agent can call back into the client (RequestPermission,
// fs/*, terminal/*) over the same pipe it is being driven on.
type Agent struct {
	conn    *Conn
	handler AgentHandler
}

// NewAgent serves handler over the given streams.
//
// For a shim this is os.Stdin and os.Stdout: ACP agents are spawned as
// subprocesses and speak on their own stdio.
func NewAgent(
	reader io.Reader,
	writer io.Writer,
	closer io.Closer,
	handler AgentHandler,
) *Agent {
	agent := &Agent{handler: handler, conn: nil}
	agent.conn = NewConn(reader, writer, closer, agent)

	return agent
}

// SendUpdate streams one session/update to the client.
//
// Updates are notifications: they are fire-and-forget and must not be used to
// carry anything the agent needs an answer to.
func (a *Agent) SendUpdate(sessionID string, update SessionUpdate) error {
	return a.conn.Notify(MethodSessionUpdate, &SessionNotification{
		SessionID: sessionID,
		Update:    update,
	})
}

// updater binds SendUpdate to one session id.
func (a *Agent) updater(sessionID string) UpdateFunc {
	return func(update SessionUpdate) error {
		return a.SendUpdate(sessionID, update)
	}
}

// RequestPermission asks the client to approve a tool call.
//
// This is the agent calling the client, mid-turn, while the client is blocked
// awaiting the same turn's session/prompt response. It works only because
// neither side serves inbound requests on its read loop.
func (a *Agent) RequestPermission(
	ctx context.Context,
	req *RequestPermissionRequest,
) (PermissionOutcome, error) {
	var resp RequestPermissionResponse

	if err := a.conn.Call(ctx, MethodRequestPermission, req, &resp); err != nil {
		return PermissionOutcome{}, fmt.Errorf("session/request_permission: %w", err) //nolint:exhaustruct
	}

	return resp.Outcome, nil
}

// callClient issues one agent -> client request.
//
// A free function rather than a method because Go has no generic methods, and
// the alternative -- an any/any pair per call site -- is what let the fs
// helpers here go untyped while the wire types existed all along.
func callClient[Req any, Resp any](
	ctx context.Context,
	agent *Agent,
	method string,
	req *Req,
) (*Resp, error) {
	var resp Resp

	if err := agent.conn.Call(ctx, method, req, &resp); err != nil {
		return nil, fmt.Errorf("%s: %w", method, err)
	}

	return &resp, nil
}

// ReadTextFile asks the client to read a file. Valid only when the client
// advertised the fs.readTextFile capability.
func (a *Agent) ReadTextFile(
	ctx context.Context,
	req *ReadTextFileRequest,
) (*ReadTextFileResponse, error) {
	return callClient[ReadTextFileRequest, ReadTextFileResponse](
		ctx, a, MethodFsReadTextFile, req,
	)
}

// WriteTextFile asks the client to write a file. Valid only when the client
// advertised the fs.writeTextFile capability.
func (a *Agent) WriteTextFile(
	ctx context.Context,
	req *WriteTextFileRequest,
) (*WriteTextFileResponse, error) {
	return callClient[WriteTextFileRequest, WriteTextFileResponse](
		ctx, a, MethodFsWriteTextFile, req,
	)
}

// CreateTerminal asks the client to run a command. Valid only when the client
// advertised the terminal capability.
func (a *Agent) CreateTerminal(
	ctx context.Context,
	req *CreateTerminalRequest,
) (*CreateTerminalResponse, error) {
	return callClient[CreateTerminalRequest, CreateTerminalResponse](
		ctx, a, MethodTerminalCreate, req,
	)
}

// TerminalOutput reads what a command has printed so far.
func (a *Agent) TerminalOutput(
	ctx context.Context,
	req *TerminalOutputRequest,
) (*TerminalOutputResponse, error) {
	return callClient[TerminalOutputRequest, TerminalOutputResponse](
		ctx, a, MethodTerminalOutput, req,
	)
}

// WaitForTerminalExit blocks until a command ends.
func (a *Agent) WaitForTerminalExit(
	ctx context.Context,
	req *WaitForTerminalExitRequest,
) (*WaitForTerminalExitResponse, error) {
	return callClient[WaitForTerminalExitRequest, WaitForTerminalExitResponse](
		ctx, a, MethodTerminalWaitForExit, req,
	)
}

// KillTerminal ends a command without releasing its output.
func (a *Agent) KillTerminal(
	ctx context.Context,
	req *KillTerminalRequest,
) (*KillTerminalResponse, error) {
	return callClient[KillTerminalRequest, KillTerminalResponse](
		ctx, a, MethodTerminalKill, req,
	)
}

// ReleaseTerminal frees a terminal and everything it retained.
func (a *Agent) ReleaseTerminal(
	ctx context.Context,
	req *ReleaseTerminalRequest,
) (*ReleaseTerminalResponse, error) {
	return callClient[ReleaseTerminalRequest, ReleaseTerminalResponse](
		ctx, a, MethodTerminalRelease, req,
	)
}

// Done is closed when the connection stops serving.
func (a *Agent) Done() <-chan struct{} { return a.conn.Done() }

// Err reports why the connection stopped. Valid only after Done is closed.
func (a *Agent) Err() error { return a.conn.Err() }

// Close tears the connection down.
func (a *Agent) Close() error { return a.conn.Close() }

// ---------------------------------------------------------------------------
// Handler: the methods the client calls on us
// ---------------------------------------------------------------------------

func (a *Agent) HandleRequest(
	ctx context.Context,
	method string,
	params json.RawMessage,
) (any, error) {
	switch method {
	case MethodInitialize:
		return decodeAndCall(params, a.handler.Initialize, ctx)

	case MethodSessionNew:
		return decodeAndCall(params, a.handler.NewSession, ctx)

	case MethodSessionPrompt:
		return a.handlePrompt(ctx, params)

	case MethodAuthenticate:
		return a.handleAuthenticate(ctx, params)

	case MethodSessionLoad:
		return a.handleLoadSession(ctx, params)

	case MethodSessionSetMode:
		return a.handleSetMode(ctx, params)

	default:
		return nil, ErrUnhandledMethod
	}
}

func (a *Agent) HandleNotification(
	ctx context.Context,
	method string,
	params json.RawMessage,
) error {
	if method != MethodSessionCancel {
		return nil
	}

	var note CancelNotification
	if err := json.Unmarshal(params, &note); err != nil {
		return fmt.Errorf("decode session/cancel: %w", err)
	}

	a.handler.Cancel(ctx, &note)

	return nil
}

func (a *Agent) handlePrompt(ctx context.Context, params json.RawMessage) (any, error) {
	var req PromptRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("decode session/prompt: %w", err)
	}

	resp, err := a.handler.Prompt(ctx, &req, a.updater(req.SessionID))
	if err != nil {
		return nil, err
	}

	return resp, nil
}

func (a *Agent) handleAuthenticate(ctx context.Context, params json.RawMessage) (any, error) {
	auth, ok := a.handler.(AgentAuthenticator)
	if !ok {
		return nil, ErrUnhandledMethod
	}

	var req AuthenticateRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("decode authenticate: %w", err)
	}

	if err := auth.Authenticate(ctx, &req); err != nil {
		return nil, err
	}

	// An empty object, not null: the schema models this as a response type.
	return struct{}{}, nil
}

func (a *Agent) handleLoadSession(ctx context.Context, params json.RawMessage) (any, error) {
	loader, ok := a.handler.(AgentSessionLoader)
	if !ok {
		return nil, ErrUnhandledMethod
	}

	var req LoadSessionRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("decode session/load: %w", err)
	}

	resp, err := loader.LoadSession(ctx, &req)
	if err != nil {
		return nil, err
	}

	return resp, nil
}

func (a *Agent) handleSetMode(ctx context.Context, params json.RawMessage) (any, error) {
	setter, ok := a.handler.(AgentModeSetter)
	if !ok {
		return nil, ErrUnhandledMethod
	}

	var req SetSessionModeRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("decode session/set_mode: %w", err)
	}

	if err := setter.SetMode(ctx, &req); err != nil {
		return nil, err
	}

	return struct{}{}, nil
}

// decodeAndCall decodes params into R and invokes fn. The ctx argument comes
// last so the generic parameters stay inferable at the call site.
func decodeAndCall[R any, T any](
	params json.RawMessage,
	fn func(context.Context, *R) (*T, error),
	ctx context.Context, //nolint:revive
) (any, error) {
	var req R

	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("decode request: %w", err)
	}

	resp, err := fn(ctx, &req)
	if err != nil {
		return nil, err
	}

	return resp, nil
}
