// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// Bracket patterns that appear in file-based routing conventions.
// Applied in order (most-specific first).
var (
	// [[optional]] — Svelte/Next optional catch-all segments.
	optionalCatchAll = regexp.MustCompile(`\[\[\.\.\.([^\]]+)\]\]`)
	// [[segment]] — optional named segment.
	optionalSegment = regexp.MustCompile(`\[\[([^\]]+)\]\]`)
	// [...splat] — catch-all spread.
	catchAll = regexp.MustCompile(`\[\.\.\.([^\]]+)\]`)
	// [segment] — named dynamic segment.
	dynamicSegment = regexp.MustCompile(`\[([^\]]+)\]`)
)

// IsIdentifierStart reports whether r is a valid first character of a JS identifier.
// Follows the ECMAScript spec: $, _, Unicode letter, or Unicode combining mark.
func IsIdentifierStart(r rune) bool {
	return r == '$' || r == '_' || unicode.IsLetter(r)
}

// IsIdentifierChar reports whether r is a valid non-first character of a JS identifier.
// Extends IsIdentifierStart with Unicode digits and combining marks.
func IsIdentifierChar(r rune) bool {
	return IsIdentifierStart(r) || unicode.IsDigit(r) ||
		unicode.Is(unicode.Mn, r) // non-spacing combining marks
}

// SpecifierToIdentifier converts a file-path specifier into a valid, unique JS identifier.
// The algorithm:
//  1. Strip the last file extension (e.g. ".ts", ".js").
//  2. Expand bracket routing patterns: [[...x]] → x, [...x] → x, [x] → x.
//  3. Replace every non-identifier-character with "_".
//  4. Collapse consecutive underscores into one.
//  5. Strip any remaining leading underscores.
//  6. Prepend "_" if the result begins with a digit.
//  7. Append "_N" (N=1,2,…) if the identifier is already in used.
//
// used is a mutable set that the caller maintains across multiple calls to ensure
// each generated identifier is unique within a collection.
func SpecifierToIdentifier(specifier string, used map[string]struct{}) string {
	// 1. Strip extension — only the last segment (e.g. ".ts" but not ".json" in "bar.json.ts").
	if dot := strings.LastIndex(specifier, "."); dot > strings.LastIndex(specifier, "/") {
		specifier = specifier[:dot]
	}

	// 2. Expand bracket routing patterns.
	specifier = optionalCatchAll.ReplaceAllString(specifier, "$1")
	specifier = optionalSegment.ReplaceAllString(specifier, "$1")
	specifier = catchAll.ReplaceAllString(specifier, "$1")
	specifier = dynamicSegment.ReplaceAllString(specifier, "$1")

	// 3. Replace non-identifier chars with "_".
	var sb strings.Builder

	for _, r := range specifier {
		if IsIdentifierChar(r) {
			sb.WriteRune(r)
		} else {
			sb.WriteRune('_')
		}
	}

	result := sb.String()

	// 4. Collapse consecutive underscores.
	for strings.Contains(result, "__") {
		result = strings.ReplaceAll(result, "__", "_")
	}

	// 5. Strip leading underscores (produced by leading "/" or "_" segments).
	result = strings.TrimLeft(result, "_")

	// 6. Prepend "_" when the first char is a digit (not a valid JS identifier start).
	if len(result) > 0 && unicode.IsDigit(rune(result[0])) {
		result = "_" + result
	}

	// Fallback for empty result.
	if result == "" {
		result = "_"
	}

	// 7. Deduplicate: if already used, append _1, _2, etc.
	if _, exists := used[result]; !exists {
		used[result] = struct{}{}

		return result
	}

	for n := 1; ; n++ {
		candidate := fmt.Sprintf("%s_%d", result, n)
		if _, exists := used[candidate]; !exists {
			used[candidate] = struct{}{}

			return candidate
		}
	}
}
