package noskillsserverfx

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// replayAll returns the lines a replay of ledger sends and the line count it
// reports.
func replayAll(t *testing.T, ledger *Ledger) ([]string, int64) {
	t.Helper()

	var lines []string

	count, err := ledger.replayLines(context.Background(), func(line []byte) bool {
		lines = append(lines, string(line))

		return true
	})
	require.NoError(t, err)

	return lines, count
}

// TestLedgerNumbersTheLinesOfAnExistingFile pins that a ledger written before
// lines were numbered, by any daemon version, opens with the numbering its
// replay gives: the next line appended gets the next number.
func TestLedgerNumbersTheLinesOfAnExistingFile(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		contents *string // nil: no file yet
		want     []string
		next     int64
	}{
		{name: "no file", contents: nil, want: []string{`{"n":"new"}`}, next: 1},
		{name: "an empty file", contents: new(""), want: []string{`{"n":"new"}`}, next: 1},
		{
			name:     "lines that end in a newline",
			contents: new("{\"n\":1}\n{\"n\":2}\n"),
			want:     []string{`{"n":1}`, `{"n":2}`, `{"n":"new"}`},
			next:     3,
		},
		{
			name:     "empty lines, which the replay skips",
			contents: new("\n{\"n\":1}\n\n\r\n{\"n\":2}\n"),
			want:     []string{`{"n":1}`, `{"n":2}`, `{"n":"new"}`},
			next:     3,
		},
		{
			name:     "a last line a write did not finish",
			contents: new("{\"n\":1}\n{\"n\":"),
			want:     []string{`{"n":1}`, `{"n":`, `{"n":"new"}`},
			next:     3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			path := filepath.Join(t.TempDir(), "session.jsonl")
			if tt.contents != nil {
				require.NoError(t, os.WriteFile(path, []byte(*tt.contents), 0o600))
			}

			ledger, err := openLedger(path)
			require.NoError(t, err)

			t.Cleanup(func() { _ = ledger.Close() })

			n, err := ledger.appendLine([]byte(`{"n":"new"}`), false)
			require.NoError(t, err)
			assert.Equal(t, tt.next, n, "the number of the appended line")

			lines, count := replayAll(t, ledger)
			assert.Equal(t, tt.want, lines)
			assert.Equal(t, tt.next, count, "the replay covers every line")
		})
	}
}

// TestLedgerReplayCoversTheLinesItStartedWith pins that a replay sends the
// lines the ledger held when it started and reports their count, so a line
// appended while it runs is the caller's to send live.
func TestLedgerReplayCoversTheLinesItStartedWith(t *testing.T) {
	t.Parallel()

	ledger, err := openLedger(filepath.Join(t.TempDir(), "session.jsonl"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = ledger.Close() })

	require.NoError(t, ledger.Append([]byte(`{"n":1}`)))
	require.NoError(t, ledger.Append([]byte(`{"n":2}`)))

	var (
		sent []string
		late int64
	)

	count, err := ledger.replayLines(context.Background(), func(line []byte) bool {
		if len(sent) == 0 {
			var appendErr error

			late, appendErr = ledger.appendLine([]byte(`{"n":3}`), false)
			require.NoError(t, appendErr)
		}

		sent = append(sent, string(line))

		return true
	})
	require.NoError(t, err)

	assert.Equal(t, []string{`{"n":1}`, `{"n":2}`}, sent)
	assert.Equal(t, int64(2), count)
	assert.Equal(t, int64(3), late, "the line appended during the replay")
}

// TestLedgerRefusesALineItCouldNotReadBack pins that an empty line and one
// with a newline, which a replay would skip or split, are not written.
func TestLedgerRefusesALineItCouldNotReadBack(t *testing.T) {
	t.Parallel()

	ledger, err := openLedger(filepath.Join(t.TempDir(), "session.jsonl"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = ledger.Close() })

	for _, line := range []string{"", "{\"n\":1}\n{\"n\":2}"} {
		_, err := ledger.appendLine([]byte(line), false)
		assert.True(t, errors.Is(err, errLedgerLine), "appendLine(%q) = %v, want errLedgerLine", line, err)
	}

	lines, count := replayAll(t, ledger)
	assert.Empty(t, lines)
	assert.Zero(t, count)
}
