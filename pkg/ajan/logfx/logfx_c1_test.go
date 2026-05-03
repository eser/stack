// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase C — coverage tests for filter, formatter, router additions.

package logfx_test

import (
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// ─── FilterFunc ──────────────────────────────────────────────────────────────

func TestLevelFilter_PassesAtOrAbove(t *testing.T) {
	t.Parallel()

	f := logfx.LevelFilter(slog.LevelWarn)

	if !f(slog.LevelWarn, "msg", nil) {
		t.Fatal("expected WARN to pass at WARN threshold")
	}

	if !f(slog.LevelError, "msg", nil) {
		t.Fatal("expected ERROR to pass at WARN threshold")
	}

	if f(slog.LevelInfo, "msg", nil) {
		t.Fatal("expected INFO to be dropped at WARN threshold")
	}
}

func TestChainFilters_AllPass(t *testing.T) {
	t.Parallel()

	chain := logfx.ChainFilters(
		logfx.LevelFilter(slog.LevelDebug),
		logfx.LevelFilter(slog.LevelInfo),
	)

	if !chain(slog.LevelInfo, "msg", nil) {
		t.Fatal("expected INFO to pass both filters")
	}

	if chain(slog.LevelDebug, "msg", nil) {
		t.Fatal("expected DEBUG to be dropped by second filter")
	}
}

func TestChainFilters_EmptyAlwaysPasses(t *testing.T) {
	t.Parallel()

	chain := logfx.ChainFilters()

	if !chain(logfx.LevelTrace, "msg", nil) {
		t.Fatal("empty chain must always pass")
	}
}

func TestChainFilters_FirstFails(t *testing.T) {
	t.Parallel()

	called := false
	second := logfx.FilterFunc(func(_ slog.Level, _ string, _ []slog.Attr) bool {
		called = true
		return true
	})

	chain := logfx.ChainFilters(logfx.LevelFilter(slog.LevelError), second)

	if chain(slog.LevelInfo, "msg", nil) {
		t.Fatal("expected INFO to fail first filter")
	}

	if called {
		t.Fatal("second filter must not be called when first fails")
	}
}

func TestCategoryPrefixFilter_MatchesPrefix(t *testing.T) {
	t.Parallel()

	f := logfx.CategoryPrefixFilter("myapp")
	attrs := []slog.Attr{slog.String("scope", "myapp.http")}

	if !f(slog.LevelInfo, "msg", attrs) {
		t.Fatal("expected myapp.http to match prefix myapp")
	}
}

func TestCategoryPrefixFilter_NoScopeAlwaysPasses(t *testing.T) {
	t.Parallel()

	f := logfx.CategoryPrefixFilter("myapp")

	if !f(slog.LevelInfo, "msg", nil) {
		t.Fatal("expected no-scope record to pass")
	}
}

func TestCategoryPrefixFilter_MismatchDrops(t *testing.T) {
	t.Parallel()

	f := logfx.CategoryPrefixFilter("myapp")
	attrs := []slog.Attr{slog.String("scope", "otherapp.http")}

	if f(slog.LevelInfo, "msg", attrs) {
		t.Fatal("expected otherapp.http to fail prefix myapp")
	}
}

func TestRateLimitFilter_AllowsUnderLimit(t *testing.T) {
	t.Parallel()

	f := logfx.RateLimitFilter(100)

	for i := range 5 {
		if !f(slog.LevelInfo, "msg", nil) {
			t.Fatalf("iteration %d: expected pass under rate limit 100/s", i)
		}
	}
}

func TestRateLimitFilter_DropsOverLimit(t *testing.T) {
	t.Parallel()

	f := logfx.RateLimitFilter(2)

	pass := 0
	drop := 0

	for range 10 {
		if f(slog.LevelInfo, "msg", nil) {
			pass++
		} else {
			drop++
		}
	}

	if pass != 2 {
		t.Fatalf("expected exactly 2 pass, got %d", pass)
	}

	if drop != 8 {
		t.Fatalf("expected exactly 8 drops, got %d", drop)
	}
}

func TestSamplingFilter_AlwaysPassAt1(t *testing.T) {
	t.Parallel()

	f := logfx.SamplingFilter(1.0)

	for range 20 {
		if !f(slog.LevelInfo, "msg", nil) {
			t.Fatal("expected all records to pass at probability 1.0")
		}
	}
}

func TestSamplingFilter_NeverPassAt0(t *testing.T) {
	t.Parallel()

	f := logfx.SamplingFilter(0.0)

	for range 20 {
		if f(slog.LevelInfo, "msg", nil) {
			t.Fatal("expected all records to drop at probability 0.0")
		}
	}
}

// ─── FormatterFunc ───────────────────────────────────────────────────────────

func makeRecord(level slog.Level, msg string, attrs ...slog.Attr) slog.Record {
	rec := slog.NewRecord(time.Now(), level, msg, 0)
	rec.AddAttrs(attrs...)

	return rec
}

func TestJSONFormatter_ContainsFields(t *testing.T) {
	t.Parallel()

	f := logfx.JSONFormatter()
	rec := makeRecord(slog.LevelInfo, "hello world", slog.String("key", "val"))
	out := f(rec)

	if !strings.Contains(out, `"msg":"hello world"`) {
		t.Fatalf("expected msg field, got: %s", out)
	}

	if !strings.Contains(out, `"level":"INFO"`) {
		t.Fatalf("expected level field, got: %s", out)
	}

	if !strings.Contains(out, `"key":"val"`) {
		t.Fatalf("expected key attr, got: %s", out)
	}
}

func TestTextFormatter_ContainsFields(t *testing.T) {
	t.Parallel()

	f := logfx.TextFormatter()
	rec := makeRecord(slog.LevelWarn, "something wrong", slog.Int("code", 42))
	out := f(rec)

	if !strings.Contains(out, `level=WARN`) {
		t.Fatalf("expected level, got: %s", out)
	}

	if !strings.Contains(out, `msg="something wrong"`) {
		t.Fatalf("expected msg, got: %s", out)
	}

	if !strings.Contains(out, `code=42`) {
		t.Fatalf("expected code attr, got: %s", out)
	}
}

func TestSpanFormatter_AppendsIDs(t *testing.T) {
	t.Parallel()

	inner := logfx.TextFormatter()
	f := logfx.SpanFormatter(inner)
	rec := makeRecord(slog.LevelInfo, "traced",
		slog.String("trace_id", "abc123"),
		slog.String("span_id", "def456"),
	)
	out := f(rec)

	if !strings.Contains(out, "trace_id=abc123") {
		t.Fatalf("expected trace_id in output, got: %s", out)
	}

	if !strings.Contains(out, "span_id=def456") {
		t.Fatalf("expected span_id in output, got: %s", out)
	}
}

func TestSpanFormatter_NoSpanPassesThrough(t *testing.T) {
	t.Parallel()

	inner := logfx.TextFormatter()
	f := logfx.SpanFormatter(inner)
	rec := makeRecord(slog.LevelInfo, "untraced")
	out := f(rec)

	if strings.Contains(out, "trace_id") {
		t.Fatalf("did not expect trace_id when no span, got: %s", out)
	}
}

// ─── RouteTree / Configure / EffectiveLevel ──────────────────────────────────

func TestRouteTree_LongestPrefixWins(t *testing.T) {
	t.Parallel()

	routes := []logfx.CategoryRoute{
		{Category: "myapp", MinLevel: slog.LevelInfo},
		{Category: "myapp.http", MinLevel: slog.LevelDebug},
	}

	got := logfx.RouteTree(routes, "myapp.http.request", slog.LevelWarn)
	if got != slog.LevelDebug {
		t.Fatalf("expected DEBUG (myapp.http wins), got %v", got)
	}
}

func TestRouteTree_RootCatchAll(t *testing.T) {
	t.Parallel()

	routes := []logfx.CategoryRoute{
		{Category: "", MinLevel: logfx.LevelTrace},
		{Category: "myapp", MinLevel: slog.LevelError},
	}

	// Root matches when no prefix matches
	got := logfx.RouteTree(routes, "otherapp", slog.LevelWarn)
	if got != logfx.LevelTrace {
		t.Fatalf("expected TRACE (root catch-all), got %v", got)
	}

	// myapp prefix beats root
	got2 := logfx.RouteTree(routes, "myapp.db", slog.LevelWarn)
	if got2 != slog.LevelError {
		t.Fatalf("expected ERROR (myapp wins), got %v", got2)
	}
}

func TestRouteTree_NoBoundaryMismatch(t *testing.T) {
	t.Parallel()

	routes := []logfx.CategoryRoute{
		{Category: "myapp", MinLevel: slog.LevelDebug},
	}

	// "myapplication" must NOT match prefix "myapp" (no segment boundary)
	got := logfx.RouteTree(routes, "myapplication", slog.LevelWarn)
	if got != slog.LevelWarn {
		t.Fatalf("expected default WARN (no boundary match), got %v", got)
	}
}

func TestRouteTree_DefaultWhenNoMatch(t *testing.T) {
	t.Parallel()

	got := logfx.RouteTree(nil, "unknown", slog.LevelError)
	if got != slog.LevelError {
		t.Fatalf("expected default ERROR, got %v", got)
	}
}

func TestConfigure_EffectiveLevel(t *testing.T) {
	t.Parallel()

	logfx.Configure([]logfx.RouteConfig{
		{Category: "", Level: slog.LevelWarn},
		{Category: "svc", Level: slog.LevelDebug},
	})

	if got := logfx.EffectiveLevel("svc.db"); got != slog.LevelDebug {
		t.Fatalf("expected DEBUG for svc.db, got %v", got)
	}

	if got := logfx.EffectiveLevel("other"); got != slog.LevelWarn {
		t.Fatalf("expected WARN for other, got %v", got)
	}

	// Reset global to avoid test pollution
	logfx.Configure(nil)
}

func TestEffectiveLevel_DefaultsToInfo(t *testing.T) {
	t.Parallel()

	logfx.Configure(nil)

	if got := logfx.EffectiveLevel("anything"); got != logfx.LevelInfo {
		t.Fatalf("expected INFO default, got %v", got)
	}
}
