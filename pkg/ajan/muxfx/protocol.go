// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"encoding/json"
	"fmt"
	"sync"
)

// MessageType is the "t" field of a protocol message.
type MessageType string

// Server to frontend messages.
const (
	// MessageScene carries a scene delta.
	MessageScene MessageType = "scene"
	// MessageScreen carries one pane's screen, in full or as the rows that
	// changed.
	MessageScreen MessageType = "screen"
	// MessageExit ends the frontend.
	MessageExit MessageType = "exit"
)

// Frontend to server messages.
const (
	// MessageAttach announces a frontend and its size; the server answers
	// with a full scene and a full screen of every pane.
	MessageAttach MessageType = "attach"
	// MessageAction carries an action.
	MessageAction MessageType = "action"
	// MessageResize reports a new frontend size.
	MessageResize MessageType = "resize"
	// MessageKey carries a key press for a pane, encoded by the server with
	// the pane's modes.
	MessageKey MessageType = "key"
	// MessagePaste carries pasted text for a pane.
	MessagePaste MessageType = "paste"
	// MessageMouse carries a mouse event inside a pane.
	MessageMouse MessageType = "mouse"
	// MessageFocus reports that a pane gained or lost focus.
	MessageFocus MessageType = "focus"
)

// ServerToFrontend is a message from the server: a scene delta (Full on the
// first one after attach), a pane's screen, or exit with Code, an exit
// status. The server emulates every pane, so a frontend parses no VT
// sequences and never answers a program's device queries. Code is an int32
// and sits next to Full so the message stays small enough to pass by value.
type ServerToFrontend struct {
	T      MessageType   `json:"t"`
	Delta  *SceneDelta   `json:"delta,omitempty"`
	Pane   PaneID        `json:"pane,omitempty"`
	Screen *ScreenUpdate `json:"screen,omitempty"`
	Code   int32         `json:"code,omitempty"`
	Full   bool          `json:"full,omitempty"`
}

// MarshalJSON writes exactly the fields of the message's type, matching the
// TypeScript protocol (full and code are sent even when false or zero). A
// screen message is written without encoding/json, which would also
// compact the update's own encoding.
func (m ServerToFrontend) MarshalJSON() ([]byte, error) {
	if m.T == MessageScreen {
		b := make([]byte, 0, 1024)
		b = append(b, `{"t":"screen","pane":`...)
		b = appendJSONString(b, string(m.Pane))
		b = append(b, `,"screen":`...)

		if m.Screen == nil {
			b = append(b, "null"...)
		} else {
			b = m.Screen.appendJSON(b)
		}

		return append(b, '}'), nil
	}

	var v any

	switch m.T {
	case MessageScene:
		v = struct {
			T     MessageType `json:"t"`
			Full  bool        `json:"full"`
			Delta *SceneDelta `json:"delta"`
		}{m.T, m.Full, m.Delta}
	case MessageExit:
		v = struct {
			T    MessageType `json:"t"`
			Code int32       `json:"code"`
		}{m.T, m.Code}
	default:
		type plain ServerToFrontend

		v = plain(m)
	}

	out, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("write %s message: %w", m.T, err)
	}

	return out, nil
}

// FrontendToServer is a message from a frontend: attach or resize with its
// viewport, an action, or what the user did in a pane (key, paste, mouse,
// focus) with its payload in the field of the same name. Pane names the pane
// those four go to; empty means the focused pane of the active tab.
// Capabilities, on attach, is accepted and ignored: every frontend gets
// screen messages, and a frontend that still asks for them with ["screen"]
// keeps working.
type FrontendToServer struct {
	T            MessageType `json:"t"`
	Viewport     *Viewport   `json:"viewport,omitempty"`
	Capabilities []string    `json:"capabilities,omitempty"`
	Action       *Action     `json:"action,omitempty"`
	Pane         PaneID      `json:"pane,omitempty"`
	Key          *KeyInput   `json:"key,omitempty"`
	Paste        *PasteInput `json:"paste,omitempty"`
	Mouse        *MouseInput `json:"mouse,omitempty"`
	Focus        *FocusInput `json:"focus,omitempty"`
}

// Transport is a two-way message channel. The server and frontends use it
// without knowing whether it is in-process or crosses a network. Transports
// are compared by identity, so implement them on pointer types.
type Transport[Out, In any] interface {
	Send(msg Out)
	OnMessage(handler func(msg In))
	Close()
}

// FlowControl is implemented by a server-side transport that can say when
// it can take more, such as one that queues messages for a socket. The
// server sends screen messages only while Writable reports true, keeping the
// panes' changes in the meantime, and calls fn passed to OnWritable to know
// when to try again. A transport without it counts as always writable. Scene
// and exit messages are sent regardless.
type FlowControl interface {
	// Writable reports whether the transport takes another message now.
	Writable() bool
	// OnWritable sets the function the transport calls, from any goroutine,
	// when it becomes writable after Writable reported false. A later call
	// replaces it.
	OnWritable(fn func())
}

// inProcessEnd is one side of an in-process pair.
type inProcessEnd[Out, In any] struct {
	mu      *sync.Mutex
	handler func(In)
	closed  bool
	peer    *inProcessEnd[In, Out]
}

func (e *inProcessEnd[Out, In]) Send(msg Out) {
	e.mu.Lock()
	peer := e.peer
	deliver := peer.handler
	closed := peer.closed
	e.mu.Unlock()

	if !closed && deliver != nil {
		deliver(msg)
	}
}

func (e *inProcessEnd[Out, In]) OnMessage(handler func(In)) {
	e.mu.Lock()
	e.handler = handler
	e.mu.Unlock()
}

// Close stops delivery to this side only, so a frontend that closes does not
// also silence the other direction.
func (e *inProcessEnd[Out, In]) Close() {
	e.mu.Lock()
	e.closed = true
	e.mu.Unlock()
}

// NewInProcessPair returns two connected transports for a server and a
// frontend in one process. A message sent on one side is delivered to the
// other side's handler synchronously, on the sender's goroutine.
func NewInProcessPair[A, B any]() (Transport[A, B], Transport[B, A]) {
	mu := &sync.Mutex{}
	a := &inProcessEnd[A, B]{mu: mu}
	b := &inProcessEnd[B, A]{mu: mu}
	a.peer = b
	b.peer = a

	return a, b
}
