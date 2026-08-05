package acpfx_test

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// This file drives a real Client against a real Agent over one pipe pair.
//
// It is the strongest test in the package because neither side is a fixture:
// both are the code that ships. The fake agent in spawn_test.go hand-rolls
// JSON, so it can only prove the client is self-consistent; here a bug on
// either side shows up as a failed turn.

// scriptedAgent is an AgentHandler whose turn behaviour a test can drive.
type scriptedAgent struct {
	// onPrompt runs the turn. It gets the emit func and the agent, so it can
	// stream updates and call back into the client.
	onPrompt func(ctx context.Context, req *acpfx.PromptRequest, emit acpfx.UpdateFunc) (*acpfx.PromptResponse, error)

	// onInitialize observes the handshake, which is where a test can see what
	// the client advertised about itself.
	onInitialize func(req *acpfx.InitializeRequest)

	mu        sync.Mutex
	cancelled []string
	cancelCh  chan string
}

func (a *scriptedAgent) Initialize(
	_ context.Context,
	req *acpfx.InitializeRequest,
) (*acpfx.InitializeResponse, error) {
	if a.onInitialize != nil {
		a.onInitialize(req)
	}

	// Echo the client's version back, never above it.
	version := req.ProtocolVersion
	if version > acpfx.ProtocolVersion {
		version = acpfx.ProtocolVersion
	}

	return &acpfx.InitializeResponse{
		ProtocolVersion: version,
		AgentInfo: &acpfx.Implementation{
			Name: "scripted", Title: "Scripted Agent", Version: "1.0.0",
		},
		AgentCapabilities: acpfx.AgentCapabilities{
			LoadSession: false,
			Prompt:      acpfx.PromptCapabilities{}, //nolint:exhaustruct
		},
		AuthMethods: nil,
	}, nil
}

func (a *scriptedAgent) NewSession(
	_ context.Context,
	_ *acpfx.NewSessionRequest,
) (*acpfx.NewSessionResponse, error) {
	return &acpfx.NewSessionResponse{SessionID: "loop-1", Modes: nil}, nil
}

func (a *scriptedAgent) Prompt(
	ctx context.Context,
	req *acpfx.PromptRequest,
	emit acpfx.UpdateFunc,
) (*acpfx.PromptResponse, error) {
	return a.onPrompt(ctx, req, emit)
}

func (a *scriptedAgent) Cancel(_ context.Context, note *acpfx.CancelNotification) {
	a.mu.Lock()
	a.cancelled = append(a.cancelled, note.SessionID)
	a.mu.Unlock()

	select {
	case a.cancelCh <- note.SessionID:
	default:
	}
}

// scriptedClient is a ClientHandler that records updates and answers
// permission requests from a script.
type scriptedClient struct {
	onPermission func(req *acpfx.RequestPermissionRequest) acpfx.PermissionOutcome

	mu      sync.Mutex
	updates []acpfx.SessionUpdate
}

func (c *scriptedClient) RequestPermission(
	_ context.Context,
	req *acpfx.RequestPermissionRequest,
) (acpfx.PermissionOutcome, error) {
	if c.onPermission == nil {
		return acpfx.CancelPermission(), nil
	}

	return c.onPermission(req), nil
}

func (c *scriptedClient) SessionUpdate(_ context.Context, note *acpfx.SessionNotification) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.updates = append(c.updates, note.Update)
}

func (c *scriptedClient) snapshot() []acpfx.SessionUpdate {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]acpfx.SessionUpdate(nil), c.updates...)
}

// connect wires a real Client to a real Agent over paired pipes.
func connect(
	t *testing.T,
	client *scriptedClient,
	agent *scriptedAgent,
) (*acpfx.Client, *acpfx.Agent) {
	t.Helper()

	return connectHandler(t, client, agent)
}

// connectHandler is connect for any ClientHandler, so a test can supply one
// that carries extra capabilities.
func connectHandler(
	t *testing.T,
	client acpfx.ClientHandler,
	agent *scriptedAgent,
) (*acpfx.Client, *acpfx.Agent) {
	t.Helper()

	clientReader, agentWriter := io.Pipe()
	agentReader, clientWriter := io.Pipe()

	served := acpfx.NewAgent(agentReader, agentWriter, nil, agent)

	connected, err := acpfx.NewClient(
		t.Context(), clientReader, clientWriter, nil, client,
		&acpfx.Implementation{Name: "loopback", Title: "loopback", Version: "0.0.0"},
	)
	if err != nil {
		t.Fatalf("handshake: %v", err)
	}

	t.Cleanup(func() {
		_ = connected.Close()
		_ = served.Close()
	})

	return connected, served
}

// TestLoopbackPermissionRoundTripDuringTurn is the test the whole symmetric
// design exists for.
//
// The client is blocked inside session/prompt awaiting the turn's response.
// Mid-turn the agent calls back on the same pipe asking permission, and the
// client must answer *while still blocked*. If either side served inbound
// requests on its read loop, this deadlocks: the agent waits for a permission
// answer that the client cannot send, and the client waits for a prompt
// response the agent will never write.
func TestLoopbackPermissionRoundTripDuringTurn(t *testing.T) {
	t.Parallel()

	granted := make(chan string, 1)

	client := &scriptedClient{ //nolint:exhaustruct
		onPermission: func(req *acpfx.RequestPermissionRequest) acpfx.PermissionOutcome {
			granted <- req.ToolCall.ToolCallID

			return acpfx.SelectOption(req.Options[0].OptionID)
		},
	}

	agent := &scriptedAgent{ //nolint:exhaustruct
		cancelCh: make(chan string, 1),
	}

	var served *acpfx.Agent

	agent.onPrompt = func(
		ctx context.Context,
		req *acpfx.PromptRequest,
		emit acpfx.UpdateFunc,
	) (*acpfx.PromptResponse, error) {
		if err := emit(acpfx.SessionUpdate{ //nolint:exhaustruct
			SessionUpdate: acpfx.UpdateAgentThoughtChunk,
			Content:       &acpfx.ContentBlock{Type: acpfx.ContentBlockText, Text: "thinking"}, //nolint:exhaustruct
		}); err != nil {
			return nil, err
		}

		outcome, err := served.RequestPermission(ctx, &acpfx.RequestPermissionRequest{
			SessionID: req.SessionID,
			ToolCall: acpfx.ToolCall{ //nolint:exhaustruct
				ToolCallID: "call-7", Title: "Write file", Kind: "edit",
			},
			Options: []acpfx.PermissionOption{
				{OptionID: "yes", Name: "Allow", Kind: acpfx.PermissionAllowOnce},
				{OptionID: "no", Name: "Reject", Kind: acpfx.PermissionRejectOnce},
			},
		})
		if err != nil {
			return nil, err
		}

		if outcome.OptionID != "yes" {
			return nil, errors.New("client did not grant permission") //nolint:err113
		}

		if err := emit(acpfx.SessionUpdate{ //nolint:exhaustruct
			SessionUpdate: acpfx.UpdateAgentMessageChunk,
			Content:       &acpfx.ContentBlock{Type: acpfx.ContentBlockText, Text: "done"}, //nolint:exhaustruct
		}); err != nil {
			return nil, err
		}

		return &acpfx.PromptResponse{StopReason: acpfx.StopReasonEndTurn}, nil
	}

	connected, servedAgent := connect(t, client, agent)
	served = servedAgent

	session, err := connected.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	resp, err := session.Prompt(t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("go")})
	if err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if resp.StopReason != acpfx.StopReasonEndTurn {
		t.Fatalf("stopReason = %q, want end_turn", resp.StopReason)
	}

	select {
	case id := <-granted:
		if id != "call-7" {
			t.Fatalf("permission asked for %q, want call-7", id)
		}
	default:
		t.Fatal("the turn completed without ever asking permission")
	}

	waitFor(t, "both chunks to arrive", func() bool {
		return len(client.snapshot()) >= 2
	})

	updates := client.snapshot()
	if updates[0].SessionUpdate != acpfx.UpdateAgentThoughtChunk {
		t.Fatalf("first update = %q, want agent_thought_chunk", updates[0].SessionUpdate)
	}

	if updates[1].SessionUpdate != acpfx.UpdateAgentMessageChunk {
		t.Fatalf("second update = %q, want agent_message_chunk", updates[1].SessionUpdate)
	}
}

// TestLoopbackCancelReachesAgentMidTurn pins ACP's cancellation contract.
//
// session/cancel is a notification delivered while the agent is still blocked
// inside Prompt. The turn does not end because the notification arrived -- it
// ends when Prompt returns, and the stop reason must be "cancelled". This is
// the behavioural property schema validation cannot reach.
func TestLoopbackCancelReachesAgentMidTurn(t *testing.T) {
	t.Parallel()

	client := &scriptedClient{onPermission: nil} //nolint:exhaustruct

	agent := &scriptedAgent{ //nolint:exhaustruct
		cancelCh: make(chan string, 1),
	}

	turnEntered := make(chan struct{})

	agent.onPrompt = func(
		_ context.Context,
		_ *acpfx.PromptRequest,
		_ acpfx.UpdateFunc,
	) (*acpfx.PromptResponse, error) {
		close(turnEntered)

		// Block until the client cancels, exactly as a long turn would.
		select {
		case <-agent.cancelCh:
			return &acpfx.PromptResponse{StopReason: acpfx.StopReasonCancelled}, nil
		case <-time.After(15 * time.Second):
			return nil, errors.New("cancel never reached the agent") //nolint:err113
		}
	}

	connected, _ := connect(t, client, agent)

	session, err := connected.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	done := make(chan *acpfx.PromptResponse, 1)
	failed := make(chan error, 1)

	go func() {
		resp, promptErr := session.Prompt(
			t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("long task")},
		)
		if promptErr != nil {
			failed <- promptErr

			return
		}

		done <- resp
	}()

	select {
	case <-turnEntered:
	case <-time.After(10 * time.Second):
		t.Fatal("the agent never entered the turn")
	}

	if err := session.Cancel(t.Context()); err != nil {
		t.Fatalf("Cancel: %v", err)
	}

	select {
	case resp := <-done:
		if resp.StopReason != acpfx.StopReasonCancelled {
			t.Fatalf("stopReason = %q, want cancelled", resp.StopReason)
		}
	case err := <-failed:
		t.Fatalf("Prompt: %v", err)
	case <-time.After(20 * time.Second):
		t.Fatal("the turn never ended after cancel")
	}
}

// TestLoopbackUnsupportedCapabilityIsDeclined pins how an agent says "I do not
// do that" without looking broken: session/load must come back as method not
// found, not an internal error, when the handler does not implement the
// optional interface.
func TestLoopbackUnsupportedCapabilityIsDeclined(t *testing.T) {
	t.Parallel()

	agent := &scriptedAgent{cancelCh: make(chan string, 1)} //nolint:exhaustruct
	agent.onPrompt = func(
		_ context.Context, _ *acpfx.PromptRequest, _ acpfx.UpdateFunc,
	) (*acpfx.PromptResponse, error) {
		return &acpfx.PromptResponse{StopReason: acpfx.StopReasonEndTurn}, nil
	}

	connected, _ := connect(t, &scriptedClient{onPermission: nil}, agent) //nolint:exhaustruct

	// The agent advertised loadSession: false, so the client refuses locally --
	// no round-trip needed, which is itself the correct behaviour.
	_, err := connected.LoadSession(t.Context(), &acpfx.LoadSessionRequest{ //nolint:exhaustruct
		SessionID: "loop-1", Cwd: t.TempDir(),
	})
	if !errors.Is(err, acpfx.ErrLoadSessionUnsup) {
		t.Fatalf("error = %v, want ErrLoadSessionUnsup", err)
	}
}

// waitFor polls until cond holds or the test fails.
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)

	for {
		if cond() {
			return
		}

		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}

		time.Sleep(20 * time.Millisecond)
	}
}
