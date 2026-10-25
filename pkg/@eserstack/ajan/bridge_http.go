// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/lib"
)

// drainHTTPHandles snapshots and clears the HTTP stream and client registries.
// Stream bodies are closed outside e.mu: a read blocked on a stalled body holds
// that lock, and closing the body is what makes it return.
func drainHTTPHandles() shutdownStep {
	httpStreamMu.Lock()

	httpStreams := make([]*httpStreamEntry, 0, len(httpStreamHandles))
	for _, e := range httpStreamHandles {
		httpStreams = append(httpStreams, e)
	}

	clear(httpStreamHandles)
	httpStreamMu.Unlock()

	httpMu.Lock()

	httpClients := make([]*httpClientState, 0, len(httpClientHandles))
	for _, c := range httpClientHandles {
		httpClients = append(httpClients, c)
	}

	clear(httpClientHandles)
	httpMu.Unlock()

	return shutdownStep{ //nolint:exhaustruct
		release: func() {
			for _, e := range httpStreams {
				e.closeBody()
			}

			for _, c := range httpClients {
				closeIdleConnections(c.client)
			}
		},
	}
}

// ---------------------------------------------------------------------------
// HTTP bridge state
// ---------------------------------------------------------------------------

var (
	httpClientHandles = make(map[string]*httpClientState)
	httpMu            sync.RWMutex
)

type httpClientState struct {
	client  *httpclient.Client
	baseURL string
	headers map[string]string
}

// readResponseBody reads a response body under limit. When the body is larger,
// the error message names the limit and the way around it.
func readResponseBody(body io.Reader, limit int64) ([]byte, error) {
	data, err := lib.ReadAllLimited(body, limit)
	if errors.Is(err, lib.ErrReadLimitExceeded) {
		return nil, fmt.Errorf(
			"response body is larger than maxResponseBytes (%d bytes); raise maxResponseBytes or use the streaming request: %w",
			limit, err,
		)
	}

	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	return data, nil
}

// firstHeaderValues flattens response headers to their first value each.
func firstHeaderValues(header http.Header) map[string]string {
	out := make(map[string]string, len(header))
	for k, vals := range header {
		if len(vals) > 0 {
			out[k] = vals[0]
		}
	}

	return out
}

// bridgeHttpCreate parses JSON config, creates an httpclient.Client, and
// stores it under a generated handle. Returns JSON with the handle.
func bridgeHttpCreate(configJSON string) string {
	var req httpCreateRequest
	if err := json.Unmarshal([]byte(configJSON), &req); err != nil {
		return errorResponse("invalid config JSON: " + err.Error())
	}

	const (
		defaultFailureThreshold = 5
		defaultResetTimeout     = 10 * time.Second
		defaultMaxAttempts      = 3
		defaultInitialInterval  = 100 * time.Millisecond
		defaultMaxInterval      = 10 * time.Second
	)

	failureThreshold := countOrDefault(req.FailureThreshold, defaultFailureThreshold)
	resetTimeout := durationOrDefault(req.ResetTimeoutMs, defaultResetTimeout)
	maxAttempts := countOrDefault(req.MaxAttempts, defaultMaxAttempts)
	initialInterval := durationOrDefault(req.InitialIntervalMs, defaultInitialInterval)
	maxInterval := durationOrDefault(req.MaxIntervalMs, defaultMaxInterval)

	cfg := &httpclient.Config{ //nolint:exhaustruct
		CircuitBreaker: httpclient.CircuitBreakerConfig{
			Enabled:               req.CircuitBreakerEnabled,
			FailureThreshold:      failureThreshold,
			ResetTimeout:          resetTimeout,
			HalfOpenSuccessNeeded: 2,
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled:         req.RetryEnabled,
			MaxAttempts:     maxAttempts,
			InitialInterval: initialInterval,
			MaxInterval:     maxInterval,
			Multiplier:      2.0,
			RandomFactor:    0.1,
		},
		ServerErrorThreshold: httpclient.DefaultServerErrorThreshold,
	}

	opts := []httpclient.NewClientOption{httpclient.WithConfig(cfg)}

	if req.TimeoutMs > 0 {
		opts = append(opts, httpclient.WithTimeout(time.Duration(req.TimeoutMs)*time.Millisecond))
	}

	client := httpclient.NewClient(opts...)

	handle := newHandle("http")

	httpMu.Lock()
	httpClientHandles[handle] = &httpClientState{
		client:  client,
		baseURL: req.BaseURL,
		headers: req.Headers,
	}
	httpMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeHttpRequest performs an HTTP request via a stored client handle.
// Returns JSON: { status, statusText, headers, body, retries } on success,
// or { error, status, statusText, headers, body, retries } on HTTP or transport error.
//
// The body is read up to the request's maxResponseBytes, 32 MiB
// (defaultHTTPMaxResponseBytes) when unset. A larger body returns the status
// and headers with an error and no body.
func bridgeHttpRequest(requestJSON string) string {
	var req httpRequestInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(httpResponseOutput{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	httpMu.RLock()
	state, ok := httpClientHandles[req.Handle]
	httpMu.RUnlock()

	if !ok {
		return marshalResponse(httpResponseOutput{Error: "http client handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	fullURL := req.URL
	if state.baseURL != "" && !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		fullURL = strings.TrimRight(state.baseURL, "/") + "/" + strings.TrimLeft(req.URL, "/")
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = bytes.NewBufferString(req.Body)
	}

	var retryCount atomic.Int32
	ctx := httpclient.WithRetryCounter(context.Background(), &retryCount)

	httpReq, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return marshalResponse(httpResponseOutput{Error: "build request: " + err.Error()}) //nolint:exhaustruct
	}

	for k, v := range state.headers {
		httpReq.Header.Set(k, v)
	}

	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := state.client.Do(httpReq)
	retries := int(retryCount.Load())
	if err != nil {
		return marshalResponse(httpResponseOutput{Error: "request failed: " + err.Error(), Retries: retries}) //nolint:exhaustruct
	}
	defer resp.Body.Close() //nolint:errcheck,gosec // the body is read in full or abandoned; a failed close loses nothing

	out := httpResponseOutput{ //nolint:exhaustruct
		Status:     resp.StatusCode,
		StatusText: http.StatusText(resp.StatusCode),
		Headers:    firstHeaderValues(resp.Header),
		Retries:    retries,
	}

	bodyBytes, err := readResponseBody(resp.Body, responseBodyLimit(req.MaxResponseBytes))
	if err != nil {
		out.Error = err.Error()

		return marshalResponse(out)
	}

	out.Body = string(bodyBytes)

	if resp.StatusCode >= http.StatusBadRequest {
		out.Error = fmt.Sprintf("HTTP %d %s", resp.StatusCode, http.StatusText(resp.StatusCode))
	}

	return marshalResponse(out)
}

// closeIdleConnections releases the pooled TCP connections a client's
// transport is holding.
//
// http.Client.CloseIdleConnections only forwards to a transport that
// implements the method, and httpclient.ResilientTransport does not -- it
// wraps the real one -- so the call has to reach through to the inner
// transport or the pooled sockets outlive the handle.
func closeIdleConnections(client *httpclient.Client) {
	if client == nil {
		return
	}

	type idleCloser interface{ CloseIdleConnections() }

	if client.Transport != nil {
		if inner, ok := client.Transport.Transport.(idleCloser); ok {
			inner.CloseIdleConnections()

			return
		}
	}

	if client.Client != nil {
		client.CloseIdleConnections()
	}
}

// bridgeHttpClose removes a stored http client handle and drops its pooled
// connections.
//
// Closing an unknown or already-closed handle succeeds: close is idempotent
// across every handle kind in this bridge.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeHttpClose(handle string) string {
	httpMu.Lock()
	state, ok := httpClientHandles[handle]
	if ok {
		delete(httpClientHandles, handle)
	}
	httpMu.Unlock()

	if !ok {
		return "{}"
	}

	closeIdleConnections(state.client)

	return "{}"
}

// ---------------------------------------------------------------------------
// HTTP streaming bridge state
// ---------------------------------------------------------------------------

var (
	httpStreamHandles = make(map[string]*httpStreamEntry)
	httpStreamMu      sync.RWMutex
)

type httpStreamEntry struct {
	body io.ReadCloser

	// mu serializes concurrent reads on one handle. Close must never take it:
	// a read blocked on a stalled SSE or long-poll body holds it until the
	// server sends bytes, and a Close that waited behind it would hang the
	// calling FFI thread for exactly as long.
	mu sync.Mutex

	// closeOnce/done make body teardown safe from any thread. http.Response.Body
	// is documented as safe to Close concurrently with a Read in flight, and
	// doing so is what unblocks that read.
	closeOnce sync.Once
	done      atomic.Bool
}

// closeBody tears the response body down exactly once, from any goroutine and
// without holding entry.mu.
func (e *httpStreamEntry) closeBody() {
	e.closeOnce.Do(func() {
		e.done.Store(true)
		e.body.Close() //nolint:errcheck,gosec // best-effort teardown
	})
}

// ---------------------------------------------------------------------------
// HTTP streaming bridge functions
// ---------------------------------------------------------------------------

const httpStreamChunkSize = 8192

// bridgeHttpRequestStream starts a streaming HTTP request via a stored client handle.
// Blocks until response headers are received, then stores the open body reader.
// Returns JSON: { handle, status, statusText, headers } | { error: string }
func bridgeHttpRequestStream(requestJSON string) string {
	var req httpRequestInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	httpMu.RLock()
	state, ok := httpClientHandles[req.Handle]
	httpMu.RUnlock()

	if !ok {
		return errorResponse("http client handle not found: " + req.Handle)
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	fullURL := req.URL
	if state.baseURL != "" && !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		fullURL = strings.TrimRight(state.baseURL, "/") + "/" + strings.TrimLeft(req.URL, "/")
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = bytes.NewBufferString(req.Body)
	}

	httpReq, err := http.NewRequestWithContext(context.Background(), method, fullURL, bodyReader)
	if err != nil {
		return errorResponse("build request: " + err.Error())
	}

	for k, v := range state.headers {
		httpReq.Header.Set(k, v)
	}

	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := state.client.Do(httpReq)
	if err != nil {
		return errorResponse("request failed: " + err.Error())
	}

	if resp.StatusCode >= http.StatusBadRequest {
		bodyBytes, readErr := readResponseBody(resp.Body, responseBodyLimit(req.MaxResponseBytes))
		resp.Body.Close() //nolint:errcheck,gosec // the error body is read or abandoned; a failed close loses nothing
		if readErr != nil {
			return errorResponse(fmt.Sprintf("read error response body (status %d): %v", resp.StatusCode, readErr))
		}

		return marshalResponse(httpStreamCreateOutput{
			Error:      fmt.Sprintf("HTTP %d %s", resp.StatusCode, http.StatusText(resp.StatusCode)),
			Status:     resp.StatusCode,
			StatusText: http.StatusText(resp.StatusCode),
			Headers:    firstHeaderValues(resp.Header),
			Handle:     "",
			Body:       string(bodyBytes),
		})
	}

	streamHandle := newHandle("httpstream")

	httpStreamMu.Lock()
	httpStreamHandles[streamHandle] = &httpStreamEntry{body: resp.Body} //nolint:exhaustruct
	httpStreamMu.Unlock()

	return marshalResponse(httpStreamCreateOutput{ //nolint:exhaustruct
		Handle:     streamHandle,
		Status:     resp.StatusCode,
		StatusText: http.StatusText(resp.StatusCode),
		Headers:    firstHeaderValues(resp.Header),
	})
}

// bridgeHttpStreamRead reads the next chunk from an open stream handle.
// Returns JSON: { chunk: "<base64>", done: false } | { done: true } | { error: string }
func bridgeHttpStreamRead(handle string) string {
	httpStreamMu.RLock()
	entry, ok := httpStreamHandles[handle]
	httpStreamMu.RUnlock()

	if !ok {
		return errorResponse("http stream handle not found: " + handle)
	}

	entry.mu.Lock()
	defer entry.mu.Unlock()

	if entry.done.Load() {
		return marshalResponse(httpStreamReadOutput{Done: true}) //nolint:exhaustruct
	}

	buf := make([]byte, httpStreamChunkSize)

	n, err := entry.body.Read(buf)
	if n > 0 {
		chunk := base64.StdEncoding.EncodeToString(buf[:n])
		if err == io.EOF {
			entry.closeBody()
		}

		return marshalResponse(httpStreamReadOutput{Chunk: chunk, Done: entry.done.Load()}) //nolint:exhaustruct
	}

	if err == io.EOF {
		entry.closeBody()

		return marshalResponse(httpStreamReadOutput{Done: true}) //nolint:exhaustruct
	}

	if err != nil {
		entry.closeBody()

		return errorResponse("stream read error: " + err.Error())
	}

	return marshalResponse(httpStreamReadOutput{Done: false}) //nolint:exhaustruct
}

// bridgeHttpStreamClose cancels an open stream handle and removes it.
//
// Closing an unknown or already-closed handle succeeds: close is idempotent
// across every handle kind in this bridge.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeHttpStreamClose(handle string) string {
	httpStreamMu.Lock()
	entry, ok := httpStreamHandles[handle]

	if ok {
		delete(httpStreamHandles, handle)
	}

	httpStreamMu.Unlock()

	if !ok {
		return "{}"
	}

	// Deliberately not under entry.mu: an in-flight read holds that lock until
	// the server sends bytes, and closing the body is what makes it return.
	entry.closeBody()

	return "{}"
}

func init() {
	registerShutdownDrain(drainHTTPHandles)
	register("httpCreate", []string{"configJSON"}, func(a []string) string { return bridgeHttpCreate(a[0]) })
	register("httpRequest", []string{"requestJSON"}, func(a []string) string { return bridgeHttpRequest(a[0]) })
	register("httpClose", []string{"handle"}, func(a []string) string { return bridgeHttpClose(a[0]) })
	register("httpRequestStream", []string{"requestJSON"}, func(a []string) string { return bridgeHttpRequestStream(a[0]) })
	register("httpStreamRead", []string{"handle"}, func(a []string) string { return bridgeHttpStreamRead(a[0]) })
	register("httpStreamClose", []string{"handle"}, func(a []string) string { return bridgeHttpStreamClose(a[0]) })
}
