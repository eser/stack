// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

const (
	// DefaultScrollback is the number of history lines a terminal keeps
	// unless [WithScrollback] says otherwise; the browser dashboard's
	// xterm.js keeps the same.
	DefaultScrollback = 5000
	// DefaultScrollbackBytes bounds the memory of a terminal's history unless
	// [WithScrollbackBytes] says otherwise. Ordinary output at 240 columns
	// stays far below it with 5000 lines (see the package README); it stops a
	// stream of huge cells, such as long runs of combining marks, from holding
	// hundreds of megabytes.
	DefaultScrollbackBytes = 16 << 20
)

// WithScrollback sets how many lines that leave the top of the normal screen
// the terminal keeps as history. Zero keeps none; negative values are zero.
func WithScrollback(lines int) Option {
	return func(t *Terminal) {
		t.scrollback = max(lines, 0)
	}
}

// WithScrollbackBytes bounds the memory the history holds, counting each
// line's text, runs and bookkeeping; the oldest lines go first when it is
// exceeded. Zero or negative values keep the default.
func WithScrollbackBytes(n int) Option {
	return func(t *Terminal) {
		if n > 0 {
			t.scrollbackBytes = n
		}
	}
}

// HistoryLine is one line of history: its runs (see [Run]) and whether it
// continues the line above because the text wrapped there.
type HistoryLine struct {
	Runs    []Run `json:"runs"`
	Wrapped bool  `json:"wrapped,omitempty"`
}

// HistoryStamp counts the changes to a terminal's history since it was
// created: Added is every line added at the bottom, Rewrites every time the
// history was rewritten (a resize re-wrapped it or moved lines between it and
// the screen, ED 3 or RIS cleared it). Unlike [Terminal.DrainHistory] it
// costs nothing to read and any number of consumers can keep their own copy:
// with the same Rewrites, the lines added since an earlier stamp are the last
// Added - earlier.Added of the history, as long as that many are still there.
type HistoryStamp struct {
	Added    uint64 `json:"added"`
	Rewrites uint64 `json:"rewrites"`
}

// HistoryUpdate is what changed in the history since the last
// [Terminal.DrainHistory].
//
// Without Reset, Lines are the lines added at the bottom of the history,
// oldest first; a copy that keeps the same limits drops as many from its top.
// With Reset the history was rewritten: a resize re-wrapped it or moved lines
// between it and the screen, ED 3 cleared it, or a full reset (RIS) did.
// Lines then holds the whole history, and a copy is replaced by it.
type HistoryUpdate struct {
	Reset bool          `json:"reset,omitempty"`
	Lines []HistoryLine `json:"lines"`
}

// history keeps the lines that left the top of the normal screen, packed,
// in a ring bounded by a line count and a byte count.
type history struct {
	ring     []line
	start    int
	count    int
	bytes    int
	maxLines int
	maxBytes int

	// added counts lines pushed since the last drain; reset says the history
	// was rewritten since then.
	added int
	reset bool

	// stamp counts every line added and every rewrite, for consumers that
	// track the history without draining it.
	stamp HistoryStamp

	builder runBuilder
}

func newHistory(maxLines, maxBytes int) *history {
	return &history{maxLines: maxLines, maxBytes: maxBytes}
}

func (h *history) at(i int) *line {
	return &h.ring[(h.start+i)%len(h.ring)]
}

// grow makes room for one more line, up to maxLines slots.
func (h *history) grow() {
	size := min(h.maxLines, max(64, 2*len(h.ring)))
	ring := make([]line, size)

	for i := range h.count {
		ring[i] = *h.at(i)
	}

	h.ring = ring
	h.start = 0
}

// evictOldest drops the oldest line.
func (h *history) evictOldest() {
	l := h.at(0)
	h.bytes -= l.packedBytes()
	*l = line{}
	h.start = (h.start + 1) % len(h.ring)
	h.count--

	if h.added > h.count {
		h.added = h.count
	}
}

// push adds a packed copy of l at the bottom, dropping the oldest lines past
// the limits; l itself is left as it is. It returns how many lines left the
// history, l included when it alone is larger than the byte limit.
func (h *history) push(src *line) int {
	if h.maxLines == 0 {
		return 1
	}

	l := &line{cells: src.cells, wrapped: src.wrapped, packed: src.packed, cols: src.cols, text: src.text, runs: src.runs}
	l.pack(&h.builder)

	if l.packedBytes() > h.maxBytes {
		return 1
	}

	evicted := 0

	if h.count == h.maxLines {
		h.evictOldest()

		evicted++
	}

	if h.count == len(h.ring) {
		h.grow()
	}

	*h.at(h.count) = *l
	h.count++
	h.bytes += l.packedBytes()
	h.added++
	h.stamp.Added++

	for h.bytes > h.maxBytes && h.count > 1 {
		h.evictOldest()

		evicted++
	}

	return evicted
}

// lines returns pointers to every line, oldest first. They point into the
// ring, which [history.replace] then discards.
func (h *history) lines() []*line {
	out := make([]*line, h.count)
	for i := range out {
		out[i] = h.at(i)
	}

	return out
}

// replace makes lines the whole history, packing them and dropping the
// oldest past the byte limit (the caller keeps lines within maxLines). It
// returns how many were dropped.
func (h *history) replace(lines []*line) int {
	h.ring = nil
	h.start = 0
	h.count = 0
	h.bytes = 0

	if len(lines) > 0 {
		h.ring = make([]line, len(lines))
	}

	for i, l := range lines {
		l.pack(&h.builder)
		h.ring[i] = *l
		h.bytes += l.packedBytes()
	}

	h.count = len(lines)

	dropped := 0

	for (h.bytes > h.maxBytes || h.count > h.maxLines) && h.count > 0 {
		h.evictOldest()

		dropped++
	}

	h.added = 0
	h.reset = true
	h.stamp.Rewrites++

	return dropped
}

// clear drops every line.
func (h *history) clear() {
	if h.count > 0 || h.added > 0 {
		h.reset = true
		h.stamp.Rewrites++
	}

	h.ring = nil
	h.start = 0
	h.count = 0
	h.bytes = 0
	h.added = 0
}

func historyLineOf(l *line) HistoryLine {
	return HistoryLine{Runs: publicRuns(l.text, l.runs), Wrapped: l.wrapped}
}

// export returns lines [from, to) as HistoryLine values.
func (h *history) export(from, to int) []HistoryLine {
	from = min(max(from, 0), h.count)
	to = min(max(to, from), h.count)

	out := make([]HistoryLine, 0, to-from)
	for i := from; i < to; i++ {
		out = append(out, historyLineOf(h.at(i)))
	}

	return out
}

// drain reports what changed since the last drain and starts over.
func (h *history) drain() HistoryUpdate {
	var update HistoryUpdate

	if h.reset {
		update = HistoryUpdate{Reset: true, Lines: h.export(0, h.count)}
	} else {
		update = HistoryUpdate{Lines: h.export(h.count-h.added, h.count)}
	}

	h.reset = false
	h.added = 0

	return update
}

// HistoryLen is the number of lines of history the terminal holds.
func (t *Terminal) HistoryLen() int {
	return t.history.count
}

// HistoryBytes is the memory the history holds, as its byte limit counts it.
func (t *Terminal) HistoryBytes() int {
	return t.history.bytes
}

// History returns history lines [from, to), oldest first, clamped to the
// lines there are. History(HistoryLen()-n, HistoryLen()) is the most recent
// n lines.
func (t *Terminal) History(from, to int) []HistoryLine {
	return t.history.export(from, to)
}

// HistoryStamp returns the history's change counters (see [HistoryStamp]).
func (t *Terminal) HistoryStamp() HistoryStamp {
	return t.history.stamp
}

// DrainHistory returns what changed in the history since the last call (or
// since the terminal was created): the lines added, or the whole history
// when it was rewritten. The server calls it each time it sends a frame.
func (t *Terminal) DrainHistory() HistoryUpdate {
	return t.history.drain()
}
