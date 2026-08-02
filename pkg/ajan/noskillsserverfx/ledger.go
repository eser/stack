package noskillsserverfx

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Ledger is an append-only JSONL file for a session. Each line is a complete
// JSON object in the client wire format, suitable for replaying verbatim.
//
// Write concurrency: Append and AppendSync are safe for concurrent callers.
// Replay opens a separate read-only file descriptor so the write position is
// never disturbed.
type Ledger struct {
	mu   sync.Mutex
	path string   // kept for opening replay copies
	file *os.File // opened with O_APPEND; write position always at EOF
	bw   *bufio.Writer
}

// openLedger creates parent directories then opens (or creates) the JSONL
// ledger at path with O_APPEND. Existing content is preserved.
func openLedger(path string) (*Ledger, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("ledger mkdirall: %w", err)
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600) //nolint:gosec // path from ledgerPath helper, not user input
	if err != nil {
		return nil, fmt.Errorf("ledger open: %w", err)
	}

	return &Ledger{
		path: path,
		file: f,
		bw:   bufio.NewWriterSize(f, 64*1024),
	}, nil
}

// Append writes line + '\n' to the ledger and flushes the bufio buffer.
// No fsync — suitable for read-only tool events where a small data loss
// window is acceptable (per the per-tool durability contract).
func (l *Ledger) Append(line []byte) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if _, err := l.bw.Write(line); err != nil {
		return fmt.Errorf("ledger write: %w", err)
	}

	if err := l.bw.WriteByte('\n'); err != nil {
		return fmt.Errorf("ledger newline: %w", err)
	}

	return l.bw.Flush()
}

// AppendSync writes line + '\n', flushes, and calls fdatasync before returning.
// Use this for write-tool permission decisions (eng-review durability contract):
// the worker must not execute a write tool until the decision is on disk.
func (l *Ledger) AppendSync(line []byte) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if _, err := l.bw.Write(line); err != nil {
		return fmt.Errorf("ledger write: %w", err)
	}

	if err := l.bw.WriteByte('\n'); err != nil {
		return fmt.Errorf("ledger newline: %w", err)
	}

	if err := l.bw.Flush(); err != nil {
		return fmt.Errorf("ledger flush: %w", err)
	}

	return l.file.Sync()
}

// Replay opens a fresh read-only file descriptor and calls send for each line.
// The write descriptor's append position is never disturbed.
// send receives the raw bytes of one JSON line (no trailing newline).
// If send returns false, iteration stops early.
// If ctx is cancelled, Replay returns ctx.Err().
func (l *Ledger) Replay(ctx context.Context, send func([]byte) bool) error {
	// Flush any buffered writes so the reader sees the latest data.
	l.mu.Lock()
	if err := l.bw.Flush(); err != nil {
		l.mu.Unlock()

		return fmt.Errorf("ledger flush before replay: %w", err)
	}

	l.mu.Unlock()

	// Open a separate read-only file descriptor from position 0.
	rf, err := os.Open(l.path) //nolint:gosec // l.path set by ledgerPath at ledger creation
	if err != nil {
		if os.IsNotExist(err) {
			return nil // empty/new session — nothing to replay
		}

		return fmt.Errorf("ledger open for replay: %w", err)
	}

	defer func() { _ = rf.Close() }()

	scanner := bufio.NewScanner(rf)
	scanner.Buffer(make([]byte, 1<<20), 1<<20) // 1 MB per line

	for scanner.Scan() {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		if !send(line) {
			return nil
		}
	}

	return scanner.Err()
}

// Close flushes and closes the ledger file. Called by the pump goroutine when
// the worker process exits.
func (l *Ledger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	_ = l.bw.Flush()

	return l.file.Close()
}

// ledgerPath returns the JSONL path for (dataDir, projectRoot, sid).
// The project root is encoded as hex(sha256(projectRoot))[:16] — 16 hex chars
// provide 64-bit collision resistance, which is ample for a personal daemon.
func ledgerPath(dataDir, projectRoot, sid string) string {
	sum := sha256.Sum256([]byte(projectRoot))
	encoded := hex.EncodeToString(sum[:])[:16]

	return filepath.Join(dataDir, "sessions", encoded, sid+".jsonl")
}
