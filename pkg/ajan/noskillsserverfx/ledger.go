package noskillsserverfx

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
)

// errLedgerLine refuses a line the ledger could not read back as one line.
var errLedgerLine = errors.New("a ledger line must be non-empty and hold no newline")

// Ledger is an append-only JSONL file for a session. Each line is a complete
// JSON object in the client wire format, suitable for replaying verbatim.
//
// Lines are numbered from 1 in the order they were appended, as Replay sends
// them: empty lines are not counted. The numbers are not stored; openLedger
// counts the lines a ledger already holds, so a file written by any daemon
// version opens with the same numbering.
//
// Write concurrency: Append and AppendSync are safe for concurrent callers.
// Replay opens a separate read-only file descriptor so the write position is
// never disturbed.
type Ledger struct {
	mu   sync.Mutex
	path string   // kept for opening replay copies
	file *os.File // opened with O_APPEND; write position always at EOF
	bw   *bufio.Writer

	// lines is the number of lines in the file, guarded by mu.
	lines int64

	// syncs counts completed fdatasyncs.
	//
	// It exists because the durability split is otherwise unobservable: Append
	// and AppendSync leave identical bytes in the file, so a caller that picks
	// the wrong one is invisible to any test that reads the file back. It is
	// also the cost worth knowing about -- fdatasync is the expensive part of a
	// write-tool decision.
	syncs atomic.Int64
}

// Syncs reports how many times this ledger has fdatasynced.
func (l *Ledger) Syncs() int64 { return l.syncs.Load() }

// openLedger creates parent directories then opens (or creates) the JSONL
// ledger at path with O_APPEND. Existing content is preserved, and its lines
// are counted so the next line appended gets the next number. A last line
// without its newline, left by a write that did not finish, gets one, so the
// next line does not run on from it.
func openLedger(path string) (*Ledger, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("ledger mkdirall: %w", err)
	}

	lines, unterminated, err := countLedgerLines(path)
	if err != nil {
		return nil, err
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600) //nolint:gosec // path from ledgerPath helper, not user input
	if err != nil {
		return nil, fmt.Errorf("ledger open: %w", err)
	}

	if unterminated {
		if _, err := f.Write([]byte{'\n'}); err != nil {
			_ = f.Close()

			return nil, fmt.Errorf("ledger end the last line of %q: %w", path, err)
		}
	}

	return &Ledger{
		path:  path,
		file:  f,
		bw:    bufio.NewWriterSize(f, 64*1024),
		lines: lines,
	}, nil
}

// countLedgerLines counts the lines of the ledger at path the way Replay
// sends them, and reports whether its last line lacks a newline. A missing
// file holds none.
func countLedgerLines(path string) (int64, bool, error) {
	rf, err := os.Open(path) //nolint:gosec // path from ledgerPath helper, not user input
	if errors.Is(err, os.ErrNotExist) {
		return 0, false, nil
	}

	if err != nil {
		return 0, false, fmt.Errorf("ledger open %q to count its lines: %w", path, err)
	}

	defer func() { _ = rf.Close() }()

	var (
		lines  int64
		length int  // bytes of the current line so far
		lastCR bool // its last byte is '\r', which Replay drops
		buf    = make([]byte, 64*1024)
	)

	// ended counts the current line when Replay would send it: a line that
	// is empty, or only a '\r', it skips.
	ended := func() {
		if length > 1 || (length == 1 && !lastCR) {
			lines++
		}

		length, lastCR = 0, false
	}

	for {
		n, err := rf.Read(buf)

		for _, b := range buf[:n] {
			if b == '\n' {
				ended()

				continue
			}

			length++
			lastCR = b == '\r'
		}

		if errors.Is(err, io.EOF) {
			break
		}

		if err != nil {
			return 0, false, fmt.Errorf("ledger count the lines of %q: %w", path, err)
		}
	}

	unterminated := length > 0
	ended()

	return lines, unterminated, nil
}

// Append writes line + '\n' to the ledger and flushes the bufio buffer.
// No fsync — suitable for read-only tool events where a small data loss
// window is acceptable (per the per-tool durability contract).
func (l *Ledger) Append(line []byte) error {
	_, err := l.appendLine(line, false)

	return err
}

// AppendSync writes line + '\n', flushes, and calls fdatasync before returning.
// Use this for write-tool permission decisions (eng-review durability contract):
// the worker must not execute a write tool until the decision is on disk.
func (l *Ledger) AppendSync(line []byte) error {
	_, err := l.appendLine(line, true)

	return err
}

// appendLine writes line + '\n' and flushes, then fdatasyncs when durable,
// and returns the number of the line in the ledger. A line that reached the
// file keeps its number when the sync fails: it is returned with the error.
func (l *Ledger) appendLine(line []byte, durable bool) (int64, error) {
	if len(line) == 0 || bytes.IndexByte(line, '\n') >= 0 {
		return 0, errLedgerLine
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if _, err := l.bw.Write(line); err != nil {
		return 0, fmt.Errorf("ledger write: %w", err)
	}

	if err := l.bw.WriteByte('\n'); err != nil {
		return 0, fmt.Errorf("ledger newline: %w", err)
	}

	if err := l.bw.Flush(); err != nil {
		return 0, fmt.Errorf("ledger flush: %w", err)
	}

	l.lines++

	if !durable {
		return l.lines, nil
	}

	if err := l.file.Sync(); err != nil {
		return l.lines, fmt.Errorf("ledger sync: %w", err)
	}

	l.syncs.Add(1)

	return l.lines, nil
}

// lineCount returns how many lines the ledger holds. Every append flushes, so
// all of them are in the file.
func (l *Ledger) lineCount() int64 {
	l.mu.Lock()
	defer l.mu.Unlock()

	return l.lines
}

// Replay opens a fresh read-only file descriptor and calls send for each line.
// The write descriptor's append position is never disturbed.
// send receives the raw bytes of one JSON line (no trailing newline).
// If send returns false, iteration stops early.
// If ctx is cancelled, Replay returns ctx.Err().
func (l *Ledger) Replay(ctx context.Context, send func([]byte) bool) error {
	_, err := l.replayLines(ctx, send)

	return err
}

// replayLines is Replay for the lines the ledger holds when it starts, and
// returns how many that is: lines 1 to that number are the ones it covers,
// and a line appended later gets a higher one.
func (l *Ledger) replayLines(ctx context.Context, send func([]byte) bool) (int64, error) {
	// Flush any buffered writes so the reader sees the latest data.
	l.mu.Lock()
	if err := l.bw.Flush(); err != nil {
		l.mu.Unlock()

		return 0, fmt.Errorf("ledger flush before replay: %w", err)
	}

	lines := l.lines
	l.mu.Unlock()

	if lines == 0 {
		return 0, nil // empty/new session — nothing to replay
	}

	// Open a separate read-only file descriptor from position 0.
	rf, err := os.Open(l.path) //nolint:gosec // l.path set by ledgerPath at ledger creation
	if err != nil {
		return lines, fmt.Errorf("ledger open for replay: %w", err)
	}

	defer func() { _ = rf.Close() }()

	scanner := bufio.NewScanner(rf)
	scanner.Buffer(make([]byte, 1<<20), 1<<20) // 1 MB per line

	var read int64

	for read < lines && scanner.Scan() {
		if ctx.Err() != nil {
			return lines, ctx.Err()
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		read++

		if !send(line) {
			return lines, nil
		}
	}

	if err := scanner.Err(); err != nil {
		return lines, fmt.Errorf("ledger replay: %w", err)
	}

	if read < lines {
		return lines, fmt.Errorf("ledger replay: %q holds %d of its %d lines", l.path, read, lines)
	}

	return lines, nil
}

// Close flushes and closes the ledger file. Called by the pump goroutine when
// the worker process exits.
func (l *Ledger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	_ = l.bw.Flush()

	return l.file.Close()
}

// sessionDir returns the per-project directory holding a session's files.
// The project root is encoded as hex(sha256(projectRoot))[:16] — 16 hex chars
// provide 64-bit collision resistance, which is ample for a personal daemon.
func sessionDir(dataDir, projectRoot string) string {
	sum := sha256.Sum256([]byte(projectRoot))
	encoded := hex.EncodeToString(sum[:])[:16]

	return filepath.Join(dataDir, "sessions", encoded)
}

// ledgerPath returns the JSONL path for (dataDir, projectRoot, sid).
func ledgerPath(dataDir, projectRoot, sid string) string {
	return filepath.Join(sessionDir(dataDir, projectRoot), sid+".jsonl")
}
