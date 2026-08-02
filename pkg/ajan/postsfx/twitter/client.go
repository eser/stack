// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const baseURL = "https://api.twitter.com/2"
const maxRetries = 3

// client is a thin HTTP client for the Twitter API v2.
type client struct {
	http        *http.Client
	accessToken string
}

func newClient(accessToken string) *client {
	return &client{
		http:        &http.Client{Timeout: 30 * time.Second},
		accessToken: accessToken,
	}
}

// get performs a GET request and JSON-decodes the response into dst.
func (c *client) get(ctx context.Context, path string, dst any) error {
	return c.do(ctx, http.MethodGet, path, nil, dst)
}

// post performs a POST request with a JSON body and JSON-decodes the response.
func (c *client) post(ctx context.Context, path string, body, dst any) error {
	return c.do(ctx, http.MethodPost, path, body, dst)
}

// postForm performs a POST with application/x-www-form-urlencoded body.
// dst may be nil.
func (c *client) postForm(ctx context.Context, path string, fields map[string]string, dst any) error {
	sb := &strings.Builder{}
	first := true

	for k, v := range fields {
		if !first {
			sb.WriteByte('&')
		}

		sb.WriteString(k)
		sb.WriteByte('=')
		sb.WriteString(v)
		first = false
	}

	body := strings.NewReader(sb.String())

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, path, body)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	return c.roundTrip(req, dst)
}

// delete performs a DELETE request (no body, no response body).
func (c *client) delete(ctx context.Context, path string) error {
	return c.do(ctx, http.MethodDelete, path, nil, nil)
}

// do executes a JSON request with retry on 429.
func (c *client) do(ctx context.Context, method, path string, body, dst any) error {
	var bodyBytes []byte
	var err error

	if body != nil {
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshalling request body: %w", err)
		}
	}

	url := baseURL + path

	for attempt := range maxRetries {
		var reqBody io.Reader
		if bodyBytes != nil {
			reqBody = bytes.NewReader(bodyBytes)
		}

		req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
		if err != nil {
			return err
		}

		req.Header.Set("Authorization", "Bearer "+c.accessToken)

		if bodyBytes != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		if err := c.roundTrip(req, dst); err != nil {
			if isRateLimitError(err) && attempt < maxRetries-1 {
				wait := retryAfter(err)
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(wait):
					continue
				}
			}

			return err
		}

		return nil
	}

	return fmt.Errorf("exceeded %d retries", maxRetries)
}

// roundTrip sends req and optionally JSON-decodes the response body into dst.
func (c *client) roundTrip(req *http.Request, dst any) error {
	resp, err := c.http.Do(req) //nolint:gosec // intentional HTTP client; no TLS override
	if err != nil {
		return fmt.Errorf("HTTP %s %s: %w", req.Method, req.URL, err)
	}

	defer func() { _ = resp.Body.Close() }()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading response body: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return &rateLimitError{retryAfter: resp.Header.Get("Retry-After")}
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("twitter API %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}

	if dst != nil && len(data) > 0 {
		if err := json.Unmarshal(data, dst); err != nil {
			return fmt.Errorf("decoding response: %w", err)
		}
	}

	return nil
}

// rateLimitError carries the Retry-After header value.
type rateLimitError struct {
	retryAfter string
}

func (e *rateLimitError) Error() string {
	return "Twitter API rate limit exceeded (Retry-After: " + e.retryAfter + ")"
}

func isRateLimitError(err error) bool {
	_, ok := err.(*rateLimitError) //nolint:errorlint
	return ok
}

func retryAfter(err error) time.Duration {
	rle, ok := err.(*rateLimitError) //nolint:errorlint
	if !ok || rle.retryAfter == "" {
		return 5 * time.Second
	}

	secs, parseErr := strconv.Atoi(rle.retryAfter)
	if parseErr != nil {
		return 5 * time.Second
	}

	return time.Duration(secs) * time.Second
}
