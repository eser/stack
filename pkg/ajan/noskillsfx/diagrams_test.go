// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// The hashes are hashContent's in dashboard/diagrams.ts, run under Node.
func TestDiagramHashMatchesTypeScript(t *testing.T) {
	t.Parallel()

	cases := []struct{ content, want string }{
		{"", "0"},
		{"a", "2p"},
		{"graph TD\n  A --> B\n", "gzya3z"},
		{"😀 emoji and ünïcödé", "p1n61h"},
		{strings.Repeat("x", 1000), "sdbd34"},
	}

	for _, tc := range cases {
		if got := diagramHash(tc.content); got != tc.want {
			t.Errorf("diagramHash(%.20q) = %s, want %s", tc.content, got, tc.want)
		}
	}
}

func TestDiagramReferences(t *testing.T) {
	t.Parallel()

	// A file path does not also yield its prefix as a module name.
	got := stringsOf(diagramReferences("A[src/login.ts] --> B[dashboard/state] --> C[@eserstack/noskills] --> " +
		"src/login.ts --> pkg/@eserstack/noskills/main.ts"))
	want := []string{"src/login.ts", "pkg/@eserstack/noskills/main.ts", "dashboard/state", "@eserstack/noskills"}

	if !slices.Equal(got, want) {
		t.Errorf("diagramReferences = %v, want %v", got, want)
	}
}

// One box drawing is one entry, not one per line it spans.
func TestScanMarkdownDiagramsTakesADrawingOnce(t *testing.T) {
	t.Parallel()

	content := "# Architecture\n\n┌──────────┐    ┌──────────┐\n│ main.go  │───▶│ store.go │\n" +
		"└──────────┘    └──────────┘\n\n┌────┐\n│ db │\n└────┘\n"

	entries := scanMarkdownDiagrams("arch.md", content, "2026-01-01T00:00:00.000Z")
	lines := make([]float64, 0, len(entries))

	for _, entry := range entries {
		lines = append(lines, entry.num("line"))
	}

	if !slices.Equal(lines, []float64{3, 7}) {
		t.Errorf("entries at lines %v, want [3 7]", lines)
	}
}

func TestWriteDiagramRegistryCreatesTheEserDirectory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := WriteDiagramRegistry(root, []any{}); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(root, ".eser", "diagrams.json")) //nolint:gosec // G304: the test's temp dir
	if err != nil || string(data) != "[]\n" {
		t.Errorf("registry %q, %v", data, err)
	}
}

func TestScanDiagramsStaysInTheProject(t *testing.T) {
	t.Parallel()

	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.md"), []byte("```mermaid\nA --> other/thing\n```\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "linked")); err != nil {
		t.Skipf("symlinks: %v", err)
	}

	if err := os.Symlink(filepath.Join(outside, "secret.md"), filepath.Join(root, "secret.md")); err != nil {
		t.Fatal(err)
	}

	entries, err := ScanDiagrams(root, time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}

	if len(entries) != 0 {
		t.Errorf("the scan followed a symlink out of the project: %v", entries)
	}
}

func TestVerifyDiagramAndStaleness(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".eser"), 0o750); err != nil {
		t.Fatal(err)
	}

	registry := `[{"file":"a.md","line":3,"type":"mermaid","hash":"x","referencedFiles":["store.go","api/client"],"lastVerified":"2020-01-01T00:00:00.000Z"},` +
		`{"file":"a.md","line":9,"type":"ascii","hash":"y","referencedFiles":[],"lastVerified":"2020-01-01T00:00:00.000Z"},` +
		`{"file":"b.md","line":1,"type":"mermaid","hash":"z","referencedFiles":["api/client"],"lastVerified":"2020-01-01T00:00:00.000Z"}]`
	if err := os.WriteFile(filepath.Join(root, ".eser", "diagrams.json"), []byte(registry), 0o600); err != nil {
		t.Fatal(err)
	}

	// a.md:3 names two modified files and is reported once, for the first.
	stale := CheckDiagramStaleness(root, []string{"./pkg/store.go", "pkg/store.go", "api/client/http.ts"})
	if len(stale) != 2 || stale[0].Reason != "pkg/store.go was modified but diagram references store.go" ||
		stale[1].File != "b.md" || stale[1].Reason != "api/client/http.ts was modified but diagram references api/client" {
		t.Errorf("CheckDiagramStaleness = %+v", stale)
	}

	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	for _, tc := range []struct {
		line           int
		hasLine, valid bool
		want           bool
	}{
		{line: 4, hasLine: true, valid: true, want: false},
		{line: 0, hasLine: true, valid: false, want: false},
		{line: 9, hasLine: true, valid: true, want: true},
	} {
		found, err := VerifyDiagram(root, "a.md", tc.line, tc.hasLine, tc.valid, now)
		if err != nil || found != tc.want {
			t.Errorf("VerifyDiagram(line %d, %v, %v) = %v, %v; want %v", tc.line, tc.hasLine, tc.valid, found, err, tc.want)
		}
	}

	entries := objectsOf(ReadDiagramRegistry(root))
	if entries[0].str("lastVerified") != "2020-01-01T00:00:00.000Z" || entries[1].str("lastVerified") != "2026-01-01T00:00:00.000Z" {
		t.Errorf("registry after verify: %s", jsonStringify(ReadDiagramRegistry(root)))
	}
}
