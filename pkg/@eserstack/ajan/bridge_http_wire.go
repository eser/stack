// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

// The HTTP wire types and limits shared by the native bridge (bridge_http.go)
// and the WASM reactor's host-fetch client (bridge_http_wasi.go).

import "time"

// ---------------------------------------------------------------------------
// HTTP wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type httpCreateRequest struct {
	Headers               map[string]string `json:"headers,omitempty"`
	BaseURL               string            `json:"baseUrl"`
	RetryEnabled          bool              `json:"retryEnabled"`
	CircuitBreakerEnabled bool              `json:"circuitBreakerEnabled"`
	TimeoutMs             int               `json:"timeoutMs"`
	MaxAttempts           int               `json:"maxAttempts"`
	InitialIntervalMs     int               `json:"initialIntervalMs"`
	MaxIntervalMs         int               `json:"maxIntervalMs"`
	FailureThreshold      int               `json:"failureThreshold"`
	ResetTimeoutMs        int               `json:"resetTimeoutMs"`
}

type httpRequestInput struct {
	Headers map[string]string `json:"headers,omitempty"`
	Handle  string            `json:"handle"`
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Body    string            `json:"body,omitempty"`
	// MaxResponseBytes caps the response body read into memory; zero or less
	// means defaultHTTPMaxResponseBytes. A larger body is reported as an error.
	MaxResponseBytes int64 `json:"maxResponseBytes,omitempty"`
	// RequestID names the request for the WASM host, which aborts its fetch
	// when the caller's AbortSignal fires; the native build ignores it.
	RequestID string `json:"requestId,omitempty"`
}

type httpResponseOutput struct {
	Headers    map[string]string `json:"headers"`
	StatusText string            `json:"statusText"`
	Body       string            `json:"body"`
	Error      string            `json:"error,omitempty"`
	Status     int               `json:"status"`
	Retries    int               `json:"retries"`
}

// ---------------------------------------------------------------------------
// HTTP bridge functions
// ---------------------------------------------------------------------------

// defaultHTTPMaxResponseBytes caps the response body a request reads into
// memory when the caller sets no maxResponseBytes. The whole body crosses the
// bridge as one JSON string; a larger download belongs on the streaming
// request, which hands the body over in chunks.
const defaultHTTPMaxResponseBytes int64 = 32 << 20

// responseBodyLimit returns the caller's body cap, or
// defaultHTTPMaxResponseBytes when it is absent or not positive.
func responseBodyLimit(requested int64) int64 {
	if requested <= 0 {
		return defaultHTTPMaxResponseBytes
	}

	return requested
}

// countOrDefault converts a JSON-supplied count to uint, falling back to
// fallback when it is absent or negative.
//
// The conversion matters: uint(-1) is 18446744073709551615, so a negative
// failureThreshold or maxAttempts silently became an effectively infinite one
// instead of being rejected.
func countOrDefault(v int, fallback uint) uint {
	if v <= 0 {
		return fallback
	}

	return uint(v)
}

// durationOrDefault converts a JSON-supplied millisecond count to a Duration,
// falling back to fallback when it is absent or negative. A negative duration
// is never a meaningful timeout or interval.
func durationOrDefault(ms int, fallback time.Duration) time.Duration {
	if ms <= 0 {
		return fallback
	}

	return time.Duration(ms) * time.Millisecond
}

// ---------------------------------------------------------------------------
// HTTP streaming wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type httpStreamCreateOutput struct {
	Headers    map[string]string `json:"headers"`
	Handle     string            `json:"handle"`
	StatusText string            `json:"statusText"`
	Body       string            `json:"body,omitempty"`
	Error      string            `json:"error,omitempty"`
	Status     int               `json:"status"`
}

type httpStreamReadOutput struct {
	Chunk string `json:"chunk"`
	Error string `json:"error,omitempty"`
	Done  bool   `json:"done"`
}
