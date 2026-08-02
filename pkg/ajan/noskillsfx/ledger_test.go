// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func writeLedgerFixture(t *testing.T, root, spec, ledger, summary string) {
	t.Helper()

	p := noskillsfx.NewPaths(root)
	if err := os.MkdirAll(p.LedgerRunDir(spec), 0o755); err != nil {
		t.Fatalf("mkdir ledger dir: %v", err)
	}

	if ledger != "" {
		if err := os.WriteFile(p.LedgerFile(spec), []byte(ledger), 0o600); err != nil {
			t.Fatalf("write ledger: %v", err)
		}
	}

	if summary != "" {
		if err := os.WriteFile(p.LedgerSummaryFile(spec), []byte(summary), 0o600); err != nil {
			t.Fatalf("write summary: %v", err)
		}
	}
}

func TestReadLedgerRaw_Missing(t *testing.T) {
	t.Parallel()

	records, err := noskillsfx.ReadLedgerRaw(t.TempDir(), "nope")
	if err != nil {
		t.Fatalf("expected no error for missing ledger, got %v", err)
	}

	if len(records) != 0 {
		t.Fatalf("expected empty records, got %d", len(records))
	}
}

func TestReadLedgerRaw_SkipsBlankAndMalformedLines(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	content := `{"id":"a","category":"scope"}
not-json

{"id":"b","category":"out-of-scope"}
`
	writeLedgerFixture(t, root, "s", content, "")

	records, err := noskillsfx.ReadLedgerRaw(root, "s")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(records) != 2 {
		t.Fatalf("expected 2 valid records, got %d", len(records))
	}

	// Records are relayed verbatim as raw JSON.
	if string(records[0]) != `{"id":"a","category":"scope"}` {
		t.Fatalf("record 0 mismatch: %s", string(records[0]))
	}
}

func TestReadSummaryRaw_MissingAndPresent(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	if got := noskillsfx.ReadSummaryRaw(root, "s"); got != nil {
		t.Fatalf("expected nil for missing summary, got %s", string(got))
	}

	summary := `{"resolved_decisions":3}`
	writeLedgerFixture(t, root, "s", "", summary)

	got := noskillsfx.ReadSummaryRaw(root, "s")
	if string(got) != summary {
		t.Fatalf("summary mismatch: %s", string(got))
	}
}

func TestLedgerPaths(t *testing.T) {
	t.Parallel()

	p := noskillsfx.NewPaths(filepath.FromSlash("/proj"))

	wantDir := filepath.FromSlash("/proj/.eser/.state/progresses/ledger/my-spec")
	if p.LedgerRunDir("my-spec") != wantDir {
		t.Fatalf("LedgerRunDir = %q, want %q", p.LedgerRunDir("my-spec"), wantDir)
	}

	wantFile := filepath.Join(wantDir, "ledger.jsonl")
	if p.LedgerFile("my-spec") != wantFile {
		t.Fatalf("LedgerFile = %q, want %q", p.LedgerFile("my-spec"), wantFile)
	}

	wantSummary := filepath.Join(wantDir, "summary.json")
	if p.LedgerSummaryFile("my-spec") != wantSummary {
		t.Fatalf("LedgerSummaryFile = %q, want %q", p.LedgerSummaryFile("my-spec"), wantSummary)
	}
}
