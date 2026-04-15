package lib

import (
	"bytes"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Regular expressions for slug processing (compiled once at package init).
var (
	slugInvalidCharsRegex = regexp.MustCompile(`[^a-z0-9\s-]`)
	slugMultipleHyphens   = regexp.MustCompile(`-+`)
	slugLeadingTrailing   = regexp.MustCompile(`^-|-$`)
	sanitizeInvalidChars  = regexp.MustCompile(`[^a-z0-9-]`)
)

func StringsTrimLeadingSpaceFromBytes(src []byte) []byte {
	if len(src) == 0 {
		return src
	}

	return bytes.TrimLeftFunc(src, unicode.IsSpace)
}

func StringsTrimTrailingSpaceFromBytes(src []byte) []byte {
	if len(src) == 0 {
		return src
	}

	return bytes.TrimRightFunc(src, unicode.IsSpace)
}

func StringsTrimLeadingSpace(src string) string {
	if len(src) == 0 {
		return src
	}

	return strings.TrimLeftFunc(src, unicode.IsSpace)
}

func StringsTrimTrailingSpace(src string) string {
	if len(src) == 0 {
		return src
	}

	return strings.TrimRightFunc(src, unicode.IsSpace)
}

// removeAccents removes diacritical marks from Unicode characters.
// For example: "café" -> "cafe", "über" -> "uber".
func removeAccents(s string) string {
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

	result, _, err := transform.String(t, s)
	if err != nil {
		return s
	}

	return result
}

// Slugify converts a string to a URL-friendly slug.
// - Normalizes accented characters (é -> e, ü -> u, etc.)
// - Converts to lowercase
// - Removes non-alphanumeric characters (except spaces and hyphens)
// - Replaces spaces with hyphens
// - Collapses multiple hyphens into one
// - Trims leading/trailing hyphens.
func Slugify(text string) string {
	result := removeAccents(text)
	result = strings.ToLower(result)
	result = slugInvalidCharsRegex.ReplaceAllString(result, "")
	result = strings.ReplaceAll(result, " ", "-")
	result = slugMultipleHyphens.ReplaceAllString(result, "-")
	result = slugLeadingTrailing.ReplaceAllString(result, "")

	return result
}

// SanitizeSlug sanitizes user input for a slug field.
// - Normalizes accented characters (é -> e, ü -> u, etc.)
// - Converts to lowercase
// - Replaces invalid characters with hyphens
// - Collapses multiple hyphens into one
//
// Unlike Slugify(), this is for sanitizing direct user input in slug fields,
// not for generating slugs from titles.
func SanitizeSlug(text string) string {
	result := removeAccents(text)
	result = strings.ToLower(result)
	result = sanitizeInvalidChars.ReplaceAllString(result, "-")
	result = slugMultipleHyphens.ReplaceAllString(result, "-")

	return result
}
