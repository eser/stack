// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

var errDiskFull = errors.New("disk full")

// logEntries decodes the JSON lines a router logged.
func logEntries(t *testing.T, logs string) []map[string]any {
	t.Helper()

	entries := make([]map[string]any, 0)

	for line := range strings.Lines(logs) {
		var entry map[string]any

		require.NoError(t, json.Unmarshal([]byte(line), &entry), "log line %q", line)

		entries = append(entries, entry)
	}

	return entries
}

// loggedError returns the message of the error attribute of entry. logfx
// writes an error as an object that carries its message in msg.
func loggedError(entry map[string]any) any {
	attr, isObject := entry["error"].(map[string]any)
	if !isObject {
		return entry["error"]
	}

	return attr["msg"]
}

// The error a result carries is logged once, by the router, through its
// logger and with the trace id of the request. A 5xx is an error and any
// other status a warning. The client gets the generic message.
func TestRouter_LogsResultErrors(t *testing.T) {
	t.Parallel()

	traceID := trace.TraceID{0x4b, 0xf9, 0x2f, 0x35, 0x77, 0xb3, 0x4d, 0xa6, 0xa3, 0xce, 0x92, 0x9d, 0x0e, 0x0e, 0x47, 0x36}
	spanID := trace.SpanID{0x00, 0xf0, 0x67, 0xaa, 0x0b, 0xa9, 0x02, 0xb7}

	tests := []struct {
		name       string
		result     func(ctx *httpfx.Context) httpfx.Result
		wantStatus int
		wantLevel  string
		wantError  string
		wantBody   string
	}{
		{
			name: "500 from WithSanitizedError",
			result: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Error(http.StatusInternalServerError,
					httpfx.WithSanitizedError(fmt.Errorf("save registry: %w", errDiskFull)))
			},
			wantStatus: http.StatusInternalServerError,
			wantLevel:  "ERROR",
			wantError:  "save registry: disk full",
			wantBody:   `{"error":"an error occurred"}`,
		},
		{
			name: "404 from WithSanitizedError",
			result: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Error(http.StatusNotFound,
					httpfx.WithSanitizedError(fmt.Errorf("project %q not found", "p1"))) //nolint:err113
			},
			wantStatus: http.StatusNotFound,
			wantLevel:  "WARN",
			wantError:  `project "p1" not found`,
			wantBody:   `{"error":"an error occurred"}`,
		},
		{
			name: "JSON body that cannot be encoded",
			result: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.JSON(func() {})
			},
			wantStatus: http.StatusInternalServerError,
			wantLevel:  "ERROR",
			wantError:  "encode func() response as JSON: json: unsupported type: func()",
			wantBody:   "Failed to encode JSON",
		},
		{
			name: "WithJSON body that cannot be encoded",
			result: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Ok(httpfx.WithJSON(make(chan int)))
			},
			wantStatus: http.StatusInternalServerError,
			wantLevel:  "ERROR",
			wantError:  "encode chan int response as JSON: json: unsupported type: chan int",
			wantBody:   "Failed to encode JSON",
		},
		{
			name: "result without an error",
			result: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Error(http.StatusBadRequest, httpfx.WithErrorMessage("name is required"))
			},
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"name is required"}`,
		},
		{
			name:       "Abort",
			result:     func(ctx *httpfx.Context) httpfx.Result { return ctx.Results.Abort() },
			wantStatus: http.StatusNotImplemented,
			wantBody:   "Not Implemented",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs lockedBuffer

			router := newLoggedRouter(&logs, "DEBUG")
			router.Route("GET /result", tt.result)

			reqCtx := trace.ContextWithSpanContext(t.Context(), trace.NewSpanContext(trace.SpanContextConfig{
				TraceID:    traceID,
				SpanID:     spanID,
				TraceFlags: trace.FlagsSampled,
			}))

			recorder := httptest.NewRecorder()
			router.GetMux().ServeHTTP(recorder, httptest.NewRequestWithContext(reqCtx, http.MethodGet, "/result", nil))

			assert.Equal(t, tt.wantStatus, recorder.Code)
			assert.Equal(t, tt.wantBody, recorder.Body.String())

			entries := logEntries(t, logs.String())
			if tt.wantError == "" {
				assert.Empty(t, entries, "nothing is logged")

				return
			}

			require.Len(t, entries, 1, "logged once: %s", logs.String())

			entry := entries[0]
			assert.Equal(t, tt.wantLevel, entry["level"])
			assert.Equal(t, "httpfx router: request error", entry["msg"])
			assert.Equal(t, traceID.String(), entry["trace_id"])
			assert.Equal(t, "GET /result", entry["pattern"])
			assert.InDelta(t, tt.wantStatus, entry["status"], 0)
			assert.Equal(t, tt.wantError, loggedError(entry))
			assert.NotContains(t, recorder.Body.String(), tt.wantError, "the error stays on the server")
		})
	}
}

// A raw handler that panics gets its response aborted, and the recovered
// panic a middleware put on its result is still logged first, once.
func TestRouter_RouteRaw_LogsTheRecoveredPanic(t *testing.T) {
	t.Parallel()

	var logs lockedBuffer

	router := newLoggedRouter(&logs, "INFO")
	router.Use(func(ctx *httpfx.Context) (result httpfx.Result) {
		defer func() {
			if recovered := recover(); recovered != nil {
				result = ctx.Results.Error(http.StatusInternalServerError,
					httpfx.WithSanitizedError(fmt.Errorf("raw handler panicked: %v", recovered))) //nolint:err113
			}
		}()

		return ctx.Next()
	})
	router.RouteRaw("/attach/{sid}", func(http.ResponseWriter, *http.Request) {
		panic("stream closed")
	})

	req := httptest.NewRequestWithContext(t.Context(), http.MethodConnect, "/attach/s1", nil)
	recorder := httptest.NewRecorder()

	assert.PanicsWithValue(t, http.ErrAbortHandler, func() {
		router.GetMux().ServeHTTP(recorder, req)
	})

	entries := logEntries(t, logs.String())
	require.Len(t, entries, 1, "logged once: %s", logs.String())
	assert.Equal(t, "ERROR", entries[0]["level"])
	assert.Equal(t, "/attach/{sid}", entries[0]["pattern"])
	assert.Equal(t, "raw handler panicked: stream closed", loggedError(entries[0]))
}
