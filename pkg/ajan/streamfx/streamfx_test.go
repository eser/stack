// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase A — streamfx coverage baseline (0.0% → ≥80%).

package streamfx_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/streamfx"
)

// ─── NewChunk ────────────────────────────────────────────────────────────────

func TestNewChunk_FieldsSet(t *testing.T) {
	t.Parallel()

	for _, kind := range []streamfx.ChunkKind{
		streamfx.KindText,
		streamfx.KindStructured,
		streamfx.KindBytes,
		streamfx.KindSignal,
	} {
		c := streamfx.NewChunk("hello", kind)
		if c.Data != "hello" {
			t.Fatalf("want Data=hello, got %v", c.Data)
		}
		if c.Meta.Kind != kind {
			t.Fatalf("want Kind=%s, got %s", kind, c.Meta.Kind)
		}
		if c.Meta.Timestamp.IsZero() {
			t.Fatal("expected non-zero timestamp")
		}
	}
}

// ─── PipelineError ───────────────────────────────────────────────────────────

func TestPipelineError_WithCause(t *testing.T) {
	t.Parallel()

	cause := errors.New("root cause")
	pe := &streamfx.PipelineError{Msg: "msg", Cause: cause}

	if !strings.Contains(pe.Error(), "msg") {
		t.Fatalf("expected msg in error: %s", pe.Error())
	}
	if !strings.Contains(pe.Error(), "root cause") {
		t.Fatalf("expected cause in error: %s", pe.Error())
	}

	unwrapped := pe.Unwrap()
	if unwrapped == nil {
		t.Fatal("Unwrap must not be nil when Cause is set")
	}
}

func TestPipelineError_NoCause(t *testing.T) {
	t.Parallel()

	pe := &streamfx.PipelineError{Msg: "no-cause", Cause: nil}
	if pe.Error() != "no-cause" {
		t.Fatalf("want 'no-cause', got %q", pe.Error())
	}
	if pe.Unwrap() != nil {
		t.Fatal("Unwrap must be nil when no cause")
	}
}

// ─── ValuesSource ────────────────────────────────────────────────────────────

func TestValuesSource_EmitsAllItems(t *testing.T) {
	t.Parallel()

	items := collectPipeline(t, streamfx.ValuesSource("vs", "a", "b", "c"))
	if len(items) != 3 {
		t.Fatalf("expected 3 items, got %d: %v", len(items), items)
	}
}

func TestValuesSource_EmptyEmitsNothing(t *testing.T) {
	t.Parallel()

	items := collectPipeline(t, streamfx.ValuesSource("vs"))
	if len(items) != 0 {
		t.Fatalf("expected empty, got %v", items)
	}
}

func TestValuesSource_ContextCancel_Stops(t *testing.T) {
	t.Parallel()

	// Large number of items; cancel before they all arrive.
	manyItems := make([]any, 1000)
	for i := range manyItems {
		manyItems[i] = i
	}

	ctx, cancel := context.WithCancel(context.Background())
	src := streamfx.ValuesSource("vs", manyItems...)

	ch, err := src.Open(ctx)
	if err != nil {
		t.Fatal(err)
	}

	// Read one chunk then cancel.
	<-ch
	cancel()

	// Drain remaining; should eventually stop.
	done := make(chan struct{})
	go func() {
		defer close(done)
		for range ch {
		}
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("ValuesSource did not stop after context cancel")
	}
}

// ─── ReadableSource ──────────────────────────────────────────────────────────

func TestReadableSource_ReadsLines(t *testing.T) {
	t.Parallel()

	r := strings.NewReader("line1\nline2\nline3")
	src := streamfx.ReadableSource("rs", r)

	items := collectPipeline(t, src)
	if len(items) != 3 {
		t.Fatalf("expected 3 lines, got %d: %v", len(items), items)
	}
	if items[0] != "line1" {
		t.Fatalf("expected 'line1', got %v", items[0])
	}
}

func TestReadableSource_EmptyReader(t *testing.T) {
	t.Parallel()

	items := collectPipeline(t, streamfx.ReadableSource("rs", strings.NewReader("")))
	if len(items) != 0 {
		t.Fatalf("expected empty, got %v", items)
	}
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

func TestPipeline_NoSource_Error(t *testing.T) {
	t.Parallel()

	p := streamfx.New().To(streamfx.NullSink("s"))
	err := p.Run(context.Background(), nil)
	if !errors.Is(err, streamfx.ErrNoSource) {
		t.Fatalf("expected ErrNoSource, got %v", err)
	}
}

func TestPipeline_NoSink_Error(t *testing.T) {
	t.Parallel()

	p := streamfx.New().From(streamfx.ValuesSource("s", 1))
	err := p.Run(context.Background(), nil)
	if !errors.Is(err, streamfx.ErrNoSink) {
		t.Fatalf("expected ErrNoSink, got %v", err)
	}
}

func TestPipeline_RunHappyPath(t *testing.T) {
	t.Parallel()

	buf := streamfx.BufferSinkNew("buf")
	p := streamfx.New().
		From(streamfx.ValuesSource("src", 1, 2, 3)).
		To(buf)

	if err := p.Run(context.Background(), nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(buf.Items()) != 3 {
		t.Fatalf("expected 3 items, got %d", len(buf.Items()))
	}
}

func TestPipeline_Timeout_ContextCancelled(t *testing.T) {
	t.Parallel()

	// source that blocks forever — pipeline should timeout via PipelineOptions
	blocker := make(chan streamfx.Chunk) // never sends
	blockerSrc := &chanSource{ch: blocker, name: "blocker"}

	p := streamfx.New().
		From(blockerSrc).
		To(streamfx.NullSink("null"))

	start := time.Now()
	err := p.Run(context.Background(), &streamfx.PipelineOptions{Timeout: 50 * time.Millisecond})
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected error from timeout")
	}
	if elapsed > 2*time.Second {
		t.Fatalf("pipeline should have timed out quickly, took %v", elapsed)
	}
}

func TestPipeline_Collect_Returns(t *testing.T) {
	t.Parallel()

	p := streamfx.New().From(streamfx.ValuesSource("src", "x", "y"))
	items, err := p.Collect(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2, got %d: %v", len(items), items)
	}
}

// ─── FilterLayer ─────────────────────────────────────────────────────────────

func TestFilterLayer_PassesMatching(t *testing.T) {
	t.Parallel()

	filter := streamfx.FilterLayer("f", func(c streamfx.Chunk) bool {
		return c.Data == "keep"
	})

	p := streamfx.New().
		From(streamfx.ValuesSource("src", "keep", "drop", "keep")).
		Through(filter)

	items, err := p.Collect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 after filter, got %d: %v", len(items), items)
	}
}

func TestFilterLayer_BlocksAll(t *testing.T) {
	t.Parallel()

	filter := streamfx.FilterLayer("f", func(_ streamfx.Chunk) bool { return false })
	p := streamfx.New().
		From(streamfx.ValuesSource("src", 1, 2, 3)).
		Through(filter)

	items, err := p.Collect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("expected 0, got %d", len(items))
	}
}

// ─── MapLayer ────────────────────────────────────────────────────────────────

func TestMapLayer_TransformsData(t *testing.T) {
	t.Parallel()

	mapL := streamfx.MapLayer("m", func(c streamfx.Chunk) streamfx.Chunk {
		return streamfx.NewChunk(fmt.Sprintf("x%v", c.Data), streamfx.KindText)
	})

	p := streamfx.New().
		From(streamfx.ValuesSource("src", "a", "b")).
		Through(mapL)

	items, err := p.Collect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if items[0] != "xa" || items[1] != "xb" {
		t.Fatalf("unexpected items: %v", items)
	}
}

// ─── TapLayer ────────────────────────────────────────────────────────────────

func TestTapLayer_SideEffect_Passthrough(t *testing.T) {
	t.Parallel()

	var seen []any
	tap := streamfx.TapLayer("tap", func(c streamfx.Chunk) {
		seen = append(seen, c.Data)
	})

	p := streamfx.New().
		From(streamfx.ValuesSource("src", 1, 2, 3)).
		Through(tap)

	items, err := p.Collect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 || len(seen) != 3 {
		t.Fatalf("expected 3 items and 3 taps, got items=%d, seen=%d", len(items), len(seen))
	}
}

// ─── TeeLayer ────────────────────────────────────────────────────────────────

func TestTeeLayer_CopiesAndPassesThrough(t *testing.T) {
	t.Parallel()

	teeBuf := streamfx.BufferSinkNew("tee-buf")
	tee := streamfx.TeeLayer("tee", teeBuf)

	p := streamfx.New().
		From(streamfx.ValuesSource("src", "p", "q")).
		Through(tee)

	mainItems, err := p.Collect(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if len(mainItems) != 2 {
		t.Fatalf("expected 2 main items, got %d", len(mainItems))
	}
}

// ─── NullSink ────────────────────────────────────────────────────────────────

func TestNullSink_DiscardsAll(t *testing.T) {
	t.Parallel()

	p := streamfx.New().
		From(streamfx.ValuesSource("src", 1, 2, 3)).
		To(streamfx.NullSink("null"))

	if err := p.Run(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
}

// ─── WriterSink ──────────────────────────────────────────────────────────────

func TestWriterSink_WritesData(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	sink := streamfx.WriterSink("ws", &buf)

	p := streamfx.New().
		From(streamfx.ValuesSource("src", "hello")).
		To(sink)

	if err := p.Run(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buf.String(), "hello") {
		t.Fatalf("expected 'hello' in output, got %q", buf.String())
	}
}

// ─── MultiplexSink ───────────────────────────────────────────────────────────

func TestMultiplexSink_FansOut(t *testing.T) {
	t.Parallel()

	buf1 := streamfx.BufferSinkNew("buf1")
	buf2 := streamfx.BufferSinkNew("buf2")
	mux := streamfx.MultiplexSink("mux", buf1, buf2)

	p := streamfx.New().
		From(streamfx.ValuesSource("src", "a", "b")).
		To(mux)

	if err := p.Run(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	if len(buf1.Items()) != 2 || len(buf2.Items()) != 2 {
		t.Fatalf("expected 2 items each; buf1=%d buf2=%d", len(buf1.Items()), len(buf2.Items()))
	}
}

// ─── StdoutSink / StderrSink name ────────────────────────────────────────────

func TestStdoutSink_Name(t *testing.T) {
	t.Parallel()

	s := streamfx.StdoutSink("out")
	if s.Name() != "out" {
		t.Fatalf("expected 'out', got %q", s.Name())
	}
}

func TestStderrSink_Name(t *testing.T) {
	t.Parallel()

	s := streamfx.StderrSink("err")
	if s.Name() != "err" {
		t.Fatalf("expected 'err', got %q", s.Name())
	}
}

// ─── Layer/Sink Name() methods ───────────────────────────────────────────────

func TestLayerNames(t *testing.T) {
	t.Parallel()

	if streamfx.FilterLayer("f1", func(_ streamfx.Chunk) bool { return true }).Name() != "f1" {
		t.Fatal("FilterLayer name mismatch")
	}
	if streamfx.MapLayer("m1", func(c streamfx.Chunk) streamfx.Chunk { return c }).Name() != "m1" {
		t.Fatal("MapLayer name mismatch")
	}
	if streamfx.TapLayer("t1", func(_ streamfx.Chunk) {}).Name() != "t1" {
		t.Fatal("TapLayer name mismatch")
	}
	if streamfx.TeeLayer("tee1", streamfx.NullSink("n")).Name() != "tee1" {
		t.Fatal("TeeLayer name mismatch")
	}
	if streamfx.NullSink("null1").Name() != "null1" {
		t.Fatal("NullSink name mismatch")
	}
	if streamfx.MultiplexSink("mux1").Name() != "mux1" {
		t.Fatal("MultiplexSink name mismatch")
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func collectPipeline(t *testing.T, src streamfx.Source) []any {
	t.Helper()

	p := streamfx.New().From(src)
	items, err := p.Collect(context.Background())
	if err != nil {
		t.Fatalf("collect error: %v", err)
	}

	return items
}

// chanSource is a Source backed by an externally-controlled channel (for blocking tests).
type chanSource struct {
	name string
	ch   chan streamfx.Chunk
}

func (s *chanSource) Name() string { return s.name }

func (s *chanSource) Open(_ context.Context) (<-chan streamfx.Chunk, error) {
	return s.ch, nil
}
