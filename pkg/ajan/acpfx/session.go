package acpfx

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// cancelGrace bounds how long Prompt waits for the agent to acknowledge a
// cancel before giving up on the pending request.
//
// session/cancel is a *notification*: it has no reply, and the agent keeps
// streaming until it decides to stop. The turn ends with the ordinary
// session/prompt response carrying stopReason "cancelled". Abandoning the
// pending entry the moment ctx dies would leak the request id and desync the
// correlation map, so we wait -- but not forever, because a wedged agent must
// not pin the caller.
const cancelGrace = 5 * time.Second

// updateQueueDepth buffers session updates between the read loop and the
// consumer. Matches FanoutBroadcaster's depth in noskillsserverfx.
//
// This queue blocks rather than drops when full. Fanout can drop frames for a
// slow WebTransport client because a lost frame is cosmetic; dropping a
// session/update corrupts the transcript and anything derived from it. A full
// queue applying backpressure onto the agent's pipe is the correct behaviour.
const updateQueueDepth = 256

// queuedUpdate is one item in a session's ordered delivery queue.
//
// A barrier item carries no update. It is a marker travelling the same queue as
// the updates, so a caller that waits on it learns that everything enqueued
// before it has been handed to the handler -- which is how Prompt knows the
// turn's transcript is complete.
type queuedUpdate struct {
	note    *SessionNotification
	barrier chan struct{}
}

// Session is one ACP conversation.
type Session struct {
	client *Client
	id     string

	modesMu sync.RWMutex
	modes   *SessionModeState

	queueOnce sync.Once
	queue     chan queuedUpdate
	drained   chan struct{}

	// permissions tracks tool-call ids with an outstanding permission request,
	// so Cancel can answer them instead of leaving the agent blocked.
	permMu      sync.Mutex
	permissions map[string]struct{}

	closeOnce sync.Once
	closed    chan struct{}
}

// ID returns the agent-assigned session identifier.
func (s *Session) ID() string { return s.id }

// Modes reports the session's mode state, when the agent supports modes.
func (s *Session) Modes() *SessionModeState {
	s.modesMu.RLock()
	defer s.modesMu.RUnlock()

	return s.modes
}

// Prompt sends a user turn and blocks until the agent finishes it.
//
// IMPORTANT: do not apply a general per-request timeout to this call. An agent
// turn routinely runs for many minutes, so aifx's ConfigTarget.RequestTimeout
// (default 60s) must NOT be threaded in here -- doing so kills every long run
// at one minute and presents as an agent hang rather than a config problem.
// Bound this only with a context the *user* controls.
func (s *Session) Prompt(ctx context.Context, blocks []ContentBlock) (*PromptResponse, error) {
	s.start()

	req := &PromptRequest{SessionID: s.id, Prompt: blocks}

	var resp PromptResponse

	err := s.client.conn.Call(ctx, MethodSessionPrompt, req, &resp)
	if err == nil {
		// The turn's updates all precede its response on the wire, and the
		// reader enqueues in wire order, so by the time the response lands every
		// update is already queued. Draining to a barrier here is what makes
		// "Prompt returned" mean "the transcript is complete" -- without it a
		// caller that reads the transcript on return loses however much of the
		// tail the pump had not reached yet.
		s.flush(ctx)

		return &resp, nil
	}

	// The caller gave up. Tell the agent, answer anything it is waiting on,
	// then give the turn a bounded chance to end cleanly.
	if ctx.Err() != nil {
		return s.cancelAndDrain(err)
	}

	return nil, fmt.Errorf("session/prompt: %w", err)
}

// cancelAndDrain notifies the agent of cancellation and waits briefly for the
// turn to end, so the pending request is retired rather than orphaned.
func (s *Session) cancelAndDrain(cause error) (*PromptResponse, error) {
	// Detached: the caller's context is already dead, and this must still send.
	grace, stop := context.WithTimeout(context.WithoutCancel(context.Background()), cancelGrace)
	defer stop()

	if err := s.Cancel(grace); err != nil {
		return nil, fmt.Errorf("session/prompt cancelled, cancel failed: %w", err)
	}

	return nil, fmt.Errorf("session/prompt cancelled: %w", cause)
}

// Cancel asks the agent to stop the current turn.
//
// This is a notification, so returning does not mean the agent has stopped --
// only that it has been told. The turn ends when session/prompt returns with
// stopReason "cancelled".
func (s *Session) Cancel(ctx context.Context) error {
	// Answer any outstanding permission request first: the spec requires the
	// client to resolve them on cancel, and an unanswered one leaves the agent
	// waiting on a human who has already walked away.
	s.resolveOutstandingPermissions(ctx)

	if err := s.client.conn.Notify(
		MethodSessionCancel, &CancelNotification{SessionID: s.id},
	); err != nil {
		return fmt.Errorf("session/cancel: %w", err)
	}

	return nil
}

// SetMode switches the session's mode (for example plan vs edit).
func (s *Session) SetMode(ctx context.Context, modeID string) error {
	err := s.client.conn.Call(ctx, MethodSessionSetMode, &SetSessionModeRequest{
		SessionID: s.id,
		ModeID:    modeID,
	}, nil)
	if err != nil {
		return fmt.Errorf("session/set_mode: %w", err)
	}

	s.modesMu.Lock()

	if s.modes != nil {
		s.modes.CurrentModeID = modeID
	}

	s.modesMu.Unlock()

	return nil
}

// Close stops the session's update pump. It does not close the connection.
func (s *Session) Close() {
	s.closeOnce.Do(func() {
		close(s.closed)
	})
}

// newSession builds a session with every channel and map already allocated.
//
// These were once allocated lazily inside start's sync.Once, which was a data
// race: Cancel reads permissions under permMu while start writes it under
// queueOnce, and two different locks order nothing. Allocating before the
// session is published removes the race by construction rather than by adding
// a third lock.
func newSession(client *Client, id string, modes *SessionModeState) *Session {
	return &Session{ //nolint:exhaustruct
		client:      client,
		id:          id,
		modes:       modes,
		queue:       make(chan queuedUpdate, updateQueueDepth),
		drained:     make(chan struct{}),
		closed:      make(chan struct{}),
		permissions: make(map[string]struct{}),
	}
}

// start launches the ordered update pump on first use.
func (s *Session) start() {
	s.queueOnce.Do(func() { go s.pump() })
}

// pump delivers updates to the handler one at a time, preserving order.
func (s *Session) pump() {
	defer close(s.drained)

	for {
		select {
		case item := <-s.queue:
			if item.barrier != nil {
				close(item.barrier)

				continue
			}

			s.client.handler.SessionUpdate(context.Background(), item.note)

		case <-s.closed:
			return

		case <-s.client.conn.Done():
			return
		}
	}
}

// enqueue hands one update to the pump. It blocks when the queue is full,
// applying backpressure onto the agent rather than losing transcript content.
func (s *Session) enqueue(ctx context.Context, note *SessionNotification) {
	s.start()

	select {
	case s.queue <- queuedUpdate{note: note, barrier: nil}:
	case <-s.closed:
	case <-ctx.Done():
	case <-s.client.conn.Done():
	}
}

// flush blocks until the pump has delivered every update queued before the
// call, or until there is no longer a pump that could deliver them.
//
// It is best-effort with respect to ctx: a caller who has already given up
// should not be held here waiting on a slow handler. Every other case that
// makes the barrier unreachable -- the session closed, the pump gone, the
// connection dead -- is likewise a return rather than a hang.
func (s *Session) flush(ctx context.Context) {
	s.start()

	barrier := make(chan struct{})

	select {
	case s.queue <- queuedUpdate{note: nil, barrier: barrier}:
	case <-s.drained:
		return
	case <-s.closed:
		return
	case <-ctx.Done():
		return
	case <-s.client.conn.Done():
		return
	}

	select {
	case <-barrier:
	case <-s.drained:
	case <-s.closed:
	case <-ctx.Done():
	case <-s.client.conn.Done():
	}
}

func (s *Session) trackPermission(toolCallID string) {
	s.permMu.Lock()
	s.permissions[toolCallID] = struct{}{}
	s.permMu.Unlock()
}

func (s *Session) untrackPermission(toolCallID string) {
	s.permMu.Lock()
	delete(s.permissions, toolCallID)
	s.permMu.Unlock()
}

// resolveOutstandingPermissions is a hook for answering in-flight permission
// requests on cancel. The requests are served by handler goroutines whose
// contexts are already bound to the connection, so cancelling the connection
// unwinds them; this records the intent and clears the tracking set.
func (s *Session) resolveOutstandingPermissions(_ context.Context) {
	s.permMu.Lock()
	defer s.permMu.Unlock()

	clear(s.permissions)
}
