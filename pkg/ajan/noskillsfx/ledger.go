package noskillsfx

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// =============================================================================
// Decision-ledger paths + raw readers (mirrors decision-ledger.ts)
// =============================================================================
//
// The decision ledger is produced by the TypeScript engine under
// .eser/.state/progresses/ledger/<spec>/{ledger.jsonl,summary.json}. The Go
// side only READS it, and relays the records as raw JSON so the on-disk schema
// (owned by decision-ledger.ts) is never duplicated here and cannot drift.

// LedgerRunDir returns the per-spec decision-ledger directory.
func (p Paths) LedgerRunDir(specName string) string {
	return filepath.Join(p.ProgressesDir, "ledger", specName)
}

// LedgerFile returns the append-only decision-ledger JSONL path for a spec.
func (p Paths) LedgerFile(specName string) string {
	return filepath.Join(p.LedgerRunDir(specName), "ledger.jsonl")
}

// LedgerSummaryFile returns the maturity-summary JSON path for a spec.
func (p Paths) LedgerSummaryFile(specName string) string {
	return filepath.Join(p.LedgerRunDir(specName), "summary.json")
}

// ReadLedgerRaw reads the per-spec decision ledger as raw JSON records. A
// missing file yields an empty slice (not an error); blank or malformed lines
// are skipped, mirroring the resilience of the TS readLedger.
func ReadLedgerRaw(root, specName string) ([]json.RawMessage, error) {
	p := NewPaths(root)

	data, err := os.ReadFile(p.LedgerFile(specName))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []json.RawMessage{}, nil
		}

		return nil, fmt.Errorf("readLedger: %w", err)
	}

	records := []json.RawMessage{}

	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}

		var record json.RawMessage
		if json.Unmarshal(line, &record) != nil {
			continue // skip malformed line
		}

		records = append(records, record)
	}

	return records, nil
}

// ReadSummaryRaw reads the per-spec maturity summary as raw JSON. A missing or
// unparseable file yields nil (which marshals to JSON null), never an error.
func ReadSummaryRaw(root, specName string) json.RawMessage {
	p := NewPaths(root)

	data, err := os.ReadFile(p.LedgerSummaryFile(specName))
	if err != nil {
		return nil
	}

	var raw json.RawMessage
	if json.Unmarshal(data, &raw) != nil {
		return nil
	}

	return raw
}
