// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResponseBodyLimit(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		requested int64
		want      int64
	}{
		{name: "unset uses the default", requested: 0, want: defaultHTTPMaxResponseBytes},
		{name: "negative uses the default", requested: -1, want: defaultHTTPMaxResponseBytes},
		{name: "positive is kept", requested: 1024, want: 1024},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := responseBodyLimit(tt.requested); got != tt.want {
				t.Fatalf("responseBodyLimit(%d) = %d, want %d", tt.requested, got, tt.want)
			}
		})
	}
}

// newLimitTestClient opens a bridge HTTP client handle and closes it when the
// test ends.
func newLimitTestClient(t *testing.T) string {
	t.Helper()

	var created httpClientHandleResp
	if err := json.Unmarshal([]byte(bridgeHttpCreate(`{}`)), &created); err != nil {
		t.Fatalf("bridgeHttpCreate: %v", err)
	}

	if created.Error != "" {
		t.Fatalf("bridgeHttpCreate error: %s", created.Error)
	}

	t.Cleanup(func() { bridgeHttpClose(created.Handle) })

	return created.Handle
}

func TestBridgeHttpRequest_MaxResponseBytes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		body      string
		limit     int64
		wantBody  string
		wantError string
	}{
		{name: "body at the limit is returned", body: "12345678", limit: 8, wantBody: "12345678"},
		{name: "body over the limit is an error", body: "123456789", limit: 8, wantError: "maxResponseBytes (8 bytes)"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(tt.body))
			}))
			defer srv.Close()

			reqJSON, err := json.Marshal(map[string]any{
				"handle":           newLimitTestClient(t),
				"url":              srv.URL,
				"maxResponseBytes": tt.limit,
			})
			if err != nil {
				t.Fatalf("marshal request: %v", err)
			}

			var resp httpResponseOutput
			if err := json.Unmarshal([]byte(bridgeHttpRequest(string(reqJSON))), &resp); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}

			if resp.Status != http.StatusOK {
				t.Fatalf("status = %d, want %d", resp.Status, http.StatusOK)
			}

			if resp.Body != tt.wantBody {
				t.Fatalf("body = %q, want %q", resp.Body, tt.wantBody)
			}

			if tt.wantError == "" && resp.Error != "" {
				t.Fatalf("unexpected error: %s", resp.Error)
			}

			if !strings.Contains(resp.Error, tt.wantError) {
				t.Fatalf("error = %q, want it to contain %q", resp.Error, tt.wantError)
			}
		})
	}
}

func TestBridgeHttpRequestStream_ErrorBodyOverLimit(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream failed with a long explanation"))
	}))
	defer srv.Close()

	reqJSON, err := json.Marshal(map[string]any{
		"handle":           newLimitTestClient(t),
		"url":              srv.URL,
		"maxResponseBytes": 4,
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	var resp httpStreamOpenResp
	if err := json.Unmarshal([]byte(bridgeHttpRequestStream(string(reqJSON))), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if resp.Handle != "" {
		t.Fatalf("expected no stream handle for an error status, got %q", resp.Handle)
	}

	if !strings.Contains(resp.Error, "status 502") || !strings.Contains(resp.Error, "maxResponseBytes (4 bytes)") {
		t.Fatalf("error = %q, want the status and the limit", resp.Error)
	}
}
