package noskillsserverfx

import (
	"context"
	"encoding/json"
	"sync"
)

// MockWorkerHandle is a chan-based WorkerHandle for tests that need worker
// events without starting a real worker. Satisfies WorkerHandle.
type MockWorkerHandle struct {
	sid       string
	events    chan WorkerEvent
	closeOnce sync.Once
}

// NewMockWorkerHandle returns a handle pre-loaded with canned events. The
// channel is buffered so Push calls do not block the test goroutine.
func NewMockWorkerHandle(sid string, canned []WorkerEvent) *MockWorkerHandle {
	ch := make(chan WorkerEvent, len(canned)+16)
	for _, e := range canned {
		ch <- e
	}

	return &MockWorkerHandle{sid: sid, events: ch}
}

// Push injects a live event as if it arrived from the worker process.
func (m *MockWorkerHandle) Push(e WorkerEvent) { m.events <- e }

func (m *MockWorkerHandle) SendQueryStart(_ context.Context, _, _, _ string) error     { return nil }
func (m *MockWorkerHandle) PushMessage(_ context.Context, _ string) error              { return nil }
func (m *MockWorkerHandle) PermissionResponse(_ context.Context, _, _, _ string) error { return nil }
func (m *MockWorkerHandle) SendMux(_ context.Context, _ json.RawMessage) error         { return nil }
func (m *MockWorkerHandle) SetMode(_ context.Context, _ string) error                  { return nil }
func (m *MockWorkerHandle) StopTask(_ context.Context) error                           { return nil }
func (m *MockWorkerHandle) Events() <-chan WorkerEvent                                 { return m.events }
func (m *MockWorkerHandle) SessionID() string                                          { return m.sid }

// Close closes the events channel, as a worker that exits does. It is safe to
// call more than once and from several goroutines: the session pump closes the
// worker at shutdown while a test may close it too.
func (m *MockWorkerHandle) Close() error {
	m.closeOnce.Do(func() { close(m.events) })

	return nil
}
