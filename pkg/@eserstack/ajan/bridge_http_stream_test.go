// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase D — leak gate: verify HTTP stream handles are released on close.

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type httpClientHandleResp struct {
	Handle string `json:"handle"`
	Error  string `json:"error,omitempty"`
}

type httpStreamOpenResp struct {
	Handle     string            `json:"handle"`
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Error      string            `json:"error,omitempty"`
}

type httpStreamReadResp struct {
	Chunk string `json:"chunk,omitempty"`
	Done  bool   `json:"done,omitempty"`
	Error string `json:"error,omitempty"`
}

// TestHttpStreamLeakGate verifies that after bridgeHttpStreamClose the handle
// is removed from httpStreamHandles and further reads return an error.
func TestHttpStreamLeakGate(t *testing.T) {
	t.Parallel()

	// Tiny server that streams two lines then closes.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("line1\nline2\n"))
	}))
	defer srv.Close()

	// Create an HTTP client handle.
	clientJSON := bridgeHttpCreate(`{}`)
	var clientResp httpClientHandleResp
	if err := json.Unmarshal([]byte(clientJSON), &clientResp); err != nil {
		t.Fatalf("bridgeHttpCreate unmarshal: %v", err)
	}
	if clientResp.Error != "" {
		t.Fatalf("bridgeHttpCreate error: %s", clientResp.Error)
	}
	defer bridgeHttpClose(clientResp.Handle)

	// Open a stream.
	reqJSON, _ := json.Marshal(map[string]string{
		"handle": clientResp.Handle,
		"method": "GET",
		"url":    srv.URL,
	})
	openJSON := bridgeHttpRequestStream(string(reqJSON))
	var openResp httpStreamOpenResp
	if err := json.Unmarshal([]byte(openJSON), &openResp); err != nil {
		t.Fatalf("bridgeHttpRequestStream unmarshal: %v", err)
	}
	if openResp.Error != "" {
		t.Fatalf("bridgeHttpRequestStream error: %s", openResp.Error)
	}
	if openResp.Handle == "" {
		t.Fatal("expected non-empty stream handle")
	}
	streamHandle := openResp.Handle

	// Verify the handle is tracked.
	httpStreamMu.RLock()
	_, exists := httpStreamHandles[streamHandle]
	httpStreamMu.RUnlock()
	if !exists {
		t.Fatal("stream handle not found in httpStreamHandles after open")
	}

	// Close the stream — this is the leak-gate operation.
	bridgeHttpStreamClose(streamHandle)

	// Verify the handle is gone.
	httpStreamMu.RLock()
	_, stillExists := httpStreamHandles[streamHandle]
	httpStreamMu.RUnlock()
	if stillExists {
		t.Fatal("stream handle still present in httpStreamHandles after close")
	}

	// Any further read must return an error.
	readJSON := bridgeHttpStreamRead(streamHandle)
	var readResp httpStreamReadResp
	if err := json.Unmarshal([]byte(readJSON), &readResp); err != nil {
		t.Fatalf("bridgeHttpStreamRead unmarshal: %v", err)
	}
	if readResp.Error == "" {
		t.Fatal("expected error from bridgeHttpStreamRead after close, got none")
	}
}

// TestHttpStreamEarlyClose verifies that cancelling a stream before it is
// exhausted still removes the handle (no goroutine/body leak).
func TestHttpStreamEarlyClose(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		// Write enough data so the stream is not yet done when we cancel.
		for i := 0; i < 10; i++ {
			_, _ = w.Write(make([]byte, 1024))
		}
	}))
	defer srv.Close()

	clientJSON := bridgeHttpCreate(`{}`)
	var clientResp httpClientHandleResp
	if err := json.Unmarshal([]byte(clientJSON), &clientResp); err != nil {
		t.Fatalf("bridgeHttpCreate: %v", err)
	}
	defer bridgeHttpClose(clientResp.Handle)

	reqJSON, _ := json.Marshal(map[string]string{
		"handle": clientResp.Handle,
		"method": "GET",
		"url":    srv.URL,
	})
	openJSON := bridgeHttpRequestStream(string(reqJSON))
	var openResp httpStreamOpenResp
	if err := json.Unmarshal([]byte(openJSON), &openResp); err != nil {
		t.Fatalf("bridgeHttpRequestStream: %v", err)
	}
	if openResp.Error != "" {
		t.Fatalf("bridgeHttpRequestStream error: %s", openResp.Error)
	}
	streamHandle := openResp.Handle

	// Read one chunk, then cancel early.
	bridgeHttpStreamRead(streamHandle)
	bridgeHttpStreamClose(streamHandle)

	httpStreamMu.RLock()
	_, stillExists := httpStreamHandles[streamHandle]
	httpStreamMu.RUnlock()
	if stillExists {
		t.Fatal("stream handle leaked after early close")
	}
}
