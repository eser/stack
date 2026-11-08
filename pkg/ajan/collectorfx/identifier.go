// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

import (
	"sort"
	"strconv"
	"unicode/utf16"
)

// SpecifierToIdentifier turns a project-relative specifier into a JavaScript
// identifier that is not in used, and adds it to used. It answers what
// @eserstack/collector's specifierToIdentifier answered in TypeScript, which
// came from deno fresh:
//
//  1. The extension, as Node's path.posix.extname reads it, is cut off.
//  2. The rest is read as UTF-16 code units, as JavaScript's charCodeAt does,
//     so a character outside the Basic Multilingual Plane is two units that
//     are not identifier characters.
//  3. When the first unit cannot start an identifier, "_" comes first, then
//     the unit itself if it can continue one.
//  4. Every later unit that cannot continue an identifier becomes "_", and no
//     two "_" follow each other.
//  5. A taken identifier gets the first free "_1", "_2", ... suffix.
//
// The identifier checks are the ones the TypeScript port of Babel's validator
// held (identifier_tables.go): there, a non-ASCII character continues an
// identifier only when it is in the continue-only table, so a letter such as
// "é" after the first unit becomes "_".
//
// used is the caller's set, kept across calls so every identifier of one
// collection is unique.
func SpecifierToIdentifier(specifier string, used map[string]struct{}) string {
	units := utf16.Encode([]rune(specifier))
	units = units[:len(units)-len(posixExtname(units))]

	ident := make([]uint16, 0, len(units)+1)
	lastIsUnderscore := func() bool {
		return len(ident) > 0 && ident[len(ident)-1] == '_'
	}

	for i, unit := range units {
		switch {
		case i == 0 && !isIdentifierStart(unit):
			ident = append(ident, '_')

			if isIdentifierChar(unit) {
				ident = append(ident, unit)
			}
		case !isIdentifierChar(unit):
			if !lastIsUnderscore() {
				ident = append(ident, '_')
			}
		case !lastIsUnderscore() || unit != '_':
			ident = append(ident, unit)
		}
	}

	result := string(utf16.Decode(ident))

	if _, taken := used[result]; taken {
		check := result

		for n := 1; ; n++ {
			if _, taken := used[check]; !taken {
				break
			}

			check = result + "_" + strconv.Itoa(n)
		}

		result = check
	}

	used[result] = struct{}{}

	return result
}

// posixExtname returns the extension of path as Node's path.posix.extname
// does: from the last "." of the last segment (trailing "/" ignored) to the
// segment's end, or nothing when that segment has no "." past its first unit
// or is "..".
func posixExtname(path []uint16) []uint16 {
	startDot := -1
	startPart := 0
	end := -1
	matchedSlash := true
	// 0: no non-dot unit before the dot yet; 1: a dot before the dot;
	// -1: a non-dot unit before the dot.
	preDotState := 0

	for i := len(path) - 1; i >= 0; i-- {
		unit := path[i]

		if unit == '/' {
			if !matchedSlash {
				startPart = i + 1

				break
			}

			continue
		}

		if end == -1 {
			matchedSlash = false
			end = i + 1
		}

		switch {
		case unit == '.':
			if startDot == -1 {
				startDot = i
			} else if preDotState != 1 {
				preDotState = 1
			}
		case startDot != -1:
			preDotState = -1
		}
	}

	if startDot == -1 || end == -1 || preDotState == 0 ||
		(preDotState == 1 && startDot == end-1 && startDot == startPart+1) {
		return nil
	}

	return path[startDot:end]
}

// isIdentifierStart reports whether a UTF-16 code unit can start a
// JavaScript identifier: "$", "_", an ASCII letter, or a unit from 0xAA up in
// identifierStartRanges.
func isIdentifierStart(unit uint16) bool {
	switch {
	case unit < 'A':
		return unit == '$'
	case unit <= 'Z':
		return true
	case unit < 'a':
		return unit == '_'
	case unit <= 'z':
		return true
	}

	return unit >= 0xaa && inUnitRanges(unit, identifierStartRanges)
}

// isIdentifierChar reports whether a UTF-16 code unit can continue a
// JavaScript identifier: "$", "_", an ASCII letter or digit, or a unit from
// 0xAA up in identifierCharRanges.
func isIdentifierChar(unit uint16) bool {
	switch {
	case unit < '0':
		return unit == '$'
	case unit <= '9':
		return true
	case unit < 'A':
		return false
	case unit <= 'Z':
		return true
	case unit < 'a':
		return unit == '_'
	case unit <= 'z':
		return true
	}

	return unit >= 0xaa && inUnitRanges(unit, identifierCharRanges)
}

// unitRange is an inclusive range of UTF-16 code units.
type unitRange struct {
	lo, hi uint16
}

// inUnitRanges reports whether unit falls in one of the sorted, disjoint
// ranges.
func inUnitRanges(unit uint16, ranges []unitRange) bool {
	i := sort.Search(len(ranges), func(i int) bool { return ranges[i].hi >= unit })

	return i < len(ranges) && ranges[i].lo <= unit
}
