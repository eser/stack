// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package resilience

import "math"

// The retry policy of @eserstack/httpclient's HttpClient (TASK-129). The
// TypeScript client keeps the attempt loop, because it runs the caller's
// request interceptors before every attempt, and asks this policy how many
// attempts a request gets and whether and how long to wait after each failed
// one, on the fetch transport and the native transport alike.
//
// The numbers are JavaScript numbers: NaN and the infinities pass through,
// a fractional maxAttempts counts as the client's loop counts it, and delays
// round as JavaScript's Math.round does.

// HTTP statuses the policy treats on their own.
const (
	statusNoResponse      = 0
	statusTooManyRequests = 429
)

// RetryPolicy is a resolved retry policy: every field has its value.
type RetryPolicy struct {
	// RetryableStatuses are the response statuses that are retried.
	RetryableStatuses []float64
	// MaxAttempts counts the attempts, the first one included.
	MaxAttempts float64
	// InitialDelay is the first backoff delay in milliseconds.
	InitialDelay float64
	// MaxDelay caps one backoff delay in milliseconds; a Retry-After wait is
	// not capped.
	MaxDelay float64
	// Factor multiplies the delay after every attempt.
	Factor float64
	// Jitter scales each delay by a random factor between one half and one.
	Jitter bool
	// RespectRetryAfter waits for a 429's Retry-After instead of the backoff.
	RespectRetryAfter bool
}

// DefaultRetryPolicy answers the policy a client without retry settings uses.
func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		RetryableStatuses: []float64{408, 429, 500, 502, 503, 504}, //nolint:mnd // the documented default list
		MaxAttempts:       3,                                       //nolint:mnd // documented default
		InitialDelay:      1_000,                                   //nolint:mnd // documented default
		MaxDelay:          30_000,                                  //nolint:mnd // documented default
		Factor:            2,                                       //nolint:mnd // documented default
		Jitter:            true,
		RespectRetryAfter: true,
	}
}

// RetryConfig holds the retry fields a client or a request sets; a nil field
// is not set and takes the value of the level below it.
type RetryConfig struct {
	MaxAttempts       *float64
	InitialDelay      *float64
	MaxDelay          *float64
	Factor            *float64
	Jitter            *bool
	RetryableStatuses *[]float64
	RespectRetryAfter *bool
}

// RetrySetting is the retry setting of a client or a request: absent (the zero
// value), off (`retry: false`), or a config.
type RetrySetting struct {
	Config RetryConfig
	Off    bool
}

// RetryPlan is what one request gets: its attempts and, unless retries are
// off, the policy that decides after each failed attempt.
type RetryPlan struct {
	// Policy is nil when retries are off.
	Policy *RetryPolicy
	// MaxAttempts bounds the attempt loop: attempts 0, 1, ... run while the
	// attempt number is below it, so zero, a negative number or NaN runs none.
	MaxAttempts float64
}

// RetryOutcome is how one attempt failed.
type RetryOutcome struct {
	// RetryAfterMs is the response's Retry-After in milliseconds, nil when it
	// has none.
	RetryAfterMs *float64
	// Status is the response status, 0 when no response arrived (a network
	// failure; timeouts and aborts are never retried and never get here).
	Status int
}

// RetryDecision answers whether to send the request again and how long to wait
// first.
type RetryDecision struct {
	// DelayMs is the wait in milliseconds; zero when Retry is false.
	DelayMs float64
	Retry   bool
}

// ResolveRetryPlan merges a client's and a request's settings over the
// default policy, field by field, the request's winning. Either set to off
// turns retries off, and a stream body, which the first attempt consumes,
// gets one attempt.
func ResolveRetryPlan(client, request RetrySetting, streamBody bool) RetryPlan {
	if client.Off || request.Off {
		return RetryPlan{Policy: nil, MaxAttempts: 1}
	}

	policy := DefaultRetryPolicy()
	client.Config.applyTo(&policy)
	request.Config.applyTo(&policy)

	maxAttempts := policy.MaxAttempts
	if streamBody {
		maxAttempts = 1
	}

	return RetryPlan{Policy: &policy, MaxAttempts: maxAttempts}
}

func (c RetryConfig) applyTo(policy *RetryPolicy) {
	setIfPresent(&policy.MaxAttempts, c.MaxAttempts)
	setIfPresent(&policy.InitialDelay, c.InitialDelay)
	setIfPresent(&policy.MaxDelay, c.MaxDelay)
	setIfPresent(&policy.Factor, c.Factor)
	setIfPresent(&policy.Jitter, c.Jitter)
	setIfPresent(&policy.RespectRetryAfter, c.RespectRetryAfter)

	if c.RetryableStatuses != nil {
		policy.RetryableStatuses = append([]float64(nil), (*c.RetryableStatuses)...)
	}
}

func setIfPresent[T any](target *T, value *T) {
	if value != nil {
		*target = *value
	}
}

// Next decides after the failed attempt number attempt (0 for the first).
// random is a number in [0, 1) that the jitter uses.
//
// A network failure is retried while attempts remain, after the backoff. A
// response is retried when its status is in RetryableStatuses and attempts
// remain; a 429 with a Retry-After waits that long when RespectRetryAfter is
// set, every other retry waits the backoff.
func (p RetryPlan) Next(attempt int, outcome RetryOutcome, random float64) RetryDecision {
	attemptsRemain := float64(attempt) < p.MaxAttempts-1
	if !attemptsRemain || p.Policy == nil {
		return RetryDecision{DelayMs: 0, Retry: false}
	}

	if outcome.Status != statusNoResponse && !containsStatus(p.Policy.RetryableStatuses, outcome.Status) {
		return RetryDecision{DelayMs: 0, Retry: false}
	}

	if outcome.Status == statusTooManyRequests && p.Policy.RespectRetryAfter && outcome.RetryAfterMs != nil {
		return RetryDecision{DelayMs: *outcome.RetryAfterMs, Retry: true}
	}

	return RetryDecision{DelayMs: p.Policy.Backoff(attempt, random), Retry: true}
}

func containsStatus(statuses []float64, status int) bool {
	for _, s := range statuses {
		if s == float64(status) {
			return true
		}
	}

	return false
}

// Backoff is the wait after the failed attempt number attempt: InitialDelay
// times Factor to the power of attempt, capped at MaxDelay, scaled by
// 0.5 + random * 0.5 when Jitter is set, and rounded half up to whole
// milliseconds.
func (p RetryPolicy) Backoff(attempt int, random float64) float64 {
	delay := p.InitialDelay * math.Pow(p.Factor, float64(attempt))
	delay = math.Min(delay, p.MaxDelay)

	if p.Jitter {
		delay *= 0.5 + random*0.5 //nolint:mnd // between one half and one
	}

	return roundHalfUp(delay)
}

// roundHalfUp rounds as JavaScript's Math.round: to the nearest integer, a
// half toward positive infinity, keeping NaN, the infinities and the sign of
// a zero.
func roundHalfUp(x float64) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return x
	}

	rounded := math.Floor(x)
	if x-rounded >= 0.5 { //nolint:mnd // the half
		rounded++
	}

	if rounded == 0 && math.Signbit(x) {
		return math.Copysign(0, -1)
	}

	return rounded
}
