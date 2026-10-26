package aifx

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// jsonlMaxLineBytes caps one line of a JSONL stream. An Ollama stream line is
// one token delta or the final counters, far below this.
const jsonlMaxLineBytes = 1 << 20

// ParseJsonlStream reads a JSONL stream line by line and sends each parsed
// message to the provided event channel. Malformed lines are silently skipped.
// A read failure, including a line longer than jsonlMaxLineBytes, ends the
// stream with an error event instead of a silent stop.
//
// This lived in cli_shared.go, which was misleading: its only remaining caller
// is the Ollama HTTP adapter, and deleting that file wholesale along with the
// CLI adapters would have broken Ollama streaming.
func ParseJsonlStream(
	ctx context.Context,
	reader io.Reader,
	eventCh chan<- StreamEvent,
	mapFn func(json.RawMessage) *StreamEvent,
) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(nil, jsonlMaxLineBytes)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// Validate as JSON before passing to mapper.
		if !json.Valid([]byte(line)) {
			continue
		}

		event := mapFn(json.RawMessage(line))
		if event != nil {
			sendStreamEvent(ctx, eventCh, *event)
		}
	}

	if err := scanner.Err(); err != nil {
		sendStreamEvent(ctx, eventCh, newStreamEventError(
			fmt.Errorf("read jsonl stream (line limit %d bytes): %w", jsonlMaxLineBytes, err),
		))
	}
}
