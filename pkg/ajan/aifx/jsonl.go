package aifx

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"strings"
)

// ParseJsonlStream reads a JSONL stream line by line and sends each parsed
// message to the provided event channel. Malformed lines are silently skipped.
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
}
