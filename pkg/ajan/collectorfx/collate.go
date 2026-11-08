// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

import (
	"cmp"
	"strings"
	"unicode/utf8"
)

// asciiCollationOrder lists the ASCII characters that carry a weight in the
// order of the Unicode root collation (CLDR), which JavaScript's
// Intl.Collator uses for ASCII text in most locales: whitespace, then
// punctuation and symbols, then digits, then letters. Upper and lower case of
// a letter share a place and differ only by case. The other control
// characters are ignored.
const asciiCollationOrder = "\t\n\v\f\r _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789" +
	"abcdefghijklmnopqrstuvwxyz"

// Primary weights are places in asciiCollationOrder, counted from 1; 0 means
// ignored. Every digit run takes the place of "0" and compares by value, and
// characters past ASCII come after every ASCII one, in code point order.
const (
	ignoredPrimary = 0
	nonASCIIBase   = 1000
)

var numberPrimary = strings.IndexByte(asciiCollationOrder, '0') + 1

var asciiPrimary = func() [128]int {
	var table [128]int

	for i := range len(asciiCollationOrder) {
		c := asciiCollationOrder[i]
		weight := i + 1

		if c >= '0' && c <= '9' {
			weight = numberPrimary
		}

		table[c] = weight

		if c >= 'a' && c <= 'z' {
			table[c-'a'+'A'] = weight
		}
	}

	return table
}()

// collationElement is one weighted unit of a string: a character, or a run
// of ASCII digits read as a number.
type collationElement struct {
	// digits is the number of a digit run without its leading zeros ("0" for
	// zero); empty for other elements.
	digits  string
	primary int
	// upper is the case level: an upper-case ASCII letter sorts after its
	// lower-case form when nothing else differs.
	upper bool
}

func collationElements(s string) []collationElement {
	elements := make([]collationElement, 0, len(s))

	for i := 0; i < len(s); {
		c := s[i]

		if c >= '0' && c <= '9' {
			j := i
			for j < len(s) && s[j] >= '0' && s[j] <= '9' {
				j++
			}

			digits := strings.TrimLeft(s[i:j], "0")
			if digits == "" {
				digits = "0"
			}

			elements = append(elements, collationElement{digits: digits, primary: numberPrimary, upper: false})
			i = j

			continue
		}

		if c < 0x80 {
			if weight := asciiPrimary[c]; weight != ignoredPrimary {
				elements = append(elements, collationElement{
					digits:  "",
					primary: weight,
					upper:   c >= 'A' && c <= 'Z',
				})
			}

			i++

			continue
		}

		r, size := utf8.DecodeRuneInString(s[i:])
		elements = append(elements, collationElement{digits: "", primary: nonASCIIBase + int(r), upper: false})
		i += size
	}

	return elements
}

func comparePrimary(a, b collationElement) int {
	if c := cmp.Compare(a.primary, b.primary); c != 0 {
		return c
	}

	if a.primary != numberPrimary {
		return 0
	}

	if c := cmp.Compare(len(a.digits), len(b.digits)); c != 0 {
		return c
	}

	return strings.Compare(a.digits, b.digits)
}

// compareNatural orders two strings as
// new Intl.Collator(undefined, { numeric: true }).compare does for ASCII text
// in the root collation: first by the characters' places in
// asciiCollationOrder with runs of digits compared as numbers (leading zeros
// do not count), then, when those are equal, lower case before upper case.
// Strings that differ only in ignored control characters or leading zeros are
// equal. Characters past ASCII sort after ASCII, by code point.
func compareNatural(a, b string) int {
	ea := collationElements(a)
	eb := collationElements(b)

	for i := range min(len(ea), len(eb)) {
		if c := comparePrimary(ea[i], eb[i]); c != 0 {
			return c
		}
	}

	if c := cmp.Compare(len(ea), len(eb)); c != 0 {
		return c
	}

	for i := range ea {
		if ea[i].upper != eb[i].upper {
			if eb[i].upper {
				return -1
			}

			return 1
		}
	}

	return 0
}
