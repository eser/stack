package noskillsserverfx

import "context"

// MockWorkerHandle is a chan-based WorkerHandle for tests that need worker
// events without spawning a real Node process. Satisfies WorkerHandle.
type MockWorkerHandle struct {
	sid    string
	events chan WorkerEvent
	closed bool
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

func (m *MockWorkerHandle) SendQueryStart(_ context.Context, _, _, _ string) error { return nil }
func (m *MockWorkerHandle) PushMessage(_ string) error                             { return nil }
func (m *MockWorkerHandle) PermissionResponse(_, _, _ string) error                { return nil }
func (m *MockWorkerHandle) StopTask() error                                        { return nil }
func (m *MockWorkerHandle) Events() <-chan WorkerEvent                             { return m.events }
func (m *MockWorkerHandle) SessionID() string                                      { return m.sid }

func (m *MockWorkerHandle) Close() error {
	if !m.closed {
		m.closed = true
		close(m.events)
	}

	return nil
}
