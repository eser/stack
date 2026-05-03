// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky

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

const baseURL = "https://bsky.social/xrpc"
const maxRetries = 3

// client is a thin HTTP client for the AT Protocol XRPC API.
type client struct {
	http      *http.Client
	accessJwt string // may be overridden per-request
}

func newClient(accessJwt string) *client {
	return &client{
		http:      &http.Client{Timeout: 30 * time.Second},
		accessJwt: accessJwt,
	}
}

// query performs a GET request to an XRPC procedure (query) and JSON-decodes the response.
func (c *client) query(ctx context.Context, nsid string, params map[string]string, dst any) error {
	url := baseURL + "/" + nsid
	if len(params) > 0 {
		sb := strings.Builder{}
		sb.WriteString(url)
		sb.WriteByte('?')
		first := true

		for k, v := range params {
			if !first {
				sb.WriteByte('&')
			}

			sb.WriteString(k)
			sb.WriteByte('=')
			sb.WriteString(v)
			first = false
		}

		url = sb.String()
	}

	return c.doRequest(ctx, http.MethodGet, url, nil, c.accessJwt, dst)
}

// procedure performs a POST request to an XRPC procedure (mutation).
// tokenOverride optionally replaces the stored accessJwt for this single call.
func (c *client) procedure(ctx context.Context, nsid string, body any, tokenOverride string, dst any) error {
	token := c.accessJwt
	if tokenOverride != "" {
		token = tokenOverride
	}

	return c.doRequest(ctx, http.MethodPost, baseURL+"/"+nsid, body, token, dst)
}

// doRequest executes an HTTP request with retry on 429.
func (c *client) doRequest(ctx context.Context, method, url string, body any, token string, dst any) error {
	var bodyBytes []byte
	var err error

	if body != nil {
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshalling request: %w", err)
		}
	}

	for attempt := range maxRetries {
		var reqBody io.Reader
		if bodyBytes != nil {
			reqBody = bytes.NewReader(bodyBytes)
		}

		req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
		if err != nil {
			return err
		}

		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}

		if bodyBytes != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		respErr := c.roundTrip(req, dst)
		if respErr != nil {
			if isRateLimitError(respErr) && attempt < maxRetries-1 {
				wait := retryAfterDuration(respErr)
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(wait):
					continue
				}
			}

			return respErr
		}

		return nil
	}

	return fmt.Errorf("exceeded %d retries", maxRetries)
}

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
		return fmt.Errorf("XRPC %s: HTTP %d: %s", req.URL.Path, resp.StatusCode, strings.TrimSpace(string(data)))
	}

	if dst != nil && len(data) > 0 {
		if err := json.Unmarshal(data, dst); err != nil {
			return fmt.Errorf("decoding XRPC response: %w", err)
		}
	}

	return nil
}

type rateLimitError struct {
	retryAfter string
}

func (e *rateLimitError) Error() string {
	return "Bluesky rate limit (Retry-After: " + e.retryAfter + ")"
}

func isRateLimitError(err error) bool {
	_, ok := err.(*rateLimitError) //nolint:errorlint
	return ok
}

func retryAfterDuration(err error) time.Duration {
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
