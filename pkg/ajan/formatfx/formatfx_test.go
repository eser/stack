// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx_test

import (
	"encoding/json"
	"errors"
	"strings"
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

// TestFormatTOML_KeepsIntegers decodes its input from JSON, as the bridge
// does, so every number reaches WriteItem as a float64.
func TestFormatTOML_KeepsIntegers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		input string
		want  string
	}{
		{"whole number", `{"replicas":3}`, "replicas = 3\n"},
		{"negative whole number", `{"offset":-7}`, "offset = -7\n"},
		{"fraction stays a float", `{"ratio":2.5}`, "ratio = 2.5\n"},
		{"2^53 is still an integer", `{"edge":9007199254740992}`, "edge = 9007199254740992\n"},
		{"beyond 2^53 stays a float", `{"big":18014398509481984}`, "big = 1.8014398509481984e+16\n"},
		{"nested table and array", `{"server":{"ports":[80,443]}}`, "[server]\nports = [80, 443]\n"},
		{"array of tables", `{"list":[{"a":1},{"a":2.5}]}`, "[[list]]\na = 1\n\n[[list]]\na = 2.5\n"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var data any
			if err := json.Unmarshal([]byte(tc.input), &data); err != nil {
				t.Fatalf("decode %s: %v", tc.input, err)
			}

			got, err := formatfx.TOMLFormat.WriteItem(data, &formatfx.FormatOptions{Document: true}) //nolint:exhaustruct
			if err != nil {
				t.Fatalf("WriteItem(%s): %v", tc.input, err)
			}

			if got != tc.want {
				t.Errorf("WriteItem(%s) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestFormatTOML_LeavesInputUnchanged(t *testing.T) {
	t.Parallel()

	data := map[string]any{"replicas": float64(3), "ports": []any{float64(80)}}

	if _, err := formatfx.TOMLFormat.WriteItem(data, nil); err != nil {
		t.Fatalf("WriteItem: %v", err)
	}

	if _, ok := data["replicas"].(float64); !ok {
		t.Errorf("data[replicas] is %T after WriteItem, want float64", data["replicas"])
	}

	if ports, _ := data["ports"].([]any); len(ports) != 1 || ports[0] != float64(80) {
		t.Errorf("data[ports] = %#v after WriteItem, want []any{float64(80)}", data["ports"])
	}
}

func TestFormatTOML_Separator(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		opts *formatfx.FormatOptions
		want string
	}{
		{"list entry ends with +++", nil, "name = \"app\"\n+++\n"},
		{"whole document has no +++", &formatfx.FormatOptions{Document: true}, "name = \"app\"\n"}, //nolint:exhaustruct
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := formatfx.TOMLFormat.WriteItem(map[string]any{"name": "app"}, tc.opts)
			if err != nil {
				t.Fatalf("WriteItem: %v", err)
			}

			if got != tc.want {
				t.Errorf("WriteItem = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestFormatYAML_WriteItem(t *testing.T) {
	t.Parallel()

	app := map[string]any{"name": "app", "server": map[string]any{"port": 80}}

	cases := []struct {
		name string
		opts *formatfx.FormatOptions
		want string
	}{
		{
			name: "list entry",
			opts: nil,
			want: "- name: app\n  server:\n    port: 80\n",
		},
		{
			name: "whole document",
			opts: &formatfx.FormatOptions{Document: true}, //nolint:exhaustruct
			want: "name: app\nserver:\n  port: 80\n",
		},
		{
			name: "whole document with indent 4",
			opts: &formatfx.FormatOptions{Document: true, Indent: 4}, //nolint:exhaustruct
			want: "name: app\nserver:\n    port: 80\n",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := formatfx.YAMLFormat.WriteItem(app, tc.opts)
			if err != nil {
				t.Fatalf("WriteItem: %v", err)
			}

			if got != tc.want {
				t.Errorf("WriteItem = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestFormatYAML_DocumentRoundtrip(t *testing.T) {
	t.Parallel()

	out, err := formatfx.YAMLFormat.WriteItem(
		map[string]any{"name": "app", "replicas": 3},
		&formatfx.FormatOptions{Document: true}, //nolint:exhaustruct
	)
	if err != nil {
		t.Fatalf("WriteItem: %v", err)
	}

	if strings.HasPrefix(out, "- ") {
		t.Fatalf("whole document written as a sequence entry: %q", out)
	}

	reader := formatfx.YAMLFormat.CreateReader(nil)
	_, _ = reader.Push(out)

	decoded, err := reader.Flush()
	if err != nil {
		t.Fatalf("Flush: %v", err)
	}

	if len(decoded) != 1 {
		t.Fatalf("expected 1 item, got %d: %v", len(decoded), decoded)
	}

	m, ok := decoded[0].(map[string]any)
	if !ok || m["name"] != "app" || m["replicas"] != 3 {
		t.Errorf("decoded = %#v, want map with name app and replicas 3", decoded[0])
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
