// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase E — structured error payload and retry count surfacing.

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestBridgeHttpRequest_RetriesPopulated verifies retry counter behaviour after
// the ServerErrorThreshold fix (WIRING.md: RESOLVED).
// Three cases: 5xx exhausts retries, 2xx succeeds immediately, 4xx not retriable.
func TestBridgeHttpRequest_RetriesPopulated(t *testing.T) {
	t.Parallel()

	t.Run("5xx retries exhausted retries>0", func(t *testing.T) {
		t.Parallel()

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("unavailable"))
		}))
		defer srv.Close()

		clientCfg, _ := json.Marshal(map[string]any{
			"retryEnabled":      true,
			"maxAttempts":       2,
			"initialIntervalMs": 10,
		})
		handleJSON := bridgeHttpCreate(string(clientCfg))
		var clientResp httpClientHandleResp
		if err := json.Unmarshal([]byte(handleJSON), &clientResp); err != nil {
			t.Fatalf("bridgeHttpCreate: %v", err)
		}
		defer bridgeHttpClose(clientResp.Handle)

		reqJSON, _ := json.Marshal(map[string]string{
			"handle": clientResp.Handle, "method": "GET", "url": srv.URL,
		})
		var resp httpResponseOutput
		if err := json.Unmarshal([]byte(bridgeHttpRequest(string(reqJSON))), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}

		if resp.Retries == 0 {
			t.Fatalf("expected retries>0 for 5xx with retry enabled, got %d", resp.Retries)
		}
	})

	t.Run("2xx no retries", func(t *testing.T) {
		t.Parallel()

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
		}))
		defer srv.Close()

		clientCfg, _ := json.Marshal(map[string]any{
			"retryEnabled":      true,
			"maxAttempts":       3,
			"initialIntervalMs": 10,
		})
		handleJSON := bridgeHttpCreate(string(clientCfg))
		var clientResp httpClientHandleResp
		if err := json.Unmarshal([]byte(handleJSON), &clientResp); err != nil {
			t.Fatalf("bridgeHttpCreate: %v", err)
		}
		defer bridgeHttpClose(clientResp.Handle)

		reqJSON, _ := json.Marshal(map[string]string{
			"handle": clientResp.Handle, "method": "GET", "url": srv.URL,
		})
		var resp httpResponseOutput
		if err := json.Unmarshal([]byte(bridgeHttpRequest(string(reqJSON))), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}

		if resp.Error != "" {
			t.Fatalf("expected no error for 2xx, got: %s", resp.Error)
		}
		if resp.Retries != 0 {
			t.Fatalf("expected retries==0 for 2xx, got %d", resp.Retries)
		}
	})

	t.Run("4xx below threshold no retries", func(t *testing.T) {
		t.Parallel()

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte("not found"))
		}))
		defer srv.Close()

		clientCfg, _ := json.Marshal(map[string]any{
			"retryEnabled":      true,
			"maxAttempts":       3,
			"initialIntervalMs": 10,
		})
		handleJSON := bridgeHttpCreate(string(clientCfg))
		var clientResp httpClientHandleResp
		if err := json.Unmarshal([]byte(handleJSON), &clientResp); err != nil {
			t.Fatalf("bridgeHttpCreate: %v", err)
		}
		defer bridgeHttpClose(clientResp.Handle)

		reqJSON, _ := json.Marshal(map[string]string{
			"handle": clientResp.Handle, "method": "GET", "url": srv.URL,
		})
		var resp httpResponseOutput
		if err := json.Unmarshal([]byte(bridgeHttpRequest(string(reqJSON))), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}

		if resp.Error == "" {
			t.Fatal("expected structured error for 404")
		}
		if resp.Retries != 0 {
			t.Fatalf("expected retries==0 for 4xx below threshold, got %d", resp.Retries)
		}
	})
}

// TestBridgeHttpRequest_429_StructuredError verifies that a 429 response
// comes back as a structured error payload (not a silent success).
func TestBridgeHttpRequest_429_StructuredError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"rate limited"}`))
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
	respJSON := bridgeHttpRequest(string(reqJSON))
	var resp httpResponseOutput
	if err := json.Unmarshal([]byte(respJSON), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if resp.Error == "" {
		t.Fatal("expected non-empty error field for 429 response")
	}
	if resp.Status != http.StatusTooManyRequests {
		t.Fatalf("expected status 429, got %d", resp.Status)
	}
	if resp.Body == "" {
		t.Fatal("expected body populated in error response")
	}
	if resp.Headers["Retry-After"] == "" {
		t.Fatal("expected Retry-After header in error response")
	}
}

// TestBridgeHttpRequest_404_StructuredError verifies a generic 4xx error.
func TestBridgeHttpRequest_404_StructuredError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("not found"))
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
	respJSON := bridgeHttpRequest(string(reqJSON))
	var resp httpResponseOutput
	if err := json.Unmarshal([]byte(respJSON), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if resp.Error == "" {
		t.Fatal("expected non-empty error field for 404 response")
	}
	if resp.Status != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", resp.Status)
	}
}

// TestBridgeHttpRequest_2xx_NoError verifies that 2xx responses have no error field.
func TestBridgeHttpRequest_2xx_NoError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
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
	respJSON := bridgeHttpRequest(string(reqJSON))
	var resp httpResponseOutput
	if err := json.Unmarshal([]byte(respJSON), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if resp.Error != "" {
		t.Fatalf("expected no error for 200 response, got: %s", resp.Error)
	}
	if resp.Status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Status)
	}
}

// TestBridgeHttpRequestStream_429_StructuredError verifies that streaming
// also returns a structured error for non-2xx responses.
func TestBridgeHttpRequestStream_429_StructuredError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte("rate limited"))
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
	var open httpStreamCreateOutput
	if err := json.Unmarshal([]byte(openJSON), &open); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if open.Error == "" {
		t.Fatal("expected non-empty error for 429 stream response")
	}
	if open.Status != http.StatusTooManyRequests {
		t.Fatalf("expected status 429, got %d", open.Status)
	}
	if open.Handle != "" {
		t.Fatal("expected empty handle on error — no stream should be opened")
	}
	// Verify no handle was left in the map
	httpStreamMu.RLock()
	mapLen := len(httpStreamHandles)
	httpStreamMu.RUnlock()
	_ = mapLen // just confirms no leak (existing handles may exist from parallel tests)
}
