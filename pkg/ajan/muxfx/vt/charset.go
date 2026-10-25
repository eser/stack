// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

// charset maps ASCII characters to their replacement in a designated
// character set. A nil charset is US-ASCII.
type charset map[rune]rune

// charsetFor returns the replacement table for the final byte of an
// ESC ( / ) / * / + / - / . designation, and whether the byte names a known
// set. 'B' (US-ASCII) is known and has no table.
func charsetFor(final byte) (charset, bool) {
	switch final {
	case 'B':
		return nil, true
	case '0':
		return charset{
			'`': '◆', 'a': '▒', 'b': '␉', 'c': '␌', 'd': '␍', 'e': '␊',
			'f': '°', 'g': '±', 'h': '␤', 'i': '␋', 'j': '┘', 'k': '┐',
			'l': '┌', 'm': '└', 'n': '┼', 'o': '⎺', 'p': '⎻', 'q': '─',
			'r': '⎼', 's': '⎽', 't': '├', 'u': '┤', 'v': '┴', 'w': '┬',
			'x': '│', 'y': '≤', 'z': '≥', '{': 'π', '|': '≠', '}': '£',
			'~': '·',
		}, true
	case 'A':
		return charset{'#': '£'}, true
	case '4':
		return charset{
			'#': '£', '@': '¾', '[': 'i', '\\': '½', ']': '|', '{': '¨',
			'|': 'f', '}': '¼', '~': '´',
		}, true
	case 'C', '5':
		return charset{
			'[': 'Ä', '\\': 'Ö', ']': 'Å', '^': 'Ü', '`': 'é', '{': 'ä',
			'|': 'ö', '}': 'å', '~': 'ü',
		}, true
	case 'R':
		return charset{
			'#': '£', '@': 'à', '[': '°', '\\': 'ç', ']': '§', '{': 'é',
			'|': 'ù', '}': 'è', '~': '¨',
		}, true
	case 'Q':
		return charset{
			'@': 'à', '[': 'â', '\\': 'ç', ']': 'ê', '^': 'î', '`': 'ô',
			'{': 'é', '|': 'ù', '}': 'è', '~': 'û',
		}, true
	case 'K':
		return charset{
			'@': '§', '[': 'Ä', '\\': 'Ö', ']': 'Ü', '{': 'ä', '|': 'ö',
			'}': 'ü', '~': 'ß',
		}, true
	case 'Y':
		return charset{
			'#': '£', '@': '§', '[': '°', '\\': 'ç', ']': 'é', '`': 'ù',
			'{': 'à', '|': 'ò', '}': 'è', '~': 'ì',
		}, true
	case 'E', '6':
		return charset{
			'@': 'Ä', '[': 'Æ', '\\': 'Ø', ']': 'Å', '^': 'Ü', '`': 'ä',
			'{': 'æ', '|': 'ø', '}': 'å', '~': 'ü',
		}, true
	case 'Z':
		return charset{
			'#': '£', '@': '§', '[': '¡', '\\': 'Ñ', ']': '¿', '{': '°',
			'|': 'ñ', '}': 'ç',
		}, true
	case 'H', '7':
		return charset{
			'@': 'É', '[': 'Ä', '\\': 'Ö', ']': 'Å', '^': 'Ü', '`': 'é',
			'{': 'ä', '|': 'ö', '}': 'å', '~': 'ü',
		}, true
	case '=':
		return charset{
			'#': 'ù', '@': 'à', '[': 'é', '\\': 'ç', ']': 'ê', '^': 'î',
			'_': 'è', '`': 'ô', '{': 'ä', '|': 'ö', '}': 'ü', '~': 'û',
		}, true
	default:
		return nil, false
	}
}

// gLevelFor maps a designation intermediate to the G set it designates.
func gLevelFor(intermediate byte) (int, bool) {
	switch intermediate {
	case '(':
		return 0, true
	case ')', '-':
		return 1, true
	case '*', '.':
		return 2, true
	case '+':
		return 3, true
	default:
		return 0, false
	}
}

// charsetState is the G0-G3 designations and the one currently invoked.
type charsetState struct {
	sets   [4]charset
	glevel int
	active charset
}

func (c *charsetState) reset() {
	*c = charsetState{}
}

func (c *charsetState) setGLevel(g int) {
	c.glevel = g
	c.active = c.sets[g]
}

func (c *charsetState) setGCharset(g int, cs charset) {
	c.sets[g] = cs
	if c.glevel == g {
		c.active = cs
	}
}
