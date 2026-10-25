// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"golang.org/x/net/websocket"
)

// The /mux WebSocket carries the whole multiplexer as the TypeScript
// wsTransport did: every text frame is one JSON protocol message, server to
// browser a scene delta, a pane's screen or exit, browser to server attach,
// resize, an action, or key, paste, mouse and focus input, which the server
// encodes for the pane. One socket is attached to the hub (mux_hub.go) at a
// time.

const (
	// dashboardMuxPath is the WebSocket route.
	dashboardMuxPath = "/mux"

	// muxSocketWriteTimeout bounds one frame write.
	muxSocketWriteTimeout = 10 * time.Second

	// muxSocketMaxFrame is the largest frame a browser may send; a paste of
	// a large text is the biggest one it sends.
	muxSocketMaxFrame = 1 << 20
)

// writeLoop writes queued frames until the socket is told to stop, the
// reader ends or a write fails.
func (s *queuedSocket) writeLoop(conn *websocket.Conn, readerDone <-chan struct{}) {
	for {
		select {
		case frame := <-s.out:
			_ = conn.SetWriteDeadline(time.Now().Add(muxSocketWriteTimeout)) // a failed write ends the loop below

			if err := websocket.Message.Send(conn, string(frame)); err != nil {
				return
			}

			s.drained()
		case <-s.done:
			return
		case <-readerDone:
			return
		}
	}
}

// inboundFrame is a frame a browser sent and whether it was text.
type inboundFrame struct {
	data []byte
	text bool
}

// inboundCodec reads one frame with its type, so binary frames can be
// ignored as the TypeScript transport ignored them.
var inboundCodec = websocket.Codec{ //nolint:gochecknoglobals // a stateless codec
	Marshal: websocket.Message.Marshal,
	Unmarshal: func(data []byte, payloadType byte, v any) error {
		frame, ok := v.(*inboundFrame)
		if !ok {
			return websocket.ErrNotSupported
		}

		frame.data = data
		frame.text = payloadType == websocket.TextFrame

		return nil
	},
}

// readLoop passes the text frames that parse as protocol messages to the
// multiplexer, and returns when the connection ends.
func readLoop(conn *websocket.Conn, mux *dashboardMux) {
	for {
		var frame inboundFrame

		err := inboundCodec.Receive(conn, &frame)
		if errors.Is(err, websocket.ErrFrameTooLarge) {
			continue
		}

		if err != nil {
			return
		}

		if !frame.text {
			continue
		}

		var msg muxfx.FrontendToServer
		if json.Unmarshal(frame.data, &msg) != nil {
			continue
		}

		mux.deliver(&msg)
	}
}

// handleMux upgrades /mux after the guard checked its Origin: it needs the
// WebSocket upgrade and the token in the query, since a browser cannot set
// headers on the upgrade. This socket can start processes, so the token is
// what gates it: a browser learns it only by loading a dashboard page.
func (d *Dashboard) handleMux(w http.ResponseWriter, r *http.Request) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		writePlainText(w, http.StatusUpgradeRequired, "WebSocket upgrade required")

		return
	}

	if !tokenMatches(r.URL.Query().Get(DashboardTokenQueryParam), d.token) {
		writePlainText(w, http.StatusForbidden, "Forbidden: missing or invalid token")

		return
	}

	websocket.Server{ //nolint:exhaustruct
		// The guard has checked the Origin; the default check would also
		// refuse clients that send none, which the TypeScript server let in.
		Handshake: func(*websocket.Config, *http.Request) error { return nil },
		Handler:   d.serveMuxSocket,
	}.ServeHTTP(w, r)
}

// serveMuxSocket attaches an upgraded connection to the multiplexer until
// either side ends it.
func (d *Dashboard) serveMuxSocket(conn *websocket.Conn) {
	conn.MaxPayloadBytes = muxSocketMaxFrame
	_ = conn.SetDeadline(time.Time{}) // the request deadlines do not apply to the socket

	socket := newQueuedSocket()
	d.mux.attachSocket(socket)

	readerDone := make(chan struct{})

	// Owned by this handler, which waits for it below.
	go func() {
		defer close(readerDone)

		readLoop(conn, d.mux)
	}()

	socket.writeLoop(conn, readerDone)

	d.mux.detachSocket(socket)
	socket.close()
	_ = conn.Close() // ends the reader; the connection is done either way

	<-readerDone
}
