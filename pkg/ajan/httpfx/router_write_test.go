// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

// lockedBuffer is a log destination that a server goroutine writes while the
// test reads it.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.Write(p) //nolint:wrapcheck // bytes.Buffer.Write never fails
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

// newLoggedRouter returns a router that logs at level into logs.
func newLoggedRouter(logs io.Writer, level string) *httpfx.Router {
	return httpfx.NewRouter(logfx.NewLogger(
		logfx.WithWriter(logs),
		logfx.WithConfig(&logfx.Config{Level: level}), //nolint:exhaustruct
	))
}

// strictBodyWriter answers Write the way quic-go's HTTP/3 writer does: once
// the status forbids a body (204, 304), every Write fails with
// http.ErrBodyNotAllowed, even one of zero bytes. net/http's own writer lets
// a zero-byte Write through, so httptest.ResponseRecorder cannot show the
// failure.
type strictBodyWriter struct {
	header http.Header
	status int
	writes int
	body   bytes.Buffer

	// failWith, when set, is the error of every Write.
	failWith error
}

func newStrictBodyWriter() *strictBodyWriter {
	return &strictBodyWriter{header: http.Header{}} //nolint:exhaustruct
}

func (w *strictBodyWriter) Header() http.Header {
	return w.header
}

func (w *strictBodyWriter) WriteHeader(status int) {
	w.status = status
}

func (w *strictBodyWriter) Write(p []byte) (int, error) {
	w.writes++

	if w.failWith != nil {
		return 0, w.failWith
	}

	if w.status == http.StatusNoContent || w.status == http.StatusNotModified {
		return 0, http.ErrBodyNotAllowed
	}

	return w.body.Write(p) //nolint:wrapcheck // bytes.Buffer.Write never fails
}

// A result without a body gets its status and headers but no Write call, so
// a 204 never reaches the writer's ErrBodyNotAllowed and nothing is logged.
func TestRouter_BodylessResults(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		result       func(ctx *httpfx.Context) httpfx.Result
		wantStatus   int
		wantWrites   int
		wantBody     string
		wantLocation string
	}{
		{
			name:       "204 from Ok",
			result:     func(ctx *httpfx.Context) httpfx.Result { return ctx.Results.Ok() },
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "202 from Accepted",
			result:     func(ctx *httpfx.Context) httpfx.Result { return ctx.Results.Accepted() },
			wantStatus: http.StatusAccepted,
		},
		{
			name:         "307 from Redirect",
			result:       func(ctx *httpfx.Context) httpfx.Result { return ctx.Results.Redirect("/next") },
			wantStatus:   http.StatusTemporaryRedirect,
			wantLocation: "/next",
		},
		{
			name: "401 without a message",
			result: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Unauthorized()
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "200 with a body is written",
			result:     func(ctx *httpfx.Context) httpfx.Result { return ctx.Results.PlainText([]byte("hello")) },
			wantStatus: http.StatusOK,
			wantWrites: 1,
			wantBody:   "hello",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs lockedBuffer

			router := newLoggedRouter(&logs, "DEBUG")
			router.Route("GET /result", tt.result)

			writer := newStrictBodyWriter()
			router.GetMux().ServeHTTP(writer, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/result", nil))

			assert.Equal(t, tt.wantStatus, writer.status)
			assert.Equal(t, tt.wantWrites, writer.writes)
			assert.Equal(t, tt.wantBody, writer.body.String())
			assert.Equal(t, tt.wantLocation, writer.header.Get("Location"))
			assert.Empty(t, logs.String(), "nothing is logged")
		})
	}
}

// A rejection on a raw route is written by the same code, so its 204 (the
// CORS preflight answer, for example) is not written as a body either.
func TestRouter_RouteRaw_BodylessRejection(t *testing.T) {
	t.Parallel()

	var logs lockedBuffer

	router := newLoggedRouter(&logs, "DEBUG")
	router.Use(func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.Ok() // answers without calling Next
	})

	rawCalls := 0

	router.RouteRaw("/attach/{sid}", func(http.ResponseWriter, *http.Request) {
		rawCalls++
	})

	writer := newStrictBodyWriter()
	router.GetMux().ServeHTTP(writer, httptest.NewRequestWithContext(t.Context(), http.MethodConnect, "/attach/s1", nil))

	assert.Equal(t, http.StatusNoContent, writer.status)
	assert.Equal(t, 0, writer.writes)
	assert.Equal(t, 0, rawCalls)
	assert.Empty(t, logs.String(), "nothing is logged")
}

// A body that cannot be written is logged once through the router's logger,
// with the trace id of the request. When the client has left, nobody can read
// the body, so the entry is a debug one.
func TestRouter_BodyWriteError(t *testing.T) {
	t.Parallel()

	traceID := trace.TraceID{0x0a, 0xf7, 0x65, 0x19, 0x16, 0xcd, 0x43, 0xdd, 0x84, 0x48, 0xeb, 0x21, 0x1c, 0x80, 0x31, 0x9c}
	spanID := trace.SpanID{0xb7, 0xad, 0x6b, 0x71, 0x69, 0x20, 0x33, 0x1a}

	tests := []struct {
		name       string
		level      string
		clientLeft bool
		wantLogged string
	}{
		{
			name:       "client still connected",
			level:      "INFO",
			wantLogged: "httpfx router: response body not delivered",
		},
		{
			name:       "client left, at info level",
			level:      "INFO",
			clientLeft: true,
		},
		{
			name:       "client left, at debug level",
			level:      "DEBUG",
			clientLeft: true,
			wantLogged: "httpfx router: response body not delivered, the client left",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs lockedBuffer

			router := newLoggedRouter(&logs, tt.level)
			router.Route("GET /report", func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.PlainText([]byte("report body"))
			})

			reqCtx, cancel := context.WithCancel(trace.ContextWithSpanContext(
				t.Context(),
				trace.NewSpanContext(trace.SpanContextConfig{
					TraceID:    traceID,
					SpanID:     spanID,
					TraceFlags: trace.FlagsSampled,
				}),
			))
			defer cancel()

			if tt.clientLeft {
				cancel()
			}

			writer := newStrictBodyWriter()
			writer.failWith = io.ErrClosedPipe

			router.GetMux().ServeHTTP(writer, httptest.NewRequestWithContext(reqCtx, http.MethodGet, "/report", nil))

			require.Equal(t, 1, writer.writes)

			logged := logs.String()
			if tt.wantLogged == "" {
				assert.Empty(t, logged)

				return
			}

			assert.Equal(t, 1, strings.Count(logged, "response body not delivered"), "logged once: %s", logged)
			assert.Contains(t, logged, tt.wantLogged)
			assert.Contains(t, logged, "GET /report")
			assert.Contains(t, logged, io.ErrClosedPipe.Error())
			assert.Contains(t, logged, traceID.String())
		})
	}
}
