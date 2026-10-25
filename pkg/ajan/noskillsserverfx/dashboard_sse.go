// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"io"
	"net/http"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// GET /events is the Server-Sent Events stream of dashboard events
// (routes/sse.ts): a connect comment, then one data frame per event appended
// to the events log, and a keepalive comment every 30 s so proxies keep an
// idle stream open.

const (
	// dashboardEventPoll is how often the events log is read; watchEvents
	// polled every 500 ms.
	dashboardEventPoll = 500 * time.Millisecond

	// dashboardKeepalive is the keepalive comment interval.
	dashboardKeepalive = 30 * time.Second
)

// dashboardEventSource yields the events appended since the last poll.
type dashboardEventSource interface {
	Poll() ([]*noskillsfx.JSObject, error)
}

// handleEvents streams the dashboard events until the client disconnects or
// the dashboard stops. The poll timer belongs to the stream, so a closed tab
// leaves nothing polling.
func (d *Dashboard) handleEvents(w http.ResponseWriter, r *http.Request) {
	controller := http.NewResponseController(w)
	// A stream outlives any write timeout; without one there is nothing to lift.
	_ = controller.SetWriteDeadline(time.Time{})

	headers := w.Header()
	headers.Set("Content-Type", "text/event-stream")
	headers.Set("Cache-Control", "no-cache")
	headers.Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	send := func(chunk string) bool {
		if _, err := io.WriteString(w, chunk); err != nil {
			return false
		}

		return controller.Flush() == nil
	}

	if !send(": connected\n\n") {
		return
	}

	source := d.newEventSource()

	poll := time.NewTicker(d.eventPoll)
	defer poll.Stop()

	keepalive := time.NewTicker(d.keepalive)
	defer keepalive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			if !send(": keepalive\n\n") {
				return
			}
		case <-poll.C:
			// An unreadable log is tried again on the next tick, as the
			// TypeScript watcher did.
			events, _ := source.Poll()

			for _, event := range events {
				if !send("data: " + event.String() + "\n\n") {
					return
				}
			}
		}
	}
}
