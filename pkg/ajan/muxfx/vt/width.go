// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

//go:generate go run gen_unicode_tables.go -ucd ../../../../etc/temp/muxfx-vt/ucd-15.1.0

// Cell widths and grapheme clusters follow Unicode 15.1 (unicodeVersion in
// unicode_tables.go, generated from the Unicode Character Database by
// gen_unicode_tables.go):
//
//   - A code point is 2 cells wide when its East Asian Width is W or F or it
//     has Emoji_Presentation, 0 when it is a nonspacing, enclosing or format
//     mark (Mn, Me, Cf), a grapheme extender, a zero width joiner or a Hangul
//     medial vowel or final consonant, and 1 otherwise. Ambiguous widths are
//     narrow. U+00AD SOFT HYPHEN is 1, as in glibc's wcwidth and xterm.js.
//   - Code points join into extended grapheme clusters by the rules of UAX
//     #29 (GB3 to GB13, with 15.1's Indic conjunct rule GB9c), and a cluster
//     takes one cell group: its width is that of its widest part. A variation
//     selector after a character that has emoji variation sequences makes it
//     2 wide (VS16, U+FE0F) or 1 wide (VS15, U+FE0E).
//   - A zero-width code point that starts no cluster (after a control
//     sequence, say) takes no cell: it is kept in the cell before the cursor,
//     or dropped when there is none.
//
// As in xterm.js, a control sequence between two code points ends the
// cluster.

// propRange gives the properties of the code points lo to hi.
type propRange struct {
	lo, hi rune
	props  uint16
}

// gcbClass is a Grapheme_Cluster_Break value, numbered as the generator
// numbers them.
type gcbClass uint8

const (
	gcbOther gcbClass = iota
	gcbCR
	gcbLF
	gcbControl
	gcbExtend
	gcbZWJ
	gcbRegionalIndicator
	gcbPrepend
	gcbSpacingMark
	gcbL
	gcbV
	gcbT
	gcbLV
	gcbLVT
)

// inCBClass is an Indic_Conjunct_Break value (GB9c).
type inCBClass uint8

const (
	inCBNone inCBClass = iota
	inCBLinker
	inCBConsonant
	inCBExtend
)

// props are a code point's packed properties: bits 0-1 the width, 2-5 the
// Grapheme_Cluster_Break class, 6 Extended_Pictographic, 7 whether it has
// emoji variation sequences, 8-9 the Indic_Conjunct_Break class.
type props uint16

const (
	propsPlain   props = 1
	propsExtPict props = 1 << 6
	propsVSBase  props = 1 << 7

	textSelector  = 0xFE0E // VS15
	emojiSelector = 0xFE0F // VS16
)

func (p props) width() int {
	return int(p & 0x3)
}

func (p props) gcb() gcbClass {
	return gcbClass(p >> 2 & 0xF)
}

func (p props) extPict() bool {
	return p&propsExtPict != 0
}

func (p props) vsBase() bool {
	return p&propsVSBase != 0
}

func (p props) inCB() inCBClass {
	return inCBClass(p >> 8 & 0x3)
}

// propsOf looks a code point up in the generated ranges; one outside them is
// plain narrow text.
func propsOf(cp rune) props {
	if cp >= 0x20 && cp < 0x7f && cp != '#' && cp != '*' && (cp < '0' || cp > '9') {
		return propsPlain
	}

	lo, hi := 0, len(unicodeRanges)-1
	for lo <= hi {
		mid := (lo + hi) / 2

		switch r := &unicodeRanges[mid]; {
		case cp > r.hi:
			lo = mid + 1
		case cp < r.lo:
			hi = mid - 1
		default:
			return props(r.props)
		}
	}

	return propsPlain
}

// The GB11 states: after an Extended_Pictographic character (and Extend
// characters), and after those and a zero width joiner.
const (
	emojiNone uint8 = iota
	emojiPict
	emojiAfterZWJ
)

// The GB9c states: after an Indic consonant (and InCB Extend characters),
// and after those and a linker.
const (
	conjunctNone uint8 = iota
	conjunctConsonant
	conjunctLinked
)

// joinState describes the grapheme cluster that ends at the cursor, so the
// next code point can join it: the UAX #29 state and the cluster's width.
// The zero value means there is no cluster to join.
type joinState struct {
	valid bool
	width int

	last     gcbClass
	lastCP   rune
	emoji    uint8
	conjunct uint8
	riOdd    bool

	// lastWidth is the width of the last part of the cluster, after any
	// variation selector; widthBefore the widest part before it.
	lastWidth   int
	widthBefore int
}

// joins reports whether a code point with properties p continues the
// cluster: no UAX #29 rule breaks between them.
func (s *joinState) joins(p props) bool {
	if !s.valid {
		return false
	}

	cur := p.gcb()

	switch {
	case s.last == gcbCR && cur == gcbLF: // GB3
		return true
	case s.last == gcbControl || s.last == gcbCR || s.last == gcbLF: // GB4
		return false
	case cur == gcbControl || cur == gcbCR || cur == gcbLF: // GB5
		return false
	case s.last == gcbL && (cur == gcbL || cur == gcbV || cur == gcbLV || cur == gcbLVT): // GB6
		return true
	case (s.last == gcbLV || s.last == gcbV) && (cur == gcbV || cur == gcbT): // GB7
		return true
	case (s.last == gcbLVT || s.last == gcbT) && cur == gcbT: // GB8
		return true
	case cur == gcbExtend || cur == gcbZWJ: // GB9
		return true
	case cur == gcbSpacingMark: // GB9a
		return true
	case s.last == gcbPrepend: // GB9b
		return true
	case s.conjunct == conjunctLinked && p.inCB() == inCBConsonant: // GB9c
		return true
	case s.emoji == emojiAfterZWJ && p.extPict(): // GB11
		return true
	case s.last == gcbRegionalIndicator && cur == gcbRegionalIndicator: // GB12, GB13
		return s.riOdd
	default: // GB999
		return false
	}
}

// advance returns the state after code point cp, with properties p, joined
// the cluster (joined) or started a new one.
func (s *joinState) advance(cp rune, p props, joined bool) joinState {
	var next joinState

	switch {
	case !joined:
		next = joinState{lastWidth: p.width()}
		if p.gcb() == gcbPrepend {
			// A prepended mark is the start of what follows it.
			next.lastWidth = max(next.lastWidth, 1)
		}
	case (cp == emojiSelector || cp == textSelector) && propsOf(s.lastCP).vsBase():
		next = *s
		next.lastWidth = 2
		if cp == textSelector {
			next.lastWidth = 1
		}
	default:
		next = *s
		next.widthBefore = max(s.widthBefore, s.lastWidth)
		next.lastWidth = p.width()
	}

	next.valid = true
	next.last = p.gcb()
	next.lastCP = cp
	next.width = max(next.widthBefore, next.lastWidth, 1)
	next.emoji = nextEmojiState(s, p, joined)
	next.conjunct = nextConjunctState(s, p, joined)
	// A regional indicator that pairs with the one before it ends a pair.
	next.riOdd = p.gcb() == gcbRegionalIndicator && (!joined || s.last != gcbRegionalIndicator)

	return next
}

func nextEmojiState(s *joinState, p props, joined bool) uint8 {
	switch {
	case p.extPict():
		return emojiPict
	case joined && s.emoji == emojiPict && p.gcb() == gcbExtend:
		return emojiPict
	case joined && s.emoji == emojiPict && p.gcb() == gcbZWJ:
		return emojiAfterZWJ
	default:
		return emojiNone
	}
}

func nextConjunctState(s *joinState, p props, joined bool) uint8 {
	switch p.inCB() {
	case inCBConsonant:
		return conjunctConsonant
	case inCBLinker:
		if joined && s.conjunct != conjunctNone {
			return conjunctLinked
		}
	case inCBExtend:
		if joined {
			return s.conjunct
		}
	case inCBNone:
	}

	return conjunctNone
}

// startsNoCell reports whether a code point that does not join a cluster
// takes no cell: a zero-width one other than a prepended mark.
func startsNoCell(p props) bool {
	return p.width() == 0 && p.gcb() != gcbPrepend
}

// graphemeClusters splits code points into extended grapheme clusters, the
// way the terminal joins them; the UAX #29 conformance test uses it.
func graphemeClusters(cps []rune) [][]rune {
	var (
		out   [][]rune
		state joinState
	)

	for _, cp := range cps {
		p := propsOf(cp)

		joined := state.joins(p)
		if joined {
			out[len(out)-1] = append(out[len(out)-1], cp)
		} else {
			out = append(out, []rune{cp})
		}

		state = state.advance(cp, p, joined)
	}

	return out
}
