// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
)

// The dashboard events are the append-only JSON lines log at
// .eser/.state/events/events.jsonl (dashboard/events.ts). Each event is an
// object with ts, type, spec and user, plus whatever fields its type adds,
// so events are kept as JSObjects and printed back with their key order.

// Dashboard event types the dashboard reads or writes.
const (
	DashboardEventPhaseChange  = "phase-change"
	DashboardEventMention      = "mention"
	DashboardEventMentionReply = "mention-reply"
	DashboardEventSignoff      = "signoff"
	DashboardEventNote         = "note"
)

// AppendDashboardEvent adds one event to the events log, creating the log
// and its directory when they are missing.
func AppendDashboardEvent(root string, event *JSObject) error {
	if err := appendEvent(root, event); err != nil {
		return fmt.Errorf("append a dashboard event: %w", err)
	}

	return nil
}

// ReadDashboardEvents is readEvents: the events whose line parses as a JSON
// object, newest first. since keeps the events whose ts sorts after it ("" keeps
// all); limit keeps the first limit of them (0 or less keeps all). A missing
// log has no events.
func ReadDashboardEvents(root string, limit int, since string) []*JSObject {
	data, err := os.ReadFile(filepath.Join(root, eventsFile)) //nolint:gosec // G304: the events log of the project
	if err != nil {
		return nil
	}

	events := parseEventLines(bytes.TrimSpace(data))

	if since != "" {
		events = slices.DeleteFunc(events, func(event *JSObject) bool {
			return event.str("ts") <= since
		})
	}

	slices.Reverse(events)

	if limit > 0 && len(events) > limit {
		events = events[:limit]
	}

	return events
}

// parseEventLines parses each non-empty line of data, skipping the lines that
// are not a JSON object.
func parseEventLines(data []byte) []*JSObject {
	var events []*JSObject

	for line := range bytes.SplitSeq(data, []byte("\n")) {
		if len(line) == 0 {
			continue
		}

		parsed, err := parseJSON(string(line))
		if err != nil {
			continue
		}

		if event, ok := parsed.(*JSObject); ok {
			events = append(events, event)
		}
	}

	return events
}

// DashboardEventTail reads the events appended to the log after it was
// created, the way watchEvents does. It is not safe for concurrent use; the
// caller polls it on its own schedule.
type DashboardEventTail struct {
	path string
	// offset is how far the log has been read, always just after a newline
	// or at the size the log had when the tail was created.
	offset int64
}

// NewDashboardEventTail starts a tail at the current end of the log, so only
// events appended from now on are read. A missing log starts at 0.
func NewDashboardEventTail(root string) *DashboardEventTail {
	tail := &DashboardEventTail{path: filepath.Join(root, eventsFile), offset: 0}

	if info, err := os.Stat(tail.path); err == nil {
		tail.offset = info.Size()
	}

	return tail
}

// Poll returns the events completed since the last call, oldest first. A line
// that does not end with a newline yet is left for a later call. A log that
// is shorter than what was read (rewritten or truncated) is read again only
// once it grows past that point, as watchEvents does, so a log that appendEvent
// is rewriting is not replayed from the start. A log that cannot be read
// yields no events and is tried again on the next call.
func (t *DashboardEventTail) Poll() ([]*JSObject, error) {
	file, err := os.Open(t.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}

		return nil, fmt.Errorf("open the dashboard events log: %w", err)
	}
	defer file.Close() //nolint:errcheck // read-only

	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("stat the dashboard events log: %w", err)
	}

	if info.Size() <= t.offset {
		return nil, nil
	}

	fresh := make([]byte, info.Size()-t.offset)

	read, err := file.ReadAt(fresh, t.offset)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("read the dashboard events log: %w", err)
	}

	fresh = fresh[:read]

	complete := bytes.LastIndexByte(fresh, '\n')
	if complete < 0 {
		return nil, nil
	}

	t.offset += int64(complete) + 1

	return parseEventLines(fresh[:complete]), nil
}
