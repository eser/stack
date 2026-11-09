// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package resilience_test

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpclient/resilience"
)

// retryPolicyCase is one case of testdata/retry_policy_cases.json, written
// from the answers of @eserstack/httpclient's TypeScript HttpClient before its
// retry policy moved here. The TypeScript side runs the same file through the
// bridge (httpclient/bridge.test.ts).
type retryPolicyCase struct {
	Client     *json.RawMessage `json:"client"`
	Request    *json.RawMessage `json:"request"`
	Want       retryPolicyWant  `json:"want"`
	Name       string           `json:"name"`
	Steps      []retryStep      `json:"steps"`
	StreamBody bool             `json:"streamBody"`
}

type retryStep struct {
	RetryAfterMs *resilience.JSNumber `json:"retryAfterMs"`
	Status       int                  `json:"status"`
	Random       float64              `json:"random"`
	Network      bool                 `json:"network"`
}

type retryPolicyWant struct {
	Status  *int                  `json:"status"`
	Retries *int                  `json:"retries"`
	Error   string                `json:"error"`
	Delays  []resilience.JSNumber `json:"delays"`
	Fetches int                   `json:"fetches"`
}

func readRetryPolicyCases(t *testing.T) []retryPolicyCase {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("testdata", "retry_policy_cases.json"))
	if err != nil {
		t.Fatalf("read fixtures: %v", err)
	}

	var cases []retryPolicyCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatalf("decode fixtures: %v", err)
	}

	return cases
}

func decodeSetting(t *testing.T, raw *json.RawMessage) resilience.RetrySetting {
	t.Helper()

	var setting resilience.RetrySetting
	if raw == nil {
		return setting
	}

	if err := json.Unmarshal(*raw, &setting); err != nil {
		t.Fatalf("decode retry setting %s: %v", *raw, err)
	}

	return setting
}

// sameNumber compares as JavaScript's Object.is, so NaN equals NaN.
func sameNumber(a, b float64) bool {
	if math.IsNaN(a) || math.IsNaN(b) {
		return math.IsNaN(a) && math.IsNaN(b)
	}

	return a == b && math.Signbit(a) == math.Signbit(b)
}

// TestRetryPolicyFixtures drives the attempt loop of HttpClient over the
// policy: the plan bounds the attempts, a 2xx ends the request, and every
// failed attempt asks Next.
func TestRetryPolicyFixtures(t *testing.T) {
	t.Parallel()

	for _, tc := range readRetryPolicyCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			plan := resilience.ResolveRetryPlan(
				decodeSetting(t, tc.Client),
				decodeSetting(t, tc.Request),
				tc.StreamBody,
			)

			fetches := 0
			retries := 0
			delays := []float64{}

			var final *retryStep

			for attempt := 0; float64(attempt) < plan.MaxAttempts; attempt++ {
				if attempt > 0 {
					retries++
				}

				if attempt >= len(tc.Steps) {
					t.Fatalf("attempt %d has no step", attempt)
				}

				step := tc.Steps[attempt]
				fetches++

				if !step.Network && step.Status >= 200 && step.Status < 300 {
					final = &step

					break
				}

				outcome := resilience.RetryOutcome{RetryAfterMs: nil, Status: step.Status}
				if step.RetryAfterMs != nil {
					ms := float64(*step.RetryAfterMs)
					outcome.RetryAfterMs = &ms
				}

				decision := plan.Next(attempt, outcome, step.Random)
				if !decision.Retry {
					final = &step

					break
				}

				delays = append(delays, decision.DelayMs)
			}

			if fetches != tc.Want.Fetches {
				t.Errorf("fetches: got %d, want %d", fetches, tc.Want.Fetches)
			}

			wantDelays := make([]float64, len(tc.Want.Delays))
			for i, d := range tc.Want.Delays {
				wantDelays[i] = float64(d)
			}

			if !slices.EqualFunc(delays, wantDelays, sameNumber) {
				t.Errorf("delays: got %v, want %v", delays, wantDelays)
			}

			switch {
			case final == nil:
				// No attempt ran, or none ended the loop.
				if tc.Want.Error != "HttpClientError" || fetches != 0 {
					t.Errorf("the loop ended without an answer, want %+v", tc.Want)
				}
			case final.Network:
				if tc.Want.Error != "HttpNetworkError" {
					t.Errorf("ended on a network failure, want %+v", tc.Want)
				}
			case tc.Want.Status == nil || *tc.Want.Status != final.Status:
				t.Errorf("ended on status %d, want %+v", final.Status, tc.Want)
			case tc.Want.Retries != nil && *tc.Want.Retries != retries:
				t.Errorf("retries: got %d, want %d", retries, *tc.Want.Retries)
			}
		})
	}
}

func TestRetrySettingRefusesOtherValues(t *testing.T) {
	t.Parallel()

	for _, input := range []string{`true`, `3`, `"off"`, `[]`, `{"maxDelay":"soon"}`, `{"jitter":1}`} {
		var setting resilience.RetrySetting
		if err := json.Unmarshal([]byte(input), &setting); err == nil {
			t.Errorf("%s: expected an error, got %+v", input, setting)
		}
	}
}

func TestRetryPlanRoundTrips(t *testing.T) {
	t.Parallel()

	maxDelay := math.Inf(1)
	plan := resilience.ResolveRetryPlan(
		resilience.RetrySetting{Config: resilience.RetryConfig{MaxDelay: &maxDelay}, Off: false}, //nolint:exhaustruct
		resilience.RetrySetting{}, //nolint:exhaustruct
		false,
	)

	data, err := json.Marshal(plan)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	want := `{"policy":{"retryableStatuses":[408,429,500,502,503,504],"maxAttempts":3,"initialDelay":1000,"maxDelay":"Infinity","factor":2,"jitter":true,"respectRetryAfter":true},"maxAttempts":3}`
	if string(data) != want {
		t.Fatalf("marshal: got %s, want %s", data, want)
	}

	var back resilience.RetryPlan
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if back.Policy == nil || !math.IsInf(back.Policy.MaxDelay, 1) || back.MaxAttempts != 3 {
		t.Errorf("round trip: got %+v", back)
	}

	off := resilience.ResolveRetryPlan(resilience.RetrySetting{Off: true}, resilience.RetrySetting{}, false) //nolint:exhaustruct

	data, err = json.Marshal(off)
	if err != nil || string(data) != `{"policy":null,"maxAttempts":1}` {
		t.Errorf("off plan: got %s, %v", data, err)
	}
}

func TestBackoffRoundsAsJavaScript(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		initial float64
		want    float64
	}{
		{name: "a half rounds up", initial: 2.5, want: 3},
		{name: "a negative half rounds toward zero", initial: -2.5, want: -2},
		{name: "a small negative rounds to negative zero", initial: -0.25, want: math.Copysign(0, -1)},
		{name: "just below a half rounds down", initial: 0.49999999999999994, want: 0},
		{name: "NaN stays NaN", initial: math.NaN(), want: math.NaN()},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			policy := resilience.RetryPolicy{ //nolint:exhaustruct
				InitialDelay: tc.initial,
				MaxDelay:     math.Inf(1),
				Factor:       1,
			}

			if got := policy.Backoff(0, 0); !sameNumber(got, tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}
