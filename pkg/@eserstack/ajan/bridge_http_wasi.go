// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build wasip1 && eserajan_wasi

package main

// The http* names on the WASM reactor, on the host's fetch (host_fetch_wasi.go)
// instead of net/http. They answer the native bridge's JSON (bridge_http.go)
// and retry and break circuits with the same httpclient/resilience code and
// the same rules as httpclient.ResilientTransport. The differences:
//   - the timeout bounds the whole request, retries included, as
//     http.Client.Timeout does, but the host reports it in its own words;
//   - a header the server sent more than once arrives joined by ", ", as
//     fetch joins it, where the native bridge keeps the first value;
//   - the host follows redirects only within the same scheme;
//   - a request with a requestId stops when the caller's AbortSignal fires.

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient/resilience"
)

// The defaults of bridge_http.go and httpclient.
const (
	httpServerErrorThreshold    = 500
	httpDefaultFailureThreshold = 5
	httpDefaultResetTimeout     = 10 * time.Second
)

var (
	errHTTPCircuitOpen       = errors.New("circuit breaker is open")
	errHTTPMaxRetries        = errors.New("max retries exceeded")
	errHTTPAllAttemptsFailed = errors.New("all retry attempts failed")
	errHTTPTransport         = errors.New("transport error")
	errHTTPAborted           = errors.New("request aborted")
)

type wasiHTTPClient struct {
	headers        map[string]string
	breaker        *resilience.CircuitBreaker
	retry          *resilience.RetryStrategy
	retryConfig    resilience.RetryStrategyConfig
	baseURL        string
	timeout        time.Duration
	breakerEnabled bool
}

var (
	wasiHTTPClients = make(map[string]*wasiHTTPClient) //nolint:gochecknoglobals
	wasiHTTPStreams = make(map[string]string)          //nolint:gochecknoglobals // bridge handle -> host stream id
	wasiHTTPMu      sync.Mutex                         //nolint:gochecknoglobals
)

func bridgeHttpCreate(configJSON string) string {
	var req httpCreateRequest
	if err := json.Unmarshal([]byte(configJSON), &req); err != nil {
		return errorResponse("invalid config JSON: " + err.Error())
	}

	breakerConfig := resilience.CircuitBreakerConfig{
		Enabled:               req.CircuitBreakerEnabled,
		FailureThreshold:      countOrDefault(req.FailureThreshold, httpDefaultFailureThreshold),
		ResetTimeout:          durationOrDefault(req.ResetTimeoutMs, httpDefaultResetTimeout),
		HalfOpenSuccessNeeded: 2, //nolint:mnd // as bridge_http.go
	}
	retryConfig := resilience.RetryStrategyConfig{
		Enabled:         req.RetryEnabled,
		MaxAttempts:     countOrDefault(req.MaxAttempts, resilience.DefaultMaxAttempts),
		InitialInterval: durationOrDefault(req.InitialIntervalMs, resilience.DefaultInitialInterval),
		MaxInterval:     durationOrDefault(req.MaxIntervalMs, resilience.DefaultMaxInterval),
		Multiplier:      resilience.DefaultMultiplier,
		RandomFactor:    resilience.DefaultRandomFactor,
	}

	client := &wasiHTTPClient{
		headers:        req.Headers,
		breaker:        resilience.NewCircuitBreaker(&breakerConfig),
		retry:          resilience.NewRetryStrategy(&retryConfig),
		retryConfig:    retryConfig,
		baseURL:        req.BaseURL,
		timeout:        time.Duration(max(req.TimeoutMs, 0)) * time.Millisecond,
		breakerEnabled: req.CircuitBreakerEnabled,
	}

	handle := newHandle("http")

	wasiHTTPMu.Lock()
	wasiHTTPClients[handle] = client
	wasiHTTPMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

func lookupWasiHTTPClient(handle string) (*wasiHTTPClient, bool) {
	wasiHTTPMu.Lock()
	defer wasiHTTPMu.Unlock()

	client, ok := wasiHTTPClients[handle]

	return client, ok
}

// fetchRequest builds the host request of an input, as the native bridge
// builds its http.Request.
func (c *wasiHTTPClient) fetchRequest(req *httpRequestInput, stream bool) *hostFetchRequest {
	method := req.Method
	if method == "" {
		method = "GET"
	}

	fullURL := req.URL
	if c.baseURL != "" && !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		fullURL = strings.TrimRight(c.baseURL, "/") + "/" + strings.TrimLeft(req.URL, "/")
	}

	headers := make(map[string]string, len(c.headers)+len(req.Headers))
	for k, v := range c.headers {
		headers[canonicalHeaderKey(k)] = v
	}

	for k, v := range req.Headers {
		headers[canonicalHeaderKey(k)] = v
	}

	return &hostFetchRequest{
		Headers:          headers,
		Method:           strings.ToUpper(method),
		URL:              fullURL,
		Body:             req.Body,
		RequestID:        req.RequestID,
		MaxResponseBytes: responseBodyLimit(req.MaxResponseBytes),
		Stream:           stream,
	}
}

// do runs the request with the retry and circuit-breaker rules of
// httpclient.ResilientTransport. It answers the last response, the retries
// made, and the error as that transport words it.
func (c *wasiHTTPClient) do(req *hostFetchRequest) (*hostFetchResponse, int, error) { //nolint:cyclop // mirrors ResilientTransport.RoundTrip
	if c.breakerEnabled && !c.breaker.IsAllowed() {
		return nil, 0, errHTTPCircuitOpen
	}

	maxAttempts := uint(1)
	if c.retryConfig.Enabled {
		maxAttempts = max(c.retryConfig.MaxAttempts, 1)
	}

	var deadline time.Time
	if c.timeout > 0 {
		deadline = time.Now().Add(c.timeout)
	}

	var (
		resp    *hostFetchResponse
		lastErr error
		retries int
	)

	for attempt := range maxAttempts {
		if attempt > 0 && c.retryConfig.Enabled {
			retries++

			backoff := c.retry.NextBackoff(attempt)
			if backoff <= 0 {
				return nil, retries, errHTTPMaxRetries
			}

			if !deadline.IsZero() && time.Until(deadline) < backoff {
				return nil, retries, fmt.Errorf("%w: the %s timeout ends before the next attempt", errHTTPTransport, c.timeout)
			}

			hostSleep(int32(backoff.Milliseconds())) //nolint:gosec // backoff is capped by MaxInterval
		}

		if !deadline.IsZero() {
			req.TimeoutMs = max(time.Until(deadline).Milliseconds(), 1)
		}

		resp, lastErr = c.attempt(req)

		if lastErr == nil && resp.Status < httpServerErrorThreshold {
			return resp, retries, nil
		}

		if errors.Is(lastErr, errHTTPAborted) {
			return nil, retries, lastErr
		}

		if c.breakerEnabled && !c.breaker.IsAllowed() {
			releaseHostStream(resp)

			return nil, retries, errHTTPCircuitOpen
		}

		if !c.retryConfig.Enabled || attempt == maxAttempts-1 {
			break
		}

		releaseHostStream(resp)

		resp = nil
	}

	if lastErr != nil {
		if c.retryConfig.Enabled && maxAttempts > 1 {
			return nil, retries, fmt.Errorf("%w: %w", errHTTPAllAttemptsFailed, lastErr)
		}

		return nil, retries, fmt.Errorf("%w: %w", errHTTPTransport, lastErr)
	}

	if c.retryConfig.Enabled && maxAttempts > 1 {
		releaseHostStream(resp)

		return nil, retries, errHTTPMaxRetries
	}

	return resp, retries, nil
}

// attempt is one host fetch, counted by the circuit breaker as
// ResilientTransport.handleRequest counts it.
func (c *wasiHTTPClient) attempt(req *hostFetchRequest) (*hostFetchResponse, error) {
	resp, err := hostFetch(req)

	switch {
	case err != nil:
	case resp.Aborted:
		return nil, errHTTPAborted
	case resp.Error != "" && resp.Status == 0:
		err = errors.New(resp.Error) //nolint:err113 // the host's own words
	}

	if err != nil {
		if c.breakerEnabled {
			c.breaker.OnFailure()
		}

		return nil, fmt.Errorf("%w: %w", errHTTPTransport, err)
	}

	if c.breakerEnabled {
		if resp.Status >= httpServerErrorThreshold {
			c.breaker.OnFailure()
		} else {
			c.breaker.OnSuccess()
		}
	}

	return resp, nil
}

func releaseHostStream(resp *hostFetchResponse) {
	if resp != nil && resp.StreamID != "" {
		hostRelease(resp.StreamID)
	}
}

func decodeHostBody(resp *hostFetchResponse) ([]byte, error) {
	body, err := base64.StdEncoding.DecodeString(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	return body, nil
}

func tooLargeError(limit int64) string {
	return fmt.Sprintf("response body is larger than maxResponseBytes (%d bytes); raise maxResponseBytes or use the streaming request: read limit exceeded", limit)
}

func bridgeHttpRequest(requestJSON string) string {
	var req httpRequestInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(httpResponseOutput{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	client, ok := lookupWasiHTTPClient(req.Handle)
	if !ok {
		return marshalResponse(httpResponseOutput{Error: "http client handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	fetchReq := client.fetchRequest(&req, false)

	resp, retries, err := client.do(fetchReq)
	if err != nil {
		return marshalResponse(httpResponseOutput{Error: "request failed: " + err.Error(), Retries: retries}) //nolint:exhaustruct
	}

	out := httpResponseOutput{ //nolint:exhaustruct
		Status:     resp.Status,
		StatusText: statusText(resp.Status),
		Headers:    canonicalHeaders(resp.Headers),
		Retries:    retries,
	}

	if resp.TooLarge {
		out.Error = tooLargeError(fetchReq.MaxResponseBytes)

		return marshalResponse(out)
	}

	body, err := decodeHostBody(resp)
	if err != nil {
		out.Error = err.Error()

		return marshalResponse(out)
	}

	out.Body = string(body)

	if resp.Status >= 400 { //nolint:mnd // http.StatusBadRequest
		out.Error = fmt.Sprintf("HTTP %d %s", resp.Status, statusText(resp.Status))
	}

	return marshalResponse(out)
}

//nolint:unparam // uniform string return is part of the bridge ABI
func bridgeHttpClose(handle string) string {
	wasiHTTPMu.Lock()
	delete(wasiHTTPClients, handle)
	wasiHTTPMu.Unlock()

	return "{}"
}

func bridgeHttpRequestStream(requestJSON string) string {
	var req httpRequestInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid request JSON: " + err.Error())
	}

	client, ok := lookupWasiHTTPClient(req.Handle)
	if !ok {
		return errorResponse("http client handle not found: " + req.Handle)
	}

	fetchReq := client.fetchRequest(&req, true)

	resp, _, err := client.do(fetchReq)
	if err != nil {
		return errorResponse("request failed: " + err.Error())
	}

	headers := canonicalHeaders(resp.Headers)

	if resp.Status >= 400 { //nolint:mnd // http.StatusBadRequest
		// The host reads an error body in full instead of opening a stream.
		if resp.TooLarge {
			return errorResponse(fmt.Sprintf("read error response body (status %d): %s", resp.Status, tooLargeError(fetchReq.MaxResponseBytes)))
		}

		body, err := decodeHostBody(resp)
		if err != nil {
			return errorResponse(fmt.Sprintf("read error response body (status %d): %v", resp.Status, err))
		}

		return marshalResponse(httpStreamCreateOutput{
			Error:      fmt.Sprintf("HTTP %d %s", resp.Status, statusText(resp.Status)),
			Status:     resp.Status,
			StatusText: statusText(resp.Status),
			Headers:    headers,
			Handle:     "",
			Body:       string(body),
		})
	}

	handle := newHandle("httpstream")

	wasiHTTPMu.Lock()
	wasiHTTPStreams[handle] = resp.StreamID
	wasiHTTPMu.Unlock()

	return marshalResponse(httpStreamCreateOutput{ //nolint:exhaustruct
		Handle:     handle,
		Status:     resp.Status,
		StatusText: statusText(resp.Status),
		Headers:    headers,
	})
}

func bridgeHttpStreamRead(handle string) string {
	wasiHTTPMu.Lock()
	streamID, ok := wasiHTTPStreams[handle]
	wasiHTTPMu.Unlock()

	if !ok {
		return errorResponse("http stream handle not found: " + handle)
	}

	if streamID == "" {
		return marshalResponse(httpStreamReadOutput{Done: true}) //nolint:exhaustruct
	}

	chunk, err := hostRead(streamID)
	if err == nil && chunk.Error != "" {
		err = errors.New(chunk.Error) //nolint:err113 // the host's own words
	}

	if err != nil {
		closeWasiStream(handle)

		return errorResponse("stream read error: " + err.Error())
	}

	if chunk.Done {
		// The host has released a finished stream; later reads answer done.
		wasiHTTPMu.Lock()
		wasiHTTPStreams[handle] = ""
		wasiHTTPMu.Unlock()
	}

	return marshalResponse(httpStreamReadOutput{Chunk: chunk.Chunk, Done: chunk.Done}) //nolint:exhaustruct
}

func closeWasiStream(handle string) {
	wasiHTTPMu.Lock()
	streamID, ok := wasiHTTPStreams[handle]
	delete(wasiHTTPStreams, handle)
	wasiHTTPMu.Unlock()

	if ok && streamID != "" {
		hostRelease(streamID)
	}
}

//nolint:unparam // uniform string return is part of the bridge ABI
func bridgeHttpStreamClose(handle string) string {
	closeWasiStream(handle)

	return "{}"
}

// canonicalHeaderKey writes a header name as Go's net/textproto does
// ("content-type" -> "Content-Type"), so the answers match the native bridge.
func canonicalHeaderKey(key string) string {
	out := []byte(key)
	upper := true

	for i, c := range out {
		switch {
		case c == ' ' || c >= 0x7f:
			return key
		case upper && 'a' <= c && c <= 'z':
			out[i] = c - ('a' - 'A')
		case !upper && 'A' <= c && c <= 'Z':
			out[i] = c + ('a' - 'A')
		}

		upper = c == '-'
	}

	return string(out)
}

func canonicalHeaders(headers map[string]string) map[string]string {
	out := make(map[string]string, len(headers))
	for k, v := range headers {
		out[canonicalHeaderKey(k)] = v
	}

	return out
}

func init() {
	register("httpCreate", []string{"configJSON"}, func(a []string) string { return bridgeHttpCreate(a[0]) })
	register("httpRequest", []string{"requestJSON"}, func(a []string) string { return bridgeHttpRequest(a[0]) })
	register("httpClose", []string{"handle"}, func(a []string) string { return bridgeHttpClose(a[0]) })
	register("httpRequestStream", []string{"requestJSON"}, func(a []string) string { return bridgeHttpRequestStream(a[0]) })
	register("httpStreamRead", []string{"handle"}, func(a []string) string { return bridgeHttpStreamRead(a[0]) })
	register("httpStreamClose", []string{"handle"}, func(a []string) string { return bridgeHttpStreamClose(a[0]) })
}
