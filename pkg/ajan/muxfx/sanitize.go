// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

// The local TUI is the user driving their own terminal, so an action naming
// a command to run is the point. A client on the far end of a socket is a
// different trust level: there, an action carrying command, args or cwd is a
// request to execute arbitrary argv with the server's environment. The
// capability stays in the engine and is stripped at ingress; a remote client
// names a pane kind, and the server's spawn resolver decides what runs. This
// is defence in depth behind the transport's authentication, not a
// replacement for it.

// The server keeps a screen model of every pane, sized by the viewport the
// frontend reports, so a remote client must not pick an arbitrary size
// either: a viewport of millions of cells would make every pane allocate
// that much. MaxRemoteViewportCols and MaxRemoteViewportRows bound what a
// remote client gets; larger values are lowered to them, negative ones
// raised to zero. 512 columns by 256 rows is more than a 4K screen shows at
// a readable font size; a pane of that size holds 8.4 MB of cells, and up to
// twice that once its program used the alternate screen.
const (
	MaxRemoteViewportCols = 512
	MaxRemoteViewportRows = 256
)

// ClampRemoteViewport bounds a viewport a remote client asked for to
// [MaxRemoteViewportCols] by [MaxRemoteViewportRows].
func ClampRemoteViewport(v Viewport) Viewport {
	return Viewport{
		Cols: min(max(v.Cols, 0), MaxRemoteViewportCols),
		Rows: min(max(v.Rows, 0), MaxRemoteViewportRows),
	}
}

// SanitizeRemoteAction strips the process-spawning fields (command, args,
// cwd) from a newTab or newPane action received over the network, and bounds
// the size of a resizeViewport action with [ClampRemoteViewport]. Other
// actions are returned unchanged.
func SanitizeRemoteAction(action *Action) Action {
	if action.Type == ActionResizeViewport {
		sanitized := *action
		size := ClampRemoteViewport(Viewport{Cols: action.Cols, Rows: action.Rows})
		sanitized.Cols, sanitized.Rows = size.Cols, size.Rows

		return sanitized
	}

	if action.Type != ActionNewTab && action.Type != ActionNewPane {
		return *action
	}

	sanitized := Action{
		Type:  action.Type,
		Kind:  action.Kind,
		Title: action.Title,
		Meta:  action.Meta,
	}

	if action.Type == ActionNewPane {
		sanitized.Direction = action.Direction
	}

	return sanitized
}

// SanitizeRemoteMessage returns a copy of msg with [SanitizeRemoteAction]
// applied to the action it carries and [ClampRemoteViewport] to the viewport
// it carries. Other messages, the key, paste, mouse and focus input among
// them, are returned unchanged: they write to a pane as writeToPane does and
// cannot start a process.
func SanitizeRemoteMessage(msg *FrontendToServer) FrontendToServer {
	out := *msg

	if out.Viewport != nil {
		clamped := ClampRemoteViewport(*out.Viewport)
		out.Viewport = &clamped
	}

	if out.T != MessageAction || out.Action == nil {
		return out
	}

	sanitized := SanitizeRemoteAction(out.Action)
	out.Action = &sanitized

	return out
}

// sanitizingTransport sanitizes every inbound message before the server sees
// it.
type sanitizingTransport struct {
	Transport[ServerToFrontend, FrontendToServer]
}

func (s *sanitizingTransport) OnMessage(handler func(FrontendToServer)) {
	s.Transport.OnMessage(func(msg FrontendToServer) {
		handler(SanitizeRemoteMessage(&msg))
	})
}

// Writable forwards to the wrapped transport's [FlowControl], if it has one.
func (s *sanitizingTransport) Writable() bool {
	if flow, ok := s.Transport.(FlowControl); ok {
		return flow.Writable()
	}

	return true
}

// OnWritable forwards to the wrapped transport's [FlowControl], if it has
// one; without it the transport is always writable and fn is never called.
func (s *sanitizingTransport) OnWritable(fn func()) {
	if flow, ok := s.Transport.(FlowControl); ok {
		flow.OnWritable(fn)
	}
}

// SanitizeRemoteTransport wraps a transport so every inbound message is
// sanitized before it reaches the server. Wrap every transport that crosses a
// network: the filter then sits where the untrusted bytes arrive, and a new
// remote route has to opt out of it instead of forgetting to opt in.
func SanitizeRemoteTransport(t Transport[ServerToFrontend, FrontendToServer]) Transport[ServerToFrontend, FrontendToServer] {
	return &sanitizingTransport{Transport: t}
}
