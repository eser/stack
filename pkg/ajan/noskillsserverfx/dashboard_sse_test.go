// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bufio"
	"context"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeEventSource hands the stream the events a test pushes, and counts the
// streams that took one, so the stream is driven without an events file.
type fakeEventSource struct {
	mu      sync.Mutex
	pending []*noskillsfx.JSObject
}

func (s *fakeEventSource) push(event *noskillsfx.JSObject) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.pending = append(s.pending, event)
}

func (s *fakeEventSource) Poll() ([]*noskillsfx.JSObject, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	events := s.pending
	s.pending = nil

	return events, nil
}

// openEvents opens /events on a live dashboard and returns its line reader.
func openEvents(t *testing.T, ctx context.Context, base string) (*http.Response, *bufio.Reader) {
	t.Helper()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/events", nil)
	require.NoError(t, err)

	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)

	t.Cleanup(func() { _ = response.Body.Close() })

	return response, bufio.NewReader(response.Body)
}

// readFrame reads one SSE frame: the lines up to a blank line.
func readFrame(t *testing.T, reader *bufio.Reader) string {
	t.Helper()

	frame := ""

	for {
		line, err := reader.ReadString('\n')
		require.NoError(t, err)

		frame += line
		if line == "\n" {
			return frame
		}
	}
}

func TestEventsStreamSendsHeadersAConnectCommentAndEachEvent(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	source := &fakeEventSource{} //nolint:exhaustruct
	f.d.newEventSource = func() dashboardEventSource { return source }
	f.d.eventPoll = 5 * time.Millisecond
	f.d.keepalive = time.Hour
	base := liveDashboard(t, f)

	response, reader := openEvents(t, t.Context(), base)

	assert.Equal(t, "text/event-stream", response.Header.Get("Content-Type"))
	assert.Equal(t, "no-cache", response.Header.Get("Cache-Control"))
	assert.Equal(t, ": connected\n\n", readFrame(t, reader))

	event := noskillsfx.JSObjectOf("ts", "2026-01-01T00:00:00.000Z", "type", "phase-change", "spec", "sse-test", "user", "Tester")
	source.push(event)

	assert.Equal(t, `data: {"ts":"2026-01-01T00:00:00.000Z","type":"phase-change","spec":"sse-test","user":"Tester"}`+"\n\n",
		readFrame(t, reader))
}

func TestEventsStreamSendsKeepalives(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	f.d.keepalive = 5 * time.Millisecond
	base := liveDashboard(t, f)

	_, reader := openEvents(t, t.Context(), base)

	assert.Equal(t, ": connected\n\n", readFrame(t, reader))
	assert.Equal(t, ": keepalive\n\n", readFrame(t, reader))
}

func TestEventsStreamFollowsTheEventsLog(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	f.d.eventPoll = 5 * time.Millisecond
	base := liveDashboard(t, f)

	_, reader := openEvents(t, t.Context(), base)
	require.Equal(t, ": connected\n\n", readFrame(t, reader))

	require.NoError(t, noskillsfx.AppendDashboardEvent(f.root, noskillsfx.JSObjectOf("ts", "t1", "type", "note")))

	assert.Equal(t, `data: {"ts":"t1","type":"note"}`+"\n\n", readFrame(t, reader))
}

// The stream's timer and source belong to it: once the client disconnects,
// nothing polls for it any more.
func TestEventsStreamStopsPollingWhenTheClientDisconnects(t *testing.T) {
	t.Parallel()

	f := newDashboardFixture(t)
	source := &countingEventSource{} //nolint:exhaustruct
	f.d.newEventSource = func() dashboardEventSource { return source }
	f.d.eventPoll = 2 * time.Millisecond
	base := liveDashboard(t, f)

	ctx, cancel := context.WithCancel(t.Context())
	_, reader := openEvents(t, ctx, base)
	require.Equal(t, ": connected\n\n", readFrame(t, reader))
	require.Eventually(t, func() bool { return source.count() > 0 }, time.Second, time.Millisecond)

	cancel()

	// Stable for 50 ms in a row means the handler returned.
	last := source.count()
	stableSince := time.Now()

	require.Eventually(t, func() bool {
		if now := source.count(); now != last {
			last, stableSince = now, time.Now()
		}

		return time.Since(stableSince) > 50*time.Millisecond
	}, 5*time.Second, 5*time.Millisecond)
}

// countingEventSource counts its polls.
type countingEventSource struct {
	mu    sync.Mutex
	polls int
}

func (s *countingEventSource) Poll() ([]*noskillsfx.JSObject, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.polls++

	return nil, nil
}

func (s *countingEventSource) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.polls
}
