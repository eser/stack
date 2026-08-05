// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package shim presents a vendor coding-agent CLI as an ACP agent.
//
// This is the agent (server) half: an ACP client drives the shim on stdio, and
// the shim drives the vendor CLI beneath. It is the same role Zed's
// claude-code-acp and codex-acp play, implemented here so the stack has no
// dependency on a third-party Node adapter -- and so behavioural conformance
// can be tested against an agent we ship rather than one we install.
//
// The translation is deliberately narrow. A backend converts between one
// vendor's wire format and ACP; everything else -- session bookkeeping,
// cancellation, capability negotiation -- lives here and is shared.
package shim

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// Sentinel errors for the shim.
var (
	ErrUnknownSession = errors.New("acp shim: unknown session")
	ErrBackendFailed  = errors.New("acp shim: backend failed")
)

// Turn is one prompt exchange in progress, as the backend sees it.
type Turn struct {
	// SessionID identifies the ACP session the turn belongs to.
	SessionID string

	// VendorSessionID is the backend's own identifier for the conversation,
	// used to resume it. Empty until the vendor reports one.
	VendorSessionID string

	// Cwd is the working directory negotiated at session/new.
	Cwd string

	// Prompt is the user's turn.
	Prompt []acpfx.ContentBlock

	// Emit streams session/update notifications for this turn.
	Emit acpfx.UpdateFunc
}

// Backend translates one vendor CLI to and from ACP.
//
// Implementations own the subprocess. RunTurn must honour ctx: a cancelled
// context means the client asked to stop, and the turn should end with
// StopReasonCancelled rather than an error.
type Backend interface {
	// Name identifies the backend in initialize, e.g. "claude-code".
	Name() string

	// Capabilities reports what this vendor can actually do. Declaring less
	// than ACP allows is the honest way to represent a vendor gap -- today
	// those gaps are silent behavioural differences.
	Capabilities() acpfx.AgentCapabilities

	// RunTurn executes one prompt and streams its output through turn.Emit.
	// The returned vendor session id, when non-empty, is remembered for resume.
	RunTurn(ctx context.Context, turn *Turn) (acpfx.StopReason, string, error)
}

// session is one ACP conversation and its in-flight turn, if any.
type session struct {
	cwd             string
	vendorSessionID string

	// cancel stops the in-flight turn. Nil when no turn is running.
	cancel context.CancelFunc
}

// Shim is an acpfx.AgentHandler backed by a vendor CLI.
type Shim struct {
	backend Backend
	version string

	mu       sync.Mutex
	sessions map[string]*session
	nextID   int
}

// New builds a shim over backend. version is reported as the agent's own
// version in initialize.
func New(backend Backend, version string) *Shim {
	return &Shim{
		backend:  backend,
		version:  version,
		sessions: make(map[string]*session),
		nextID:   0,
	}
}

// Initialize negotiates the protocol version and reports the backend's
// capabilities.
func (s *Shim) Initialize(
	_ context.Context,
	req *acpfx.InitializeRequest,
) (*acpfx.InitializeResponse, error) {
	// Never answer above what the client asked for: a higher number tells the
	// client to decode a shape it does not implement.
	version := req.ProtocolVersion
	if version > acpfx.ProtocolVersion {
		version = acpfx.ProtocolVersion
	}

	return &acpfx.InitializeResponse{
		ProtocolVersion: version,
		AgentInfo: &acpfx.Implementation{
			Name:    s.backend.Name(),
			Title:   s.backend.Name() + " (ACP shim)",
			Version: s.version,
		},
		AgentCapabilities: s.backend.Capabilities(),
		AuthMethods:       nil,
	}, nil
}

// NewSession registers a session rooted at req.Cwd.
func (s *Shim) NewSession(
	_ context.Context,
	req *acpfx.NewSessionRequest,
) (*acpfx.NewSessionResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	id := fmt.Sprintf("%s-%d", s.backend.Name(), s.nextID)

	s.sessions[id] = &session{cwd: req.Cwd, vendorSessionID: "", cancel: nil}

	return &acpfx.NewSessionResponse{SessionID: id, Modes: nil}, nil
}

// LoadSession resumes a session the client already knows the id of.
//
// The vendor session id is not recoverable from the ACP id alone, so a resumed
// session starts without one and the backend begins a fresh vendor
// conversation. That is a real limitation, declared rather than hidden: a
// backend that can do better should report loadSession in Capabilities and
// carry the mapping itself.
func (s *Shim) LoadSession(
	_ context.Context,
	req *acpfx.LoadSessionRequest,
) (*acpfx.LoadSessionResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing, ok := s.sessions[req.SessionID]; ok {
		existing.cwd = req.Cwd

		return &acpfx.LoadSessionResponse{Modes: nil}, nil
	}

	s.sessions[req.SessionID] = &session{cwd: req.Cwd, vendorSessionID: "", cancel: nil}

	return &acpfx.LoadSessionResponse{Modes: nil}, nil
}

// Prompt runs one turn against the backend.
func (s *Shim) Prompt(
	ctx context.Context,
	req *acpfx.PromptRequest,
	emit acpfx.UpdateFunc,
) (*acpfx.PromptResponse, error) {
	turnCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	sess, err := s.beginTurn(req.SessionID, cancel)
	if err != nil {
		return nil, err
	}

	defer s.endTurn(req.SessionID)

	turn := &Turn{
		SessionID:       req.SessionID,
		VendorSessionID: sess.vendorSessionID,
		Cwd:             sess.cwd,
		Prompt:          req.Prompt,
		Emit:            emit,
	}

	reason, vendorID, err := s.backend.RunTurn(turnCtx, turn)
	if err != nil {
		// A cancelled turn is an outcome, not a failure: ACP reports it as a
		// stop reason so the transcript stays well-formed.
		if turnCtx.Err() != nil {
			return &acpfx.PromptResponse{StopReason: acpfx.StopReasonCancelled}, nil
		}

		return nil, fmt.Errorf("%w: %w", ErrBackendFailed, err)
	}

	if vendorID != "" {
		s.rememberVendorSession(req.SessionID, vendorID)
	}

	return &acpfx.PromptResponse{StopReason: reason}, nil
}

// Cancel stops the in-flight turn for a session.
//
// This runs while Prompt is still blocked, on a separate goroutine. Cancelling
// the turn context is what makes Prompt return; the notification itself never
// ends the turn.
func (s *Shim) Cancel(_ context.Context, note *acpfx.CancelNotification) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if sess, ok := s.sessions[note.SessionID]; ok && sess.cancel != nil {
		sess.cancel()
	}
}

func (s *Shim) beginTurn(sessionID string, cancel context.CancelFunc) (session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.sessions[sessionID]
	if !ok {
		return session{}, fmt.Errorf("%w: %s", ErrUnknownSession, sessionID) //nolint:exhaustruct
	}

	sess.cancel = cancel

	// Return a copy: the caller reads it without the lock, and the stored
	// session is mutated by Cancel from another goroutine.
	return *sess, nil
}

func (s *Shim) endTurn(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if sess, ok := s.sessions[sessionID]; ok {
		sess.cancel = nil
	}
}

func (s *Shim) rememberVendorSession(sessionID, vendorID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if sess, ok := s.sessions[sessionID]; ok {
		sess.vendorSessionID = vendorID
	}
}
