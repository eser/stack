// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import "testing"

func TestBridgeHttpRetryResolve(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		request string
		want    string
	}{
		{
			name:    "no settings resolve the default policy",
			request: `{}`,
			want:    `{"plan":{"policy":{"retryableStatuses":[408,429,500,502,503,504],"maxAttempts":3,"initialDelay":1000,"maxDelay":30000,"factor":2,"jitter":true,"respectRetryAfter":true},"maxAttempts":3}}`,
		},
		{
			name:    "the request wins field by field and non-finite numbers pass",
			request: `{"client":{"maxAttempts":5,"factor":3},"request":{"factor":1.5,"maxDelay":"Infinity","retryableStatuses":[418]}}`,
			want:    `{"plan":{"policy":{"retryableStatuses":[418],"maxAttempts":5,"initialDelay":1000,"maxDelay":"Infinity","factor":1.5,"jitter":true,"respectRetryAfter":true},"maxAttempts":5}}`,
		},
		{
			name:    "false on either level turns retries off",
			request: `{"client":{"maxAttempts":5},"request":false}`,
			want:    `{"plan":{"policy":null,"maxAttempts":1}}`,
		},
		{
			name:    "a stream body gets one attempt",
			request: `{"streamBody":true}`,
			want:    `{"plan":{"policy":{"retryableStatuses":[408,429,500,502,503,504],"maxAttempts":3,"initialDelay":1000,"maxDelay":30000,"factor":2,"jitter":true,"respectRetryAfter":true},"maxAttempts":1}}`,
		},
		{
			name:    "a setting that is neither false nor an object is refused",
			request: `{"client":true}`,
			want:    `{"error":"invalid request JSON: read retry setting true: retry must be false or an object"}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := bridgeHttpRetryResolve(tc.request); got != tc.want {
				t.Errorf("got  %s\nwant %s", got, tc.want)
			}
		})
	}
}

func TestBridgeHttpRetryNext(t *testing.T) {
	t.Parallel()

	const plan = `"plan":{"policy":{"retryableStatuses":[429,503],"maxAttempts":3,"initialDelay":100,"maxDelay":"Infinity","factor":2,"jitter":false,"respectRetryAfter":true},"maxAttempts":3}`

	cases := []struct {
		name    string
		request string
		want    string
	}{
		{
			name:    "a retryable status backs off",
			request: `{` + plan + `,"attempt":1,"status":503}`,
			want:    `{"delayMs":200,"retry":true}`,
		},
		{
			name:    "a 429 waits for its Retry-After",
			request: `{` + plan + `,"attempt":0,"status":429,"retryAfterMs":"Infinity"}`,
			want:    `{"delayMs":"Infinity","retry":true}`,
		},
		{
			name:    "a network failure backs off",
			request: `{` + plan + `,"attempt":0,"status":0}`,
			want:    `{"delayMs":100,"retry":true}`,
		},
		{
			name:    "the last attempt is not retried",
			request: `{` + plan + `,"attempt":2,"status":503}`,
			want:    `{"delayMs":0,"retry":false}`,
		},
		{
			name:    "a status outside the list is not retried",
			request: `{` + plan + `,"attempt":0,"status":500}`,
			want:    `{"delayMs":0,"retry":false}`,
		},
		{
			name:    "a plan without a policy never retries",
			request: `{"plan":{"policy":null,"maxAttempts":1},"attempt":0,"status":0}`,
			want:    `{"delayMs":0,"retry":false}`,
		},
		{
			name:    "a request that is not JSON is refused",
			request: `{`,
			want:    `{"error":"invalid request JSON: unexpected end of JSON input","delayMs":0,"retry":false}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := bridgeHttpRetryNext(tc.request); got != tc.want {
				t.Errorf("got  %s\nwant %s", got, tc.want)
			}
		})
	}
}
