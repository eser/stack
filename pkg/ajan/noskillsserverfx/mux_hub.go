// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"sync"
	"sync/atomic"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

// A muxfx server serves one frontend. The hub is that frontend for the
// server's whole lifetime, in the dashboard and in a daemon mux session
// alike, and forwards every frame the server sends to the sockets attached
// to it: the dashboard's one /mux WebSocket, or each WebTransport client of
// the mux session. It implements muxfx.FlowControl, so the server sends
// screen messages only while every socket keeps up; a slow socket then gets
// the latest screen instead of a queue.

const (
	// muxSocketQueue is how many frames may wait for a slow client. Past it
	// the socket is dropped instead of holding back the multiplexer; the
	// client reconnects and gets a full scene. Screen messages stop long
	// before it (muxScreenWindow), so only scene frames can fill it.
	muxSocketQueue = 1024

	// muxScreenWindow is how many frames may wait for a socket before the
	// hub tells the server's screen pacing that it is full. The server then
	// keeps the panes' changes and sends the latest screen once the socket
	// has written its backlog, so a slow client skips frames instead of
	// queueing them.
	muxScreenWindow = 4
)

// muxSocket is a client connection the hub forwards frames to.
type muxSocket interface {
	// send queues an encoded frame and reports whether it was queued.
	send(frame []byte) bool
	// backlog is how many queued frames wait to be written.
	backlog() int
	// onDrain sets the function the socket calls, on its writer goroutine,
	// after each frame it wrote.
	onDrain(fn func())
	// close tells the socket to stop. It does not block.
	close()
}

// hubSocket is the hub's state for one attached socket.
type hubSocket struct {
	// awaitFull holds back scene deltas and screen messages from a newly
	// attached socket until the server sends a full scene: a delta needs a
	// full scene as its base, and the screens that follow the socket's
	// attach are full ones.
	awaitFull bool
}

// muxHub is the transport a muxfx server stays connected to.
type muxHub struct {
	// transport is the hub behind the remote sanitizer; the server is
	// connected to it.
	transport muxfx.Transport[muxfx.ServerToFrontend, muxfx.FrontendToServer]

	mu      sync.Mutex
	handler func(msg muxfx.FrontendToServer)
	sockets map[muxSocket]*hubSocket
	closed  bool
	// onWritable is the server's callback for when every socket can take
	// screen messages again; blocked records that Writable reported false
	// since the last call.
	onWritable func()
	blocked    bool
	// changedCh is closed and replaced on every frame the server sends, so
	// a goroutine can wait for the server to have applied an action.
	changedCh chan struct{}
}

func newMuxHub() *muxHub {
	hub := &muxHub{sockets: map[muxSocket]*hubSocket{}, changedCh: make(chan struct{})} //nolint:exhaustruct
	hub.transport = muxfx.SanitizeRemoteTransport(hub)

	return hub
}

// encodeMuxFrame encodes a server frame, once for every socket. It calls
// the message's MarshalJSON itself: json.Marshal would call it too and then
// compact the bytes it returns, which for a screen message costs nearly as
// much as encoding it.
func encodeMuxFrame(msg *muxfx.ServerToFrontend) ([]byte, error) {
	return msg.MarshalJSON()
}

// Send forwards a server frame to the attached sockets. A socket whose
// queue is full is dropped.
func (h *muxHub) Send(msg muxfx.ServerToFrontend) {
	fullScene := msg.T == muxfx.MessageScene && msg.Full
	needsBase := (msg.T == muxfx.MessageScene && !msg.Full) || msg.T == muxfx.MessageScreen

	h.mu.Lock()
	close(h.changedCh)
	h.changedCh = make(chan struct{})

	targets := make([]muxSocket, 0, len(h.sockets))

	for socket, state := range h.sockets {
		// A scene delta needs a full scene as its base, and a screen patch
		// from before the socket attached has no base on it either: the
		// server sends every pane in full once the socket's attach arrives.
		if state.awaitFull && needsBase {
			continue
		}

		if fullScene {
			state.awaitFull = false
		}

		targets = append(targets, socket)
	}
	h.mu.Unlock()

	if len(targets) == 0 {
		return
	}

	frame, err := encodeMuxFrame(&msg)
	if err != nil {
		return
	}

	for _, socket := range targets {
		if !socket.send(frame) {
			h.detach(socket)
			socket.close()
		}
	}
}

// Writable reports whether every attached socket takes another screen
// message: each has fewer than muxScreenWindow frames waiting. Without a
// socket the frames go nowhere, so the hub is writable; the next socket
// gets every pane in full.
func (h *muxHub) Writable() bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	for socket := range h.sockets {
		if socket.backlog() >= muxScreenWindow {
			h.blocked = true

			return false
		}
	}

	return true
}

// OnWritable sets the function the hub calls once every socket drained
// after Writable reported false.
func (h *muxHub) OnWritable(fn func()) {
	h.mu.Lock()
	h.onWritable = fn
	h.mu.Unlock()
}

// releaseLocked returns the server's callback, clearing blocked, when the
// server was refused and every socket has room again; otherwise nil. The
// caller holds h.mu and calls the result after releasing it. Writable and
// releaseLocked both read the backlogs under h.mu, so a drain that races
// with a refusal still sees blocked set and calls back.
func (h *muxHub) releaseLocked() func() {
	if !h.blocked {
		return nil
	}

	for socket := range h.sockets {
		if socket.backlog() >= muxScreenWindow {
			return nil
		}
	}

	h.blocked = false

	return h.onWritable
}

// drained runs after socket wrote a frame.
func (h *muxHub) drained(socket muxSocket) {
	h.mu.Lock()

	if _, ok := h.sockets[socket]; !ok {
		h.mu.Unlock()

		return
	}

	fn := h.releaseLocked()
	h.mu.Unlock()

	if fn != nil {
		fn()
	}
}

// OnMessage registers the server's handler for socket frames.
func (h *muxHub) OnMessage(handler func(msg muxfx.FrontendToServer)) {
	h.mu.Lock()
	h.handler = handler
	h.mu.Unlock()
}

// Close is called when the server is disposed: the attached sockets are
// closed and later ones are refused.
func (h *muxHub) Close() {
	h.mu.Lock()
	sockets := make([]muxSocket, 0, len(h.sockets))

	for socket := range h.sockets {
		sockets = append(sockets, socket)
	}

	clear(h.sockets)
	h.closed = true
	h.mu.Unlock()

	for _, socket := range sockets {
		socket.close()
	}
}

// attach makes socket the only attached one and closes the others, as the
// dashboard's /mux route wants.
func (h *muxHub) attach(socket muxSocket) {
	for _, previous := range h.add(socket, true) {
		previous.close()
	}
}

// join attaches socket next to the ones already attached, as the clients
// of a daemon mux session do. They share the server's one frontend: the
// last attach sets the viewport for all of them.
func (h *muxHub) join(socket muxSocket) {
	h.add(socket, false)
}

// add attaches socket and returns the sockets it replaced. A closed hub
// closes socket at once.
func (h *muxHub) add(socket muxSocket, exclusive bool) []muxSocket {
	// Set before the socket can be sent anything, so no drain is missed.
	socket.onDrain(func() { h.drained(socket) })

	h.mu.Lock()

	if h.closed {
		h.mu.Unlock()
		socket.close()

		return nil
	}

	var replaced []muxSocket

	if exclusive {
		for other := range h.sockets {
			if other != socket {
				replaced = append(replaced, other)
			}
		}

		clear(h.sockets)

		h.blocked = false
	}

	h.sockets[socket] = &hubSocket{awaitFull: true}
	h.mu.Unlock()

	return replaced
}

// detach stops delivery to socket. When the server was waiting for the
// sockets to drain and the rest have room, it is called back, so a slow
// socket that leaves does not hold back the others.
func (h *muxHub) detach(socket muxSocket) {
	h.mu.Lock()

	if _, ok := h.sockets[socket]; !ok {
		h.mu.Unlock()

		return
	}

	delete(h.sockets, socket)
	fn := h.releaseLocked()
	h.mu.Unlock()

	if fn != nil {
		fn()
	}
}

// deliver passes a socket's frame to the server.
func (h *muxHub) deliver(msg *muxfx.FrontendToServer) {
	h.mu.Lock()
	handler := h.handler
	h.mu.Unlock()

	if handler != nil {
		handler(*msg)
	}
}

// changed is closed once the server sends its next frame.
func (h *muxHub) changed() <-chan struct{} {
	h.mu.Lock()
	defer h.mu.Unlock()

	return h.changedCh
}

// queuedSocket is a client connection with a bounded queue of encoded
// frames, written by a goroutine of its own: a /mux WebSocket or a
// WebTransport attach stream.
type queuedSocket struct {
	out  chan []byte
	done chan struct{}
	once sync.Once
	// behind records that a frame did not fit in the queue, which made the
	// hub drop the socket.
	behind atomic.Bool

	mu    sync.Mutex
	drain func()
}

func newQueuedSocket() *queuedSocket {
	return &queuedSocket{out: make(chan []byte, muxSocketQueue), done: make(chan struct{})} //nolint:exhaustruct
}

func (s *queuedSocket) send(frame []byte) bool {
	select {
	case <-s.done:
		return false
	default:
	}

	select {
	case s.out <- frame:
		return true
	default:
		s.behind.Store(true)

		return false
	}
}

func (s *queuedSocket) backlog() int {
	return len(s.out)
}

func (s *queuedSocket) onDrain(fn func()) {
	s.mu.Lock()
	s.drain = fn
	s.mu.Unlock()
}

// drained calls the drain function; the writer calls it after each frame.
func (s *queuedSocket) drained() {
	s.mu.Lock()
	fn := s.drain
	s.mu.Unlock()

	if fn != nil {
		fn()
	}
}

func (s *queuedSocket) close() {
	s.once.Do(func() { close(s.done) })
}

// frames is the queue the writer takes frames from.
func (s *queuedSocket) frames() <-chan []byte {
	return s.out
}

// stopped is closed once the socket is told to stop.
func (s *queuedSocket) stopped() <-chan struct{} {
	return s.done
}

// fellBehind reports whether the socket stopped because its queue was
// full, rather than because its hub or its connection closed.
func (s *queuedSocket) fellBehind() bool {
	return s.behind.Load()
}
