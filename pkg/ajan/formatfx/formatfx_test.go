// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx_test

import (
	"errors"
	"testing"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

func TestFormatYAML_ArrayRoundtrip(t *testing.T) {
	t.Parallel()

	items := []any{
		map[string]any{"name": "app1", "count": 42},
		map[string]any{"name": "app2", "count": 7},
	}

	// Encode two items as a YAML sequence document
	chunks := make([]string, 0, len(items))
	for i, item := range items {
		opts := &formatfx.FormatOptions{IsFirst: i == 0} //nolint:exhaustruct
		out, err := formatfx.YAMLFormat.WriteItem(item, opts)
		if err != nil {
			t.Fatalf("WriteItem[%d]: %v", i, err)
		}
		chunks = append(chunks, out)
	}

	combined := ""
	for _, c := range chunks {
		combined += c
	}

	// Decode back
	reader := formatfx.YAMLFormat.CreateReader(nil)
	_, _ = reader.Push(combined)
	decoded, err := reader.Flush()
	if err != nil {
		t.Fatalf("Flush: %v", err)
	}

	if len(decoded) != 2 {
		t.Fatalf("expected 2 items, got %d: %v", len(decoded), decoded)
	}

	m0, ok := decoded[0].(map[string]any)
	if !ok {
		t.Fatalf("item[0] is not map: %T", decoded[0])
	}

	if m0["name"] != "app1" {
		t.Errorf("item[0].name: got %v, want app1", m0["name"])
	}

	m1, ok := decoded[1].(map[string]any)
	if !ok {
		t.Fatalf("item[1] is not map: %T", decoded[1])
	}

	if m1["name"] != "app2" {
		t.Errorf("item[1].name: got %v, want app2", m1["name"])
	}
}

func TestFormatTOML_ArrayRoundtrip(t *testing.T) {
	t.Parallel()

	items := []any{
		map[string]any{"name": "app1", "count": int64(42)},
		map[string]any{"name": "app2", "count": int64(7)},
	}

	// Encode two items with +++ separator
	var combined string
	for i, item := range items {
		opts := &formatfx.FormatOptions{IsFirst: i == 0} //nolint:exhaustruct
		out, err := formatfx.TOMLFormat.WriteItem(item, opts)
		if err != nil {
			t.Fatalf("WriteItem[%d]: %v", i, err)
		}
		combined += out
	}

	// Trim trailing +++ to mimic bridge behaviour
	if len(combined) >= 4 && combined[len(combined)-4:] == "+++\n" {
		combined = combined[:len(combined)-4] + "\n"
	}

	// Decode back
	reader := formatfx.TOMLFormat.CreateReader(nil)
	_, _ = reader.Push(combined)
	decoded, err := reader.Flush()
	if err != nil {
		t.Fatalf("Flush: %v", err)
	}

	if len(decoded) != 2 {
		t.Fatalf("expected 2 items, got %d: %v", len(decoded), decoded)
	}

	m0 := decoded[0].(map[string]any)
	if m0["name"] != "app1" {
		t.Errorf("item[0].name: got %v, want app1", m0["name"])
	}

	m1 := decoded[1].(map[string]any)
	if m1["name"] != "app2" {
		t.Errorf("item[1].name: got %v, want app2", m1["name"])
	}
}

func TestFormatTOML_RejectNonObjectRoot(t *testing.T) {
	t.Parallel()

	nonObjects := []any{
		"plain string",
		42,
		[]string{"a", "b"},
		true,
	}

	for _, v := range nonObjects {
		_, err := formatfx.TOMLFormat.WriteItem(v, nil)
		if err == nil {
			t.Errorf("WriteItem(%v): expected error, got nil", v)
			continue
		}

		if !errors.Is(err, formatfx.ErrTOMLRootNotObject) {
			t.Errorf("WriteItem(%v): error does not wrap ErrTOMLRootNotObject: %v", v, err)
		}
	}
}

func TestFormatCSV_HeaderRoundtrip(t *testing.T) {
	t.Parallel()

	items := []any{
		map[string]any{"name": "app1", "version": "1.0.0"},
		map[string]any{"name": "app2", "version": "2.0.0"},
	}

	// Encode: header row auto-emitted on first item
	var combined string
	for i, item := range items {
		opts := &formatfx.FormatOptions{IsFirst: i == 0} //nolint:exhaustruct
		out, err := formatfx.CSVFormat.WriteItem(item, opts)
		if err != nil {
			t.Fatalf("WriteItem[%d]: %v", i, err)
		}
		combined += out
	}

	// Verify header row is present
	firstLine := ""
	for _, ch := range combined {
		if ch == '\n' {
			break
		}
		firstLine += string(ch)
	}
	if firstLine != "name,version" {
		t.Errorf("first line (header): got %q, want %q", firstLine, "name,version")
	}

	// Decode back via auto-detect
	reader := formatfx.CSVFormat.CreateReader(nil)
	pushed, err := reader.Push(combined)
	if err != nil {
		t.Fatalf("Push: %v", err)
	}
	flushed, err := reader.Flush()
	if err != nil {
		t.Fatalf("Flush: %v", err)
	}
	decoded := make([]any, 0, len(pushed)+len(flushed))
	decoded = append(decoded, pushed...)
	decoded = append(decoded, flushed...)

	if len(decoded) != 2 {
		t.Fatalf("expected 2 items, got %d", len(decoded))
	}

	row0 := decoded[0].(map[string]string)
	if row0["name"] != "app1" {
		t.Errorf("item[0].name: got %v, want app1", row0["name"])
	}

	if row0["version"] != "1.0.0" {
		t.Errorf("item[0].version: got %v, want 1.0.0", row0["version"])
	}
}
