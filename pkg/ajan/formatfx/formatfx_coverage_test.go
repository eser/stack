// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// ─── format metadata ─────────────────────────────────────────────────────────

func TestFormatMetadata(t *testing.T) {
	t.Parallel()

	cases := []struct {
		format     formatfx.Format
		name       string
		extensions []string
		streamable bool
	}{
		{formatfx.JSONFormat, "json", []string{"json"}, false},
		{formatfx.JSONLFormat, "jsonl", []string{"jsonl", "ndjson"}, true},
		{formatfx.YAMLFormat, "yaml", []string{"yaml", "yml"}, true},
		{formatfx.TOMLFormat, "toml", []string{"toml"}, false},
		{formatfx.CSVFormat, "csv", []string{"csv"}, true},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := tc.format.Name(); got != tc.name {
				t.Errorf("Name() = %q, want %q", got, tc.name)
			}

			got := tc.format.Extensions()
			if len(got) != len(tc.extensions) {
				t.Fatalf("Extensions() len = %d, want %d", len(got), len(tc.extensions))
			}
			for i, ext := range tc.extensions {
				if got[i] != ext {
					t.Errorf("Extensions()[%d] = %q, want %q", i, got[i], ext)
				}
			}

			if got := tc.format.Streamable(); got != tc.streamable {
				t.Errorf("Streamable() = %v, want %v", got, tc.streamable)
			}
		})
	}
}

// ─── JSON WriteStart / WriteItem / WriteEnd ───────────────────────────────────

func TestJSONWriteStart(t *testing.T) {
	t.Parallel()

	s, err := formatfx.JSONFormat.WriteStart(nil)
	if err != nil {
		t.Fatal(err)
	}
	if s != "[" {
		t.Errorf("WriteStart(nil) = %q, want %q", s, "[")
	}

	sPretty, err := formatfx.JSONFormat.WriteStart(&formatfx.FormatOptions{Pretty: true}) //nolint:exhaustruct
	if err != nil {
		t.Fatal(err)
	}
	if sPretty != "[\n" {
		t.Errorf("WriteStart(pretty) = %q, want %q", sPretty, "[\n")
	}
}

func TestJSONWriteEnd(t *testing.T) {
	t.Parallel()

	e, err := formatfx.JSONFormat.WriteEnd(nil)
	if err != nil {
		t.Fatal(err)
	}
	if e != "]\n" {
		t.Errorf("WriteEnd(nil) = %q, want %q", e, "]\n")
	}

	ePretty, err := formatfx.JSONFormat.WriteEnd(&formatfx.FormatOptions{Pretty: true}) //nolint:exhaustruct
	if err != nil {
		t.Fatal(err)
	}
	if ePretty != "\n]\n" {
		t.Errorf("WriteEnd(pretty) = %q, want %q", ePretty, "\n]\n")
	}
}

func TestJSONWriteItem(t *testing.T) {
	t.Parallel()

	t.Run("first item no separator", func(t *testing.T) {
		t.Parallel()
		got, err := formatfx.JSONFormat.WriteItem(map[string]any{"k": "v"}, &formatfx.FormatOptions{IsFirst: true}) //nolint:exhaustruct
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(got, `{"k":"v"}`) {
			t.Errorf("WriteItem first = %q, want prefix {\"k\":\"v\"}", got)
		}
	})

	t.Run("subsequent item has comma separator", func(t *testing.T) {
		t.Parallel()
		got, err := formatfx.JSONFormat.WriteItem(map[string]any{"n": 1}, &formatfx.FormatOptions{IsFirst: false}) //nolint:exhaustruct
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(got, ",") {
			t.Errorf("WriteItem subsequent = %q, want comma prefix", got)
		}
	})

	t.Run("pretty mode indents", func(t *testing.T) {
		t.Parallel()
		got, err := formatfx.JSONFormat.WriteItem(map[string]any{"x": 1}, &formatfx.FormatOptions{IsFirst: true, Pretty: true}) //nolint:exhaustruct
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(got, "\n") {
			t.Errorf("WriteItem pretty = %q, expected newlines", got)
		}
	})

	t.Run("serialization error", func(t *testing.T) {
		t.Parallel()
		_, err := formatfx.JSONFormat.WriteItem(make(chan int), nil)
		if err == nil {
			t.Fatal("expected error for unsupported type")
		}
	})
}

func TestJSONReaderRoundtrip(t *testing.T) {
	t.Parallel()

	reader := formatfx.JSONFormat.CreateReader(nil)
	pushed, err := reader.Push(`[{"a":1},{"a":2}]`)
	if err != nil {
		t.Fatal(err)
	}
	if len(pushed) != 0 {
		t.Errorf("Push() expected 0 intermediate items (JSON batches on Flush), got %d", len(pushed))
	}

	items, err := reader.Flush()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("Flush() expected 2 items, got %d", len(items))
	}
}

func TestJSONReaderEmptyFlush(t *testing.T) {
	t.Parallel()

	reader := formatfx.JSONFormat.CreateReader(nil)
	items, err := reader.Flush()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Errorf("empty Flush() = %d items, want 0", len(items))
	}
}

func TestJSONReaderSingleObject(t *testing.T) {
	t.Parallel()

	reader := formatfx.JSONFormat.CreateReader(nil)
	_, _ = reader.Push(`{"key":"val"}`)

	items, err := reader.Flush()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
}

// ─── JSONL WriteStart / WriteItem / WriteEnd / streaming ──────────────────────

func TestJSONLWriteStartEnd(t *testing.T) {
	t.Parallel()

	s, err := formatfx.JSONLFormat.WriteStart(nil)
	if err != nil {
		t.Fatal(err)
	}
	if s != "" {
		t.Errorf("WriteStart = %q, want empty", s)
	}

	e, err := formatfx.JSONLFormat.WriteEnd(nil)
	if err != nil {
		t.Fatal(err)
	}
	if e != "" {
		t.Errorf("WriteEnd = %q, want empty", e)
	}
}

func TestJSONLWriteItem(t *testing.T) {
	t.Parallel()

	got, err := formatfx.JSONLFormat.WriteItem(map[string]any{"n": "x"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got != `{"n":"x"}`+"\n" {
		t.Errorf("WriteItem = %q, want {\"n\":\"x\"}\\n", got)
	}
}

func TestJSONLWriteItemError(t *testing.T) {
	t.Parallel()

	_, err := formatfx.JSONLFormat.WriteItem(make(chan int), nil)
	if err == nil {
		t.Fatal("expected error for channel value")
	}
}

func TestJSONLReaderStreamingRoundtrip(t *testing.T) {
	t.Parallel()

	reader := formatfx.JSONLFormat.CreateReader(nil)

	p1, err := reader.Push(`{"a":1}` + "\n")
	if err != nil {
		t.Fatal(err)
	}
	if len(p1) != 1 {
		t.Fatalf("Push 1 item: got %d items, want 1", len(p1))
	}

	p2, err := reader.Push(`{"b":2}` + "\n" + `{"c":3}` + "\n")
	if err != nil {
		t.Fatal(err)
	}
	if len(p2) != 2 {
		t.Fatalf("Push 2 items: got %d items, want 2", len(p2))
	}
}

func TestJSONLReaderNoTrailingNewline(t *testing.T) {
	t.Parallel()

	// bufio.Scanner returns the last line even without a trailing newline,
	// so a complete JSON object pushed without '\n' is parsed immediately.
	reader := formatfx.JSONLFormat.CreateReader(nil)

	items, err := reader.Push(`{"x":1}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Errorf("no-trailing-newline push: got %d items, want 1", len(items))
	}
}

func TestJSONLReaderFlushEmpty(t *testing.T) {
	t.Parallel()

	reader := formatfx.JSONLFormat.CreateReader(nil)

	items, err := reader.Flush()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Errorf("empty Flush = %d items, want 0", len(items))
	}
}

func TestJSONLReaderFlushIncomplete(t *testing.T) {
	t.Parallel()

	// Push an incomplete JSON value (no closing brace).
	// Push tries to parse it, fails, keeps it in buffer.
	// Flush then tries to parse the buffer and returns an error.
	reader := formatfx.JSONLFormat.CreateReader(nil)
	_, _ = reader.Push(`{"z":`)

	_, err := reader.Flush()
	if err == nil {
		t.Fatal("expected error flushing incomplete JSON")
	}
}

// ─── Other format WriteStart / WriteEnd ───────────────────────────────────────

func TestCSVWriteStartEnd(t *testing.T) {
	t.Parallel()

	s, err := formatfx.CSVFormat.WriteStart(nil)
	if err != nil {
		t.Fatal(err)
	}
	if s != "" {
		t.Errorf("CSV WriteStart = %q, want empty", s)
	}

	e, err := formatfx.CSVFormat.WriteEnd(nil)
	if err != nil {
		t.Fatal(err)
	}
	if e != "" {
		t.Errorf("CSV WriteEnd = %q, want empty", e)
	}
}

func TestTOMLWriteStartEnd(t *testing.T) {
	t.Parallel()

	s, err := formatfx.TOMLFormat.WriteStart(nil)
	if err != nil {
		t.Fatal(err)
	}
	if s != "" {
		t.Errorf("TOML WriteStart = %q, want empty", s)
	}
}

func TestYAMLWriteStartEnd(t *testing.T) {
	t.Parallel()

	s, err := formatfx.YAMLFormat.WriteStart(nil)
	if err != nil {
		t.Fatal(err)
	}
	if s != "" {
		t.Errorf("YAML WriteStart = %q, want empty", s)
	}

	e, err := formatfx.YAMLFormat.WriteEnd(nil)
	if err != nil {
		t.Fatal(err)
	}
	if e != "" {
		t.Errorf("YAML WriteEnd = %q, want empty", e)
	}
}

// ─── Registry ─────────────────────────────────────────────────────────────────

func TestRegistry_RegisterAndGet(t *testing.T) {
	t.Parallel()

	r := formatfx.NewRegistry()
	r.Register(formatfx.JSONFormat)

	f, ok := r.Get("json")
	if !ok {
		t.Fatal("Get(json) not found after Register")
	}
	if f.Name() != "json" {
		t.Errorf("Get(json).Name() = %q, want json", f.Name())
	}

	fByExt, ok := r.Get(".json")
	if !ok {
		t.Fatal("Get(.json) not found by extension")
	}
	if fByExt.Name() != "json" {
		t.Errorf("Get(.json).Name() = %q, want json", fByExt.Name())
	}
}

func TestRegistry_Has(t *testing.T) {
	t.Parallel()

	r := formatfx.NewRegistry()
	r.Register(formatfx.YAMLFormat)

	if !r.Has("yaml") {
		t.Error("Has(yaml) = false, want true")
	}
	if !r.Has(".yml") {
		t.Error("Has(.yml) = false, want true")
	}
	if r.Has("json") {
		t.Error("Has(json) = true, want false")
	}
}

func TestRegistry_Unregister(t *testing.T) {
	t.Parallel()

	r := formatfx.NewRegistry()
	r.Register(formatfx.JSONFormat)
	r.Unregister("json")

	if r.Has("json") {
		t.Error("json still present after Unregister")
	}
	if r.Has(".json") {
		t.Error("json extension still present after Unregister")
	}

	r.Unregister("nonexistent") // must not panic
}

func TestRegistry_List(t *testing.T) {
	t.Parallel()

	r := formatfx.NewRegistry()
	r.Register(formatfx.JSONFormat)
	r.Register(formatfx.YAMLFormat)

	list := r.List()
	if len(list) != 2 {
		t.Errorf("List() len = %d, want 2", len(list))
	}
}

func TestRegistry_Clear(t *testing.T) {
	t.Parallel()

	r := formatfx.NewRegistry()
	r.Register(formatfx.JSONFormat)
	r.Register(formatfx.CSVFormat)
	r.Clear()

	if len(r.List()) != 0 {
		t.Errorf("List() after Clear = %d, want 0", len(r.List()))
	}
}

func TestRegistry_GetNotFound(t *testing.T) {
	t.Parallel()

	r := formatfx.NewRegistry()
	_, ok := r.Get("nonexistent")
	if ok {
		t.Error("Get(nonexistent) should return false")
	}
}

// ─── RegisterBuiltinFormats + GetFormat ───────────────────────────────────────

func TestRegisterBuiltinFormats(t *testing.T) {
	t.Parallel()

	formatfx.RegisterBuiltinFormats()

	for _, name := range []string{"json", "jsonl", "yaml", "toml", "csv"} {
		f, err := formatfx.GetFormat(name)
		if err != nil {
			t.Errorf("GetFormat(%q) error after RegisterBuiltinFormats: %v", name, err)
			continue
		}
		if f.Name() != name {
			t.Errorf("GetFormat(%q).Name() = %q", name, f.Name())
		}
	}
}

func TestGetFormat_NotFound(t *testing.T) {
	t.Parallel()

	formatfx.RegisterBuiltinFormats()

	_, err := formatfx.GetFormat("nonexistent-format")
	if err == nil {
		t.Error("GetFormat(nonexistent) should return error")
	}
}
