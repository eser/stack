// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"strings"
)

// =============================================================================
// Slug generation (mirrors slugFromDescription / SLUG_STOP_WORDS in spec.ts)
// =============================================================================

//nolint:gochecknoglobals // immutable sets / compiled regexps
var (
	// SlugStopWords is the set of English stop words stripped from spec descriptions
	// when auto-generating a slug. Mirrors SLUG_STOP_WORDS in spec.ts.
	SlugStopWords = map[string]bool{
		"a": true, "an": true, "the": true, "and": true, "or": true, "but": true,
		"in": true, "on": true, "at": true, "to": true, "for": true, "of": true,
		"with": true, "by": true, "from": true, "is": true, "it": true, "its": true,
		"this": true, "that": true, "as": true, "be": true, "are": true, "was": true,
		"were": true, "been": true, "being": true, "have": true, "has": true, "had": true,
		"do": true, "does": true, "did": true, "will": true, "would": true, "could": true,
		"should": true, "may": true, "might": true, "shall": true, "can": true,
		"i": true, "we": true, "you": true, "they": true, "our": true, "my": true,
		"so": true, "if": true, "not": true, "no": true, "all": true,
	}

	// ReservedSpecNames is the set of names that cannot be used as spec names
	// because they conflict with CLI subcommand routing. Mirrors RESERVED_NAMES in spec.ts.
	ReservedSpecNames = map[string]bool{
		"new": true, "list": true, "help": true, "next": true, "approve": true,
		"done": true, "block": true, "reset": true, "cancel": true, "wontfix": true,
		"reopen": true, "revisit": true, "split": true, "ac": true, "task": true,
		"note": true, "review": true, "delegate": true, "followup": true, "plan-export": true,
	}

	reSlugStripPaths1 = regexp.MustCompile(`(?:~|\.{1,2})?/(?:[\w@.\-]+/)*[\w@.\-]+`)
	reSlugStripPaths2 = regexp.MustCompile(`(?:[\w@.\-]+/){2,}[\w@.\-]+`)
	reSlugClean       = regexp.MustCompile(`[^a-z0-9\s-]`)
	reSlugTrim        = regexp.MustCompile(`(^-+|-+$)`)
	reSlugTrunc       = regexp.MustCompile(`-[^-]*$`)
)

// SlugFromDescription generates a URL-safe, kebab-cased slug from a free-text
// spec description. Strips filesystem paths, removes stop words, takes the first
// 6 significant words, and truncates at 50 characters on a word boundary.
// Returns "spec" when no significant words remain.
func SlugFromDescription(description string) string {
	cleaned := reSlugStripPaths1.ReplaceAllString(description, " ")
	cleaned = reSlugStripPaths2.ReplaceAllString(cleaned, " ")
	cleaned = strings.TrimSpace(cleaned)
	cleaned = strings.ToLower(cleaned)
	cleaned = reSlugClean.ReplaceAllString(cleaned, "")

	words := strings.Fields(cleaned)
	significant := make([]string, 0, 6)

	for _, w := range words {
		if w == "" || SlugStopWords[w] {
			continue
		}

		significant = append(significant, w)

		if len(significant) == 6 {
			break
		}
	}

	slug := strings.Join(significant, "-")

	if len(slug) > 50 {
		slug = reSlugTrunc.ReplaceAllString(slug[:50], "")
	}

	slug = reSlugTrim.ReplaceAllString(slug, "")

	if slug == "" {
		return "spec"
	}

	return slug
}

// LooksLikeDescription reports whether a string is a description rather than a
// pre-formed slug — true when it contains spaces or is longer than 50 characters.
func LooksLikeDescription(value string) bool {
	return strings.ContainsRune(value, ' ') || len(value) > 50
}
