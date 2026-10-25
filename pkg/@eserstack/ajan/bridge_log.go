// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// drainLogHandles, drainCacheHandles and drainPostsHandles clear registries
// that hold no OS resource of their own; dropping the entries is the whole
// release path, matching their per-handle Close functions.
func drainLogHandles() shutdownStep {
	logMu.Lock()
	clear(logHandles)
	logMu.Unlock()

	return shutdownStep{} //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Log bridge state
// ---------------------------------------------------------------------------

type logEntry struct {
	logger    *slog.Logger
	levelVar  *slog.LevelVar
	scopeName string

	// mu guards filters and formatter.
	//
	// FFI calls from worker threads (decision-37) let Configure and Write run
	// on different threads: without this, Configure's writes race
	// Write's reads. levelVar needs no guard of its own -- slog.LevelVar is
	// already goroutine-safe -- and logger/scopeName are never reassigned after
	// creation.
	mu        sync.RWMutex
	filters   logfx.FilterFunc
	formatter logfx.FormatterFunc
}

// snapshot returns the entry's current filter chain and formatter.
//
// Both are read together under one lock so a write cannot observe the filters
// from one Configure call and the formatter from another.
func (e *logEntry) snapshot() (logfx.FilterFunc, logfx.FormatterFunc) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	return e.filters, e.formatter
}

var (
	logHandles = make(map[string]*logEntry)
	logMu      sync.RWMutex

	// logOutput is where every bridge logger writes; tests swap it.
	logOutput io.Writer = os.Stderr //nolint:gochecknoglobals
)

// ---------------------------------------------------------------------------
// Log wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type logCreateRequest struct {
	ScopeName string `json:"scopeName"`
	Level     string `json:"level"`  // TRACE|DEBUG|INFO|WARN|ERROR|FATAL|PANIC
	Format    string `json:"format"` // "json" (default) | "text"
	AddSource bool   `json:"addSource"`
}

type logWriteInput struct {
	Attrs   map[string]any `json:"attrs,omitempty"`
	Handle  string         `json:"handle"`
	Message string         `json:"message"`
	Level   string         `json:"level"`
}

type logShouldLogInput struct {
	Handle string `json:"handle"`
	Level  string `json:"level"`
}

type logShouldLogResponse struct {
	Allowed bool   `json:"allowed"`
	Error   string `json:"error,omitempty"`
}

type logFilterConfig struct {
	Type     string  `json:"type"`     // "level" | "category" | "rateLimit" | "sampling"
	Level    string  `json:"level"`    // for "level"
	Category string  `json:"category"` // for "category"
	Rate     float64 `json:"rate"`     // for "rateLimit" msgs/sec
	Prob     float64 `json:"prob"`     // for "sampling" 0.0-1.0
}

type logConfigureInput struct {
	Filters   []logFilterConfig `json:"filters,omitempty"`
	Handle    string            `json:"handle"`
	Level     string            `json:"level"`
	Formatter string            `json:"formatter"` // "json" | "text" | "span-json" | "span-text"
}

// ---------------------------------------------------------------------------
// Log bridge functions
// ---------------------------------------------------------------------------

// bridgeLogCreate creates a slog.Logger writing JSON to stderr and stores it
// under a generated handle. Returns JSON with the handle.
func bridgeLogCreate(configJSON string) string {
	var req logCreateRequest
	if err := json.Unmarshal([]byte(configJSON), &req); err != nil {
		return errorResponse("invalid config JSON: " + err.Error())
	}

	lv := new(slog.LevelVar)
	lv.Set(parseLogLevel(req.Level))

	opts := &slog.HandlerOptions{ //nolint:exhaustruct
		Level:     lv,
		AddSource: req.AddSource,
	}

	var handler slog.Handler
	if strings.ToLower(req.Format) == "text" {
		handler = slog.NewTextHandler(logOutput, opts)
	} else {
		handler = slog.NewJSONHandler(logOutput, opts)
	}

	logger := slog.New(handler)

	if req.ScopeName != "" {
		logger = logger.With(slog.String("scope", req.ScopeName))
	}

	handle := newHandle("log")

	logMu.Lock()
	logHandles[handle] = &logEntry{logger: logger, levelVar: lv, scopeName: req.ScopeName} //nolint:exhaustruct
	logMu.Unlock()

	return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// buildFilterChain constructs a chained FilterFunc from a slice of filter configs.
func buildFilterChain(configs []logFilterConfig) logfx.FilterFunc {
	fns := make([]logfx.FilterFunc, 0, len(configs))

	for _, c := range configs {
		switch c.Type {
		case "level":
			fns = append(fns, logfx.LevelFilter(parseLogLevel(c.Level)))
		case "category":
			fns = append(fns, logfx.CategoryPrefixFilter(c.Category))
		case "rateLimit":
			fns = append(fns, logfx.RateLimitFilter(c.Rate))
		case "sampling":
			fns = append(fns, logfx.SamplingFilter(c.Prob))
		}
	}

	return logfx.ChainFilters(fns...)
}

// buildFormatter returns the FormatterFunc for the given name.
func buildFormatter(name string) logfx.FormatterFunc {
	switch strings.ToLower(name) {
	case "text":
		return logfx.TextFormatter()
	case "span-json":
		return logfx.SpanFormatter(logfx.JSONFormatter())
	case "span-text":
		return logfx.SpanFormatter(logfx.TextFormatter())
	default:
		return logfx.JSONFormatter()
	}
}

// bridgeLogWrite applies the entry's filter chain and formatter, then emits.
func bridgeLogWrite(requestJSON string) string {
	var req logWriteInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse(fmt.Errorf("invalid request JSON: %w", err).Error())
	}

	logMu.RLock()
	entry, ok := logHandles[req.Handle]
	logMu.RUnlock()

	if !ok {
		return errorResponse("log handle not found: " + req.Handle)
	}

	level := parseLogLevel(req.Level)

	// Level gate, applied before either emit path.
	//
	// The slog path inherits it from its handler, but the custom-formatter path
	// writes straight to stderr and would otherwise bypass it entirely -- a
	// DEBUG record emitted from a handle configured at ERROR, which
	// bridgeLogShouldLog reports as disabled. Both now consult the same gate.
	if !entry.logger.Enabled(context.Background(), level) {
		return marshalResponse(map[string]any{"filtered": true})
	}

	// Build slog.Attrs; prepend scope so category filters can match.
	slogAttrs := make([]slog.Attr, 0, len(req.Attrs)+1)
	if entry.scopeName != "" {
		slogAttrs = append(slogAttrs, slog.String("scope", entry.scopeName))
	}

	for k, v := range req.Attrs {
		slogAttrs = append(slogAttrs, slog.Any(k, v))
	}

	filters, formatter := entry.snapshot()

	// Apply filter chain — drop record without writing.
	if filters != nil && !filters(level, req.Message, slogAttrs) {
		return marshalResponse(map[string]any{"filtered": true})
	}

	// Custom formatter: write formatted string directly to stderr.
	if formatter != nil {
		rec := slog.NewRecord(time.Now(), level, req.Message, 0)
		rec.AddAttrs(slogAttrs...)
		// A log line that cannot be written is dropped, as the slog path does.
		_, _ = fmt.Fprintln(logOutput, formatter(rec))

		return "{}"
	}

	// Default: delegate to the slog.Logger (handles JSON/text via its handler).
	// The logger already carries the scope from bridgeLogCreate's With, so the
	// scope prepended above for the filters is left out here.
	recordAttrs := slogAttrs
	if entry.scopeName != "" {
		recordAttrs = slogAttrs[1:]
	}

	args := make([]any, 0, len(recordAttrs))
	for _, a := range recordAttrs {
		args = append(args, a)
	}

	entry.logger.Log(context.Background(), level, req.Message, args...)

	return "{}"
}

// bridgeLogClose removes a stored logger handle.
//
// Closing an unknown or already-closed handle succeeds: close is idempotent
// across every handle kind in this bridge.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeLogClose(handle string) string {
	logMu.Lock()
	delete(logHandles, handle)
	logMu.Unlock()

	return "{}"
}

// parseLogLevel maps a level name string to a slog.Level.
func parseLogLevel(s string) slog.Level {
	switch strings.ToUpper(s) {
	case "TRACE":
		return logfx.LevelTrace
	case "DEBUG":
		return logfx.LevelDebug
	case "INFO", "":
		return logfx.LevelInfo
	case "WARN":
		return logfx.LevelWarn
	case "ERROR":
		return logfx.LevelError
	case "FATAL":
		return logfx.LevelFatal
	case "PANIC":
		return logfx.LevelPanic
	default:
		return logfx.LevelInfo
	}
}

// bridgeLogShouldLog reports whether the logger would emit a record at level.
func bridgeLogShouldLog(requestJSON string) string {
	var req logShouldLogInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse(fmt.Errorf("invalid request JSON: %w", err).Error())
	}

	logMu.RLock()
	entry, ok := logHandles[req.Handle]
	logMu.RUnlock()

	if !ok {
		return errorResponse("log handle not found: " + req.Handle)
	}

	allowed := entry.logger.Enabled(context.Background(), parseLogLevel(req.Level))

	return marshalResponse(logShouldLogResponse{Allowed: allowed})
}

// bridgeLogConfigure updates level, filter chain, and formatter for a handle.
func bridgeLogConfigure(requestJSON string) string {
	var req logConfigureInput
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse(fmt.Errorf("invalid request JSON: %w", err).Error())
	}

	logMu.RLock()
	entry, ok := logHandles[req.Handle]
	logMu.RUnlock()

	if !ok {
		return errorResponse("log handle not found: " + req.Handle)
	}

	if req.Level != "" {
		entry.levelVar.Set(parseLogLevel(req.Level))
	}

	// Both fields are published under the entry's own lock: bridgeLogWrite reads
	// them concurrently on another thread, and two Configure calls would
	// otherwise race each other as well.
	entry.mu.Lock()

	if len(req.Filters) > 0 {
		entry.filters = buildFilterChain(req.Filters)
	}

	if req.Formatter != "" {
		entry.formatter = buildFormatter(req.Formatter)
	}

	entry.mu.Unlock()

	return "{}"
}

func init() {
	registerShutdownDrain(drainLogHandles)
	register("logCreate", []string{"configJSON"}, func(a []string) string { return bridgeLogCreate(a[0]) })
	register("logWrite", []string{"requestJSON"}, func(a []string) string { return bridgeLogWrite(a[0]) })
	register("logClose", []string{"handle"}, func(a []string) string { return bridgeLogClose(a[0]) })
	register("logShouldLog", []string{"requestJSON"}, func(a []string) string { return bridgeLogShouldLog(a[0]) })
	register("logConfigure", []string{"requestJSON"}, func(a []string) string { return bridgeLogConfigure(a[0]) })
}
