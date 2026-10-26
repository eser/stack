// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package testingfx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
)

// RecordedRequest captures a single HTTP request received by FakeServer.
type RecordedRequest struct {
	Method string
	Path   string
	Header http.Header
	Body   []byte
}

// FakeServer is a test HTTP server backed by httptest.Server.
// Register handlers with Handle; all requests are also recorded in Requests.
type FakeServer struct {
	server   *httptest.Server
	mux      *http.ServeMux
	mu       sync.RWMutex
	requests []RecordedRequest
}

// NewFakeServer creates and starts a new FakeServer.
// The caller must call Close() when done (typically via t.Cleanup).
func NewFakeServer() *FakeServer {
	mux := http.NewServeMux()
	fs := &FakeServer{mux: mux}

	// Wrap mux to record every request.
	fs.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := make([]byte, 0)
		if r.Body != nil {
			buf := make([]byte, r.ContentLength)
			if r.ContentLength > 0 {
				r.Body.Read(buf) //nolint:errcheck,gosec // body read error intentionally ignored in test server
				body = buf
			}
		}

		fs.mu.Lock()
		fs.requests = append(fs.requests, RecordedRequest{
			Method: r.Method,
			Path:   r.URL.Path,
			Header: r.Header.Clone(),
			Body:   body,
		})
		fs.mu.Unlock()

		mux.ServeHTTP(w, r)
	}))

	return fs
}

// URL returns the base URL of the fake server (e.g., "http://127.0.0.1:PORT").
func (s *FakeServer) URL() string {
	return s.server.URL
}

// Close shuts down the server and blocks until all outstanding requests complete.
func (s *FakeServer) Close() {
	s.server.Close()
}

// Handle registers an HTTP handler for the given pattern (same syntax as http.ServeMux).
func (s *FakeServer) Handle(pattern string, handler http.Handler) {
	s.mux.Handle(pattern, handler)
}

// HandleFunc registers an HTTP handler function for the given pattern.
func (s *FakeServer) HandleFunc(pattern string, fn func(http.ResponseWriter, *http.Request)) {
	s.mux.HandleFunc(pattern, fn)
}

// RespondJSON registers a handler that always responds with the given JSON body
// and status code. Useful for simple mock endpoints.
func (s *FakeServer) RespondJSON(pattern string, statusCode int, body any) {
	s.mux.HandleFunc(pattern, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)

		if body != nil {
			data, _ := json.Marshal(body) //nolint:errcheck
			w.Write(data)                 //nolint:errcheck,gosec // write error intentionally ignored in test server
		}
	})
}

// Requests returns a snapshot of all requests received so far.
func (s *FakeServer) Requests() []RecordedRequest {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]RecordedRequest, len(s.requests))
	copy(out, s.requests)

	return out
}

// RequestCount returns the number of requests received.
func (s *FakeServer) RequestCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return len(s.requests)
}

// LastRequest returns the most recently received request, or nil if none.
func (s *FakeServer) LastRequest() *RecordedRequest {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.requests) == 0 {
		return nil
	}

	r := s.requests[len(s.requests)-1]

	return &r
}

// ResetRequests clears the recorded request history.
func (s *FakeServer) ResetRequests() {
	s.mu.Lock()
	s.requests = s.requests[:0]
	s.mu.Unlock()
}
