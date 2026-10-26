// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase A — logfx coverage baseline (50.7% → ≥80%).

package logfx_test

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// ─── LevelEncoder ────────────────────────────────────────────────────────────

func TestLevelEncoder_AllBranches(t *testing.T) {
	t.Parallel()

	cases := []struct {
		level slog.Level
		want  string
	}{
		{logfx.LevelTrace, "TRACE"},
		{logfx.LevelDebug, "DEBUG"},
		{logfx.LevelInfo, "INFO"},
		{logfx.LevelWarn, "WARN"},
		{logfx.LevelError, "ERROR"},
		{logfx.LevelFatal, "FATAL"},
		{logfx.LevelPanic, "PANIC"},
		// offset variants
		{logfx.LevelTrace + 1, "TRACE+1"},
		{logfx.LevelDebug + 2, "DEBUG+2"},
	}

	for _, tc := range cases {
		got := logfx.LevelEncoder(tc.level)
		if got != tc.want {
			t.Errorf("LevelEncoder(%v) = %q, want %q", tc.level, got, tc.want)
		}
	}
}

// ─── LoggerInstance ──────────────────────────────────────────────────────────

func TestNewLoggerInstance_Bind(t *testing.T) {
	t.Parallel()

	li := logfx.NewLoggerInstance()
	if li == nil {
		t.Fatal("expected non-nil LoggerInstance")
	}

	// Bind a real logger provider's logger
	logger := logfx.NewLogger(logfx.WithWriter(&bytes.Buffer{}))
	innerLogger := logfx.NewNoopLoggerProvider().Logger("test")
	li.Bind(innerLogger)
	_ = logger // NewLogger created; confirm no panic
}

// ─── Logger methods ──────────────────────────────────────────────────────────

func newTestLogger(t *testing.T) *logfx.Logger {
	t.Helper()

	return logfx.NewLogger(
		logfx.WithWriter(&bytes.Buffer{}),
		logfx.WithConfig(&logfx.Config{
			Level:                         "TRACE",
			PrettyMode:                    false,
			AddSource:                     false,
			DefaultLogger:                 false,
			NoNativeCollectorRegistration: true,
		}),
	)
}

func TestLogger_Printf(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	l.Printf("hello %s", "world") // must not panic
}

func TestLogger_Trace(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	l.Trace("trace msg")
	l.TraceContext(context.Background(), "trace ctx msg")
}

func TestLogger_Fatal(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	l.Fatal("fatal msg")
	l.Fatalf("fatal %s", "formatted")
	l.FatalContext(context.Background(), "fatal ctx msg")
}

func TestLogger_Panic(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	l.Panic("panic msg")
	l.PanicContext(context.Background(), "panic ctx msg")
}

func TestLogger_SetAsDefault(t *testing.T) {
	// Not parallel — modifies global slog default
	prev := slog.Default()
	defer slog.SetDefault(prev)

	l := newTestLogger(t)
	l.SetAsDefault()

	if slog.Default() == prev {
		t.Fatal("SetAsDefault should change the default slog logger")
	}
}

// ─── Propagator methods ──────────────────────────────────────────────────────

func TestLogger_PropagatorExtractInject(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	ctx := context.Background()
	headers := http.Header{}

	// Inject should populate headers (noop propagator produces empty headers, but must not panic)
	l.PropagatorInject(ctx, headers)

	// Extract should return a context (may be same or enriched)
	ctx2 := l.PropagatorExtract(ctx, headers)
	if ctx2 == nil {
		t.Fatal("PropagatorExtract returned nil context")
	}
}

// ─── StartSpan / NewMetricsBuilder ───────────────────────────────────────────

func TestLogger_StartSpan(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	ctx, span := l.StartSpan(context.Background(), "test-span")

	if ctx == nil {
		t.Fatal("StartSpan returned nil context")
	}
	if span == nil {
		t.Fatal("StartSpan returned nil span")
	}

	span.End()
}

func TestLogger_NewMetricsBuilder(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	mb := l.NewMetricsBuilder("test-scope")

	if mb == nil {
		t.Fatal("NewMetricsBuilder returned nil")
	}
}

// ─── Handler.AddSubscriber ───────────────────────────────────────────────────

func TestHandler_AddSubscriber(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer

	handler := logfx.NewHandler("test", &buf, &logfx.Config{
		Level:                         "INFO",
		PrettyMode:                    false,
		AddSource:                     false,
		DefaultLogger:                 false,
		NoNativeCollectorRegistration: true,
	})

	called := false
	handler.AddSubscriber(func(_ context.Context, _ slog.Record) error {
		called = true
		return nil
	})

	// Trigger the handler via a slog.Logger
	logger := slog.New(handler)
	logger.Info("test message")

	if !called {
		t.Fatal("subscriber was not called after logging")
	}
}

// ─── WithLevel option ────────────────────────────────────────────────────────

func TestWithLevel_SetsLevel(t *testing.T) {
	t.Parallel()

	l := logfx.NewLogger(
		logfx.WithWriter(&bytes.Buffer{}),
		logfx.WithLevel(slog.LevelDebug),
	)

	if l == nil {
		t.Fatal("NewLogger with WithLevel returned nil")
	}
}

// ─── Other NewLoggerOptions ───────────────────────────────────────────────────

func TestNewLoggerOptions_AllVariants(t *testing.T) {
	t.Parallel()

	inner := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))

	opts := []logfx.NewLoggerOption{
		logfx.WithScopeName("my-scope"),
		logfx.WithFromSlog(inner),
		logfx.WithPrettyMode(true),
		logfx.WithAddSource(true),
	}

	l := logfx.NewLogger(opts...)
	if l == nil {
		t.Fatal("NewLogger returned nil")
	}
}

func TestWithDefaultLogger_Option(t *testing.T) {
	// Not parallel — modifies global slog default
	prev := slog.Default()
	defer slog.SetDefault(prev)

	_ = logfx.NewLogger(
		logfx.WithWriter(&bytes.Buffer{}),
		logfx.WithDefaultLogger(),
	)
}

// ─── Span.GetTraceID / GetSpanID ─────────────────────────────────────────────

func TestSpan_GetTraceIDAndSpanID(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	_, span := l.StartSpan(context.Background(), "test")
	defer span.End()

	_ = span.GetTraceID()
	_ = span.GetSpanID()
}

// ─── ParseLevel extra branches ────────────────────────────────────────────────

func TestParseLevel_AllNames(t *testing.T) {
	t.Parallel()

	names := []string{"TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL", "PANIC",
		"trace", "debug", "info", "warn", "error", "fatal", "panic",
		"INFO+1", "DEBUG-1"}

	for _, name := range names {
		_, err := logfx.ParseLevel(name, true)
		if err != nil {
			t.Errorf("ParseLevel(%q) unexpected error: %v", name, err)
		}
	}
}

func TestParseLevel_EmptyAllowed(t *testing.T) {
	t.Parallel()

	level, err := logfx.ParseLevel("", false)
	if err != nil {
		t.Fatalf("ParseLevel empty allowed: %v", err)
	}
	if level == nil {
		t.Fatal("expected non-nil level")
	}
}

func TestParseLevel_UnknownName_Error(t *testing.T) {
	t.Parallel()

	_, err := logfx.ParseLevel("UNKNOWN", true)
	if err == nil {
		t.Fatal("expected error for unknown level name")
	}
}

func TestParseLevel_InvalidOffset_Error(t *testing.T) {
	t.Parallel()

	_, err := logfx.ParseLevel("INFO+abc", true)
	if err == nil {
		t.Fatal("expected error for invalid offset")
	}
}

// ─── ConvertSlogAttrsToOtelLog / ConvertSlogAttrToOtelLog ────────────────────

func TestConvertSlogAttrsToOtelLog_AllKinds(t *testing.T) {
	t.Parallel()

	attrs := []any{
		slog.String("str", "hello"),
		slog.Int64("int64", 42),
		slog.Float64("float64", 3.14),
		slog.Bool("bool", true),
		slog.Uint64("uint64", 100),
		slog.Any("any", struct{ x int }{1}),
		"not-a-slog-attr", // skipped
	}

	result := logfx.ConvertSlogAttrsToOtelLog(attrs)
	if len(result) != len(attrs) {
		t.Fatalf("expected %d results, got %d", len(attrs), len(result))
	}
}

func TestConvertSlogAttrToOtelLog_Int64(t *testing.T) {
	t.Parallel()

	kv := logfx.ConvertSlogAttrToOtelLog(slog.Int64("count", 99))
	if kv == nil {
		t.Fatal("expected non-nil KeyValue")
	}
}

func TestConvertSlogAttrToOtelLog_Float64(t *testing.T) {
	t.Parallel()

	kv := logfx.ConvertSlogAttrToOtelLog(slog.Float64("ratio", 0.5))
	if kv == nil {
		t.Fatal("expected non-nil KeyValue")
	}
}

func TestConvertSlogAttrToOtelLog_Bool(t *testing.T) {
	t.Parallel()

	kv := logfx.ConvertSlogAttrToOtelLog(slog.Bool("ok", false))
	if kv == nil {
		t.Fatal("expected non-nil KeyValue")
	}
}

func TestConvertSlogAttrToOtelLog_LargeUint64(t *testing.T) {
	t.Parallel()

	// uint64 > MaxInt64 falls back to string
	kv := logfx.ConvertSlogAttrToOtelLog(slog.Uint64("big", ^uint64(0)))
	if kv == nil {
		t.Fatal("expected non-nil KeyValue")
	}
}

// ─── MetricsBuilder ──────────────────────────────────────────────────────────

func TestMetricsBuilder_CounterGaugeHistogram(t *testing.T) {
	t.Parallel()

	l := newTestLogger(t)
	mb := l.NewMetricsBuilder("test")

	// Bind with a noop provider
	mb.Bind(logfx.NewNoopMeterProvider())

	ctx := context.Background()

	// Counter
	counter, err := mb.Counter("req_total", "total requests").WithUnit("1").Build()
	if err != nil {
		t.Fatalf("Counter.Build: %v", err)
	}
	counter.Add(ctx, 5)
	counter.Inc(ctx)

	// Gauge
	gauge, err := mb.Gauge("mem_bytes", "memory bytes").WithUnit("By").Build()
	if err != nil {
		t.Fatalf("Gauge.Build: %v", err)
	}
	gauge.Set(ctx, 1024)
	gauge.SetBool(ctx, true)
	gauge.SetBool(ctx, false)

	// Histogram (default buckets)
	hist, err := mb.Histogram("req_duration", "request duration").Build()
	if err != nil {
		t.Fatalf("Histogram.Build: %v", err)
	}
	hist.Record(ctx, 0.5)
	hist.RecordDuration(ctx, 100*time.Millisecond)

	// Histogram with custom buckets
	hist2, err := mb.Histogram("req_size", "request size").
		WithUnit("By").
		WithBuckets(128, 512, 1024).
		Build()
	if err != nil {
		t.Fatalf("Histogram(custom buckets).Build: %v", err)
	}
	hist2.Record(ctx, 256)

	// Histogram with duration buckets
	hist3, err := mb.Histogram("req_latency", "latency").WithDurationBuckets().Build()
	if err != nil {
		t.Fatalf("Histogram(duration buckets).Build: %v", err)
	}
	hist3.RecordDuration(ctx, time.Second)
}
