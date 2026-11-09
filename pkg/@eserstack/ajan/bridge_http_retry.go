// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

// The retry policy of @eserstack/httpclient's HttpClient, served from
// httpclient/resilience (no net/http, so the WASM profile has it too). The
// TypeScript client runs the attempt loop and asks these two names how many
// attempts a request gets and what to do after each failed one.

import (
	"encoding/json"
	"fmt"

	"github.com/eser/stack/pkg/ajan/httpclient/resilience"
)

type httpRetryResolveRequest struct {
	// Client and Request are RetryConfig objects, false, or absent.
	Client  resilience.RetrySetting `json:"client"`
	Request resilience.RetrySetting `json:"request"`
	// StreamBody marks a body the first attempt consumes; it gets one attempt.
	StreamBody bool `json:"streamBody"`
}

type httpRetryResolveResponse struct {
	Plan  *resilience.RetryPlan `json:"plan,omitempty"`
	Error string                `json:"error,omitempty"`
}

type httpRetryNextRequest struct {
	// RetryAfterMs is the response's Retry-After in milliseconds; absent or
	// null when it has none.
	RetryAfterMs *resilience.JSNumber `json:"retryAfterMs"`
	// Plan is the plan httpRetryResolve answered for this request.
	Plan resilience.RetryPlan `json:"plan"`
	// Attempt is the failed attempt's number, 0 for the first.
	Attempt int `json:"attempt"`
	// Status is the response status, 0 for a network failure.
	Status int `json:"status"`
	// Random is a number in [0, 1) for the jitter.
	Random float64 `json:"random"`
}

type httpRetryNextResponse struct {
	Error   string              `json:"error,omitempty"`
	DelayMs resilience.JSNumber `json:"delayMs"`
	Retry   bool                `json:"retry"`
}

// bridgeHttpRetryResolve answers the retry plan of one request.
// Returns JSON: { plan: { maxAttempts, policy } } | { error }.
func bridgeHttpRetryResolve(requestJSON string) string {
	var req httpRetryResolveRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(httpRetryResolveResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	plan := resilience.ResolveRetryPlan(req.Client, req.Request, req.StreamBody)

	return marshalResponse(httpRetryResolveResponse{Plan: &plan}) //nolint:exhaustruct
}

// bridgeHttpRetryNext decides after a failed attempt.
// Returns JSON: { retry, delayMs } | { error }.
func bridgeHttpRetryNext(requestJSON string) string {
	var req httpRetryNextRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(httpRetryNextResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	outcome := resilience.RetryOutcome{RetryAfterMs: nil, Status: req.Status}
	if req.RetryAfterMs != nil {
		ms := float64(*req.RetryAfterMs)
		outcome.RetryAfterMs = &ms
	}

	decision := req.Plan.Next(req.Attempt, outcome, req.Random)

	return marshalResponse(httpRetryNextResponse{ //nolint:exhaustruct
		DelayMs: resilience.JSNumber(decision.DelayMs),
		Retry:   decision.Retry,
	})
}

func init() {
	register("httpRetryResolve", bridgeHttpRetryResolve)
	register("httpRetryNext", bridgeHttpRetryNext)
}
