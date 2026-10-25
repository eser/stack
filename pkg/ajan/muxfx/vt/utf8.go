// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

// utf8Decoder turns a byte stream into code points across writes: a sequence
// split between two writes is held back and completed by the next one.
// Malformed sequences are dropped the way xterm.js drops them, so a stray byte
// costs one character, never the rest of the chunk.
type utf8Decoder struct {
	interim [3]byte
}

func (d *utf8Decoder) reset() {
	d.interim = [3]byte{}
}

func isContinuation(b byte) bool {
	return b&0xC0 == 0x80
}

// sequenceLength is the total length of the sequence a lead byte starts.
func sequenceLength(lead byte) int {
	switch {
	case lead&0xE0 == 0xC0:
		return 2
	case lead&0xF0 == 0xE0:
		return 3
	default:
		return 4
	}
}

func validCodePoint(cp rune, length int) bool {
	switch length {
	case 2:
		return cp >= 0x80
	case 3:
		return cp >= 0x0800 && (cp < 0xD800 || cp > 0xDFFF) && cp != 0xFEFF
	default:
		return cp >= 0x010000 && cp <= 0x10FFFF
	}
}

// decode appends the code points in input to out and returns it.
func (d *utf8Decoder) decode(input []byte, out []rune) []rune {
	start := 0

	if d.interim[0] != 0 {
		var (
			done bool
			out2 []rune
		)

		start, done, out2 = d.finishInterim(input, out)
		out = out2

		if !done {
			return out
		}
	}

	for i := start; i < len(input); {
		b1 := input[i]
		i++

		if b1 < 0x80 {
			out = append(out, rune(b1))

			continue
		}

		length := 0

		switch {
		case b1&0xE0 == 0xC0:
			length = 2
		case b1&0xF0 == 0xE0:
			length = 3
		case b1&0xF8 == 0xF0:
			length = 4
		default:
			continue
		}

		cp := rune(b1) & (0xFF >> (length + 1))
		complete := true
		valid := true

		for k := 1; k < length; k++ {
			if i >= len(input) {
				d.interim[0] = b1
				for j := 1; j < k; j++ {
					d.interim[j] = input[i-k+j]
				}

				complete = false

				break
			}

			b := input[i]
			if !isContinuation(b) {
				valid = false

				break
			}

			i++
			cp = cp<<6 | rune(b&0x3F)
		}

		if !complete {
			return out
		}

		if !valid {
			continue
		}

		if length == 2 && cp < 0x80 {
			// xterm re-reads the second byte of an overlong 2-byte form.
			i--

			continue
		}

		if validCodePoint(cp, length) {
			out = append(out, cp)
		}
	}

	return out
}

// finishInterim completes a sequence held back from the previous write. It
// returns where decoding of input continues and whether input had enough
// bytes to finish it.
func (d *utf8Decoder) finishInterim(input []byte, out []rune) (int, bool, []rune) {
	lead := d.interim[0]
	length := sequenceLength(lead)

	cp := rune(lead) & (0xFF >> (length + 1))
	pos := 1

	for pos < 3 && d.interim[pos] != 0 {
		cp = cp<<6 | rune(d.interim[pos]&0x3F)
		pos++
	}

	start := 0
	discard := false

	for pos+start < length {
		if start >= len(input) {
			for k := 0; k < start; k++ {
				d.interim[pos+k] = input[k]
			}

			return start, false, out
		}

		b := input[start]
		if !isContinuation(b) {
			discard = true

			break
		}

		start++
		cp = cp<<6 | rune(b&0x3F)
	}

	if !discard {
		switch {
		case length == 2 && cp < 0x80:
			start--
		case validCodePoint(cp, length):
			out = append(out, cp)
		}
	}

	d.reset()

	return start, true, out
}
