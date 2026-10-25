package aifx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
)

const (
	// providerMaxResponseBytes caps one non-streaming provider response. A
	// reply is one message plus counters; inline images in a Gemini reply are
	// the largest part, and 64 MiB leaves room for several.
	providerMaxResponseBytes = 64 << 20

	// providerMaxErrorBodyBytes caps the error body kept for an error message.
	providerMaxErrorBodyBytes = 1 << 20

	// providerMaxRetryAfter is the longest Retry-After a provider can ask for
	// and have honoured; a longer one falls back to the backoff.
	providerMaxRetryAfter = time.Minute

	providerInitialBackoff = 500 * time.Millisecond
	providerMaxBackoff     = 8 * time.Second

	mediaTypeJSON = "application/json"
)

var (
	// ErrProviderResponseDecode reports a provider response that is not the
	// JSON the API documents.
	ErrProviderResponseDecode = errors.New("decode provider response")

	// ErrStreamErrorEvent reports an error the provider sent inside a stream
	// that had started.
	ErrStreamErrorEvent = errors.New("received error while streaming")
)

// providerRetryPolicy says which failed attempts are sent again.
type providerRetryPolicy struct {
	// maxRetries is how many times one request is sent again after the first
	// attempt; zero sends every request once.
	maxRetries int

	// retryAttemptTimeout retries an attempt that ran out of its own timeout.
	// The caller's context ending is never retried.
	retryAttemptTimeout bool
}

// providerTransport sends the requests of one provider: it joins paths to the
// base URL, sets the static headers and the credential, applies the per-attempt
// timeout, retries what the policy allows and turns an HTTP error status into
// a providerStatusError.
type providerTransport struct {
	client  *http.Client
	headers http.Header
	// authorize sets a credential that is not static, such as a Google access
	// token. It may be nil.
	authorize func(ctx context.Context, req *http.Request) error
	// newStatusError builds the error for a reply with a status of 400 or
	// more, from the body read up to providerMaxErrorBodyBytes.
	newStatusError func(req *http.Request, resp *http.Response, body []byte) error
	baseURL        string
	// defaultAccept is the Accept header of a request that names none; the
	// genai SDK sent none at all.
	defaultAccept string
	timeout       time.Duration
	retry         providerRetryPolicy
}

// providerRequest is one request before it is sent.
type providerRequest struct {
	query       url.Values
	method      string
	path        string
	contentType string
	accept      string
	body        []byte
}

// endpoint joins a relative path to the base URL the way the vendor SDKs did:
// the base is treated as a directory, so a base of https://proxy/v1 and a path
// of chat/completions reach https://proxy/v1/chat/completions.
func (t *providerTransport) endpoint(path string, query url.Values) (string, error) {
	base, err := url.Parse(t.baseURL)
	if err != nil {
		return "", fmt.Errorf("parse base URL %q: %w", t.baseURL, err)
	}

	if !strings.HasSuffix(base.Path, "/") {
		base.Path += "/"
	}

	target, err := base.Parse(strings.TrimLeft(path, "/"))
	if err != nil {
		return "", fmt.Errorf("join %q to base URL %q: %w", path, t.baseURL, err)
	}

	if len(query) > 0 {
		target.RawQuery = query.Encode()
	}

	return target.String(), nil
}

// send performs the request, retrying what the policy allows. A reply with a
// status below 400 is returned with its body open; closing the body releases
// the attempt's timeout. Every other outcome is an error: the caller's context
// error, the last attempt's timeout or transport error, or the status error.
func (t *providerTransport) send(ctx context.Context, request *providerRequest) (*http.Response, error) {
	target, err := t.endpoint(request.path, request.query)
	if err != nil {
		return nil, err
	}

	for attempt := 0; ; attempt++ {
		resp, cancel, err := t.attempt(ctx, request, target)

		if callerErr := ctx.Err(); callerErr != nil {
			closeResponse(resp)
			cancel()

			return nil, callerErr
		}

		retry := attempt < t.retry.maxRetries && t.shouldRetry(resp, err)
		if retry {
			delay := retryDelay(resp, attempt)

			closeResponse(resp)
			cancel()

			if !sleepContext(ctx, delay) {
				return nil, ctx.Err()
			}

			continue
		}

		if err != nil {
			cancel()

			return nil, err
		}

		if resp.StatusCode >= http.StatusBadRequest {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, providerMaxErrorBodyBytes))

			closeResponse(resp)
			cancel()

			return nil, t.newStatusError(resp.Request, resp, body)
		}

		resp.Body = &cancelOnClose{ReadCloser: resp.Body, cancel: cancel}

		return resp, nil
	}
}

// attempt sends the request once. The returned cancel function releases the
// attempt's timeout and is never nil.
func (t *providerTransport) attempt(
	ctx context.Context,
	request *providerRequest,
	target string,
) (*http.Response, context.CancelFunc, error) {
	attemptCtx, cancel := ctx, context.CancelFunc(func() {})

	if t.timeout > 0 {
		if deadline, ok := ctx.Deadline(); !ok || time.Now().Add(t.timeout).Before(deadline) {
			attemptCtx, cancel = context.WithTimeout(ctx, t.timeout)
		}
	}

	var body io.Reader
	if request.body != nil {
		body = bytes.NewReader(request.body)
	}

	req, err := http.NewRequestWithContext(attemptCtx, request.method, target, body)
	if err != nil {
		cancel()

		return nil, func() {}, fmt.Errorf("build %s request: %w", request.method, err)
	}

	for name, values := range t.headers {
		req.Header[name] = values
	}

	if request.contentType != "" {
		req.Header.Set("Content-Type", request.contentType)
	}

	accept := request.accept
	if accept == "" {
		accept = t.defaultAccept
	}

	if accept != "" {
		req.Header.Set("Accept", accept)
	}

	if t.authorize != nil {
		err = t.authorize(attemptCtx, req)
		if err != nil {
			cancel()

			return nil, func() {}, err
		}
	}

	resp, err := t.client.Do(req) //nolint:gosec // G704: the URL is the configured provider endpoint
	if attemptErr := attemptCtx.Err(); attemptErr != nil && ctx.Err() == nil {
		// Only this attempt's timeout expired. It is reported as the context
		// error, like a connection error, so the policy decides on a retry.
		closeResponse(resp)

		return nil, cancel, attemptErr
	}

	if err != nil {
		return nil, cancel, err //nolint:wrapcheck // the url.Error already names the method and URL
	}

	return resp, cancel, nil
}

// shouldRetry reports whether a failed attempt is worth sending again: no
// reply at all (a connection error or the attempt's timeout), or a status the
// provider marks as transient. The x-should-retry header overrides the status.
func (t *providerTransport) shouldRetry(resp *http.Response, err error) bool {
	if resp == nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return t.retry.retryAttemptTimeout
		}

		return err != nil
	}

	switch resp.Header.Get("x-should-retry") {
	case "true":
		return true
	case "false":
		return false
	}

	return resp.StatusCode == http.StatusRequestTimeout ||
		resp.StatusCode == http.StatusConflict ||
		resp.StatusCode == http.StatusTooManyRequests ||
		resp.StatusCode >= http.StatusInternalServerError
}

// retryDelay is the wait before the next attempt: what the provider asked for
// in Retry-After-Ms or Retry-After when that is under a minute, or else an
// exponential backoff from half a second up to eight, with jitter.
func retryDelay(resp *http.Response, attempt int) time.Duration {
	if delay, ok := parseRetryAfter(resp); ok && delay >= 0 && delay < providerMaxRetryAfter {
		return delay
	}

	delay := min(providerInitialBackoff<<attempt, providerMaxBackoff)

	// Jitter spreads retries from many clients; it needs no CSPRNG.
	jitter := time.Duration(rand.Int64N(int64(delay / 4))) //nolint:gosec,mnd

	return delay - jitter
}

func parseRetryAfter(resp *http.Response) (time.Duration, bool) {
	if resp == nil {
		return 0, false
	}

	if value := resp.Header.Get("Retry-After-Ms"); value != "" {
		if millis, err := strconv.ParseFloat(value, 64); err == nil {
			return time.Duration(millis * float64(time.Millisecond)), true
		}
	}

	value := resp.Header.Get("Retry-After")
	if value == "" {
		return 0, false
	}

	if seconds, err := strconv.ParseFloat(value, 64); err == nil {
		return time.Duration(seconds * float64(time.Second)), true
	}

	if at, err := time.Parse(time.RFC1123, value); err == nil {
		return time.Until(at), true
	}

	return 0, false
}

// doJSON sends a request with an optional JSON body and decodes the JSON reply
// into out, reading at most providerMaxResponseBytes.
func (t *providerTransport) doJSON(
	ctx context.Context,
	method, path string,
	query url.Values,
	in any,
	out any,
) error {
	request := &providerRequest{
		query: query, method: method, path: path, contentType: "", accept: "", body: nil,
	}

	if in != nil {
		body, err := json.Marshal(in)
		if err != nil {
			return fmt.Errorf("encode %s %s request: %w", method, path, err)
		}

		request.body = body
		request.contentType = mediaTypeJSON
	}

	resp, err := t.send(ctx, request)
	if err != nil {
		return err
	}

	defer closeResponse(resp)

	return decodeJSONResponse(resp, method, path, out)
}

// decodeJSONResponse reads a whole reply, up to providerMaxResponseBytes, and
// decodes it into out.
func decodeJSONResponse(resp *http.Response, method, path string, out any) error {
	raw, err := lib.ReadAllLimited(resp.Body, providerMaxResponseBytes)
	if err != nil {
		return fmt.Errorf("read %s %s response (limit %d bytes): %w", method, path, providerMaxResponseBytes, err)
	}

	err = json.Unmarshal(raw, out)
	if err != nil {
		return fmt.Errorf("%w: %s %s: %w", ErrProviderResponseDecode, method, path, err)
	}

	return nil
}

// closeResponse drains a little of the body, so the connection can be reused,
// and closes it.
func closeResponse(resp *http.Response) {
	if resp == nil || resp.Body == nil {
		return
	}

	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10)) //nolint:mnd
	_ = resp.Body.Close()
}

// cancelOnClose releases an attempt's timeout once the body it covers is
// closed. The timeout keeps running while the body is read, so it bounds a
// streamed reply as a whole, as the vendor SDKs did.
type cancelOnClose struct {
	io.ReadCloser

	cancel context.CancelFunc
}

func (c *cancelOnClose) Close() error {
	err := c.ReadCloser.Close()
	c.cancel()

	return err //nolint:wrapcheck // the body's own close error
}

// providerStatusError is a reply with a status of 400 or more from the
// Anthropic or OpenAI API. Its message has the shape the vendor SDKs used:
// method, URL, status, request id and the provider's error JSON.
type providerStatusError struct {
	method     string
	url        string
	status     string
	requestID  string
	body       string
	StatusCode int
}

func (e *providerStatusError) Error() string {
	var builder strings.Builder

	fmt.Fprintf(&builder, "%s %q: %s", e.method, e.url, e.status)

	if e.requestID != "" {
		fmt.Fprintf(&builder, " (Request-ID: %s)", e.requestID)
	}

	if e.body != "" {
		builder.WriteString(" ")
		builder.WriteString(e.body)
	}

	return builder.String()
}

// newProviderStatusError builds a providerStatusError from the part of the
// body the message carries. The URL is redacted, so a password in a proxy URL
// does not reach the message.
func newProviderStatusError(
	req *http.Request,
	resp *http.Response,
	body string,
	requestIDHeader string,
) *providerStatusError {
	method, target := "", ""

	if req != nil {
		method = req.Method
		target = req.URL.Redacted()
	}

	requestID := ""
	if requestIDHeader != "" {
		requestID = resp.Header.Get(requestIDHeader)
	}

	return &providerStatusError{
		method:     method,
		url:        target,
		status:     resp.Status,
		requestID:  requestID,
		body:       strings.TrimSpace(body),
		StatusCode: resp.StatusCode,
	}
}

// classifyProviderError wraps err with the provider sentinel, and with the
// classification sentinel and status when it is an HTTP status error.
func classifyProviderError(providerSentinel error, err error) error {
	ctxErr := classifyContextError(providerSentinel, err)
	if ctxErr != nil {
		return ctxErr
	}

	if statusErr, ok := errors.AsType[*providerStatusError](err); ok {
		return classifyAndWrap(providerSentinel, statusErr.StatusCode, err)
	}

	if streamErr, ok := errors.AsType[*providerStreamError](err); ok {
		return classifyAndWrap(providerSentinel, streamErr.StatusCode, err)
	}

	if googleErr, ok := errors.AsType[*googleAPIError](err); ok {
		return classifyAndWrap(providerSentinel, googleErr.Code, err)
	}

	return fmt.Errorf("%w: %w", providerSentinel, err)
}

// providerStreamError is an error event inside a stream that answered 200.
// StatusCode is that 200, which is what the Anthropic SDK reported, so a
// mid-stream failure carries a status but no classification.
type providerStreamError struct {
	method     string
	url        string
	status     string
	body       string
	StatusCode int
}

func (e *providerStreamError) Error() string {
	return fmt.Sprintf("%s %q: %s %s", e.method, e.url, e.status, e.body)
}

// sleepContext waits for delay and reports whether it ran to the end rather
// than stopping because ctx ended.
func sleepContext(ctx context.Context, delay time.Duration) bool {
	if delay <= 0 {
		return ctx.Err() == nil
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}
