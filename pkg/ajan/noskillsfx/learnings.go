// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"
)

// Cross-session learnings (dashboard/learnings.ts) and the rule files that
// `noskills rule add` and `noskills learn` write (commands/rule.ts,
// commands/learn.ts).

// LearningsFile is the JSONL log of learnings, relative to the project.
const LearningsFile = eserDir + "/learnings.jsonl"

// ReadLearnings is readLearnings: each line of the log that parses, as the
// value it holds. A line that holds null counts as one that does not parse.
func ReadLearnings(root string) []any {
	content, ok := readOptionalFile(projectPath(root, LearningsFile))
	if !ok {
		return nil
	}

	var learnings []any

	for _, line := range strings.Split(jsTrim(content), "\n") {
		if line == "" {
			continue
		}

		value, err := parseJSON(line)
		if err != nil || value == nil {
			continue
		}

		learnings = append(learnings, value)
	}

	return learnings
}

// AddLearning appends one learning to the log.
func AddLearning(root string, learning *JSObject) error {
	path := projectPath(root, LearningsFile)
	existing, _ := readOptionalFile(path)

	return writeSyncFile(path, existing+jsonStringify(learning)+"\n")
}

// RemoveLearning is removeLearning: it drops the learning at index (from
// 0) and reports whether there was one.
func RemoveLearning(root string, index int) (bool, error) {
	all := ReadLearnings(root)
	if index < 0 || index >= len(all) {
		return false, nil
	}

	lines := make([]string, 0, len(all)-1)

	for i, learning := range all {
		if i != index {
			lines = append(lines, jsonStringify(learning))
		}
	}

	content := strings.Join(lines, "\n")
	if len(lines) > 0 {
		content += "\n"
	}

	if err := writeSyncFile(projectPath(root, LearningsFile), content); err != nil {
		return false, err
	}

	return true, nil
}

var (
	slugNonAlphanumeric = regexp.MustCompile(`[^a-z0-9]+`) //nolint:gochecknoglobals // compiled once
	slugEdgeDash        = regexp.MustCompile(`^-|-$`)      //nolint:gochecknoglobals // compiled once
)

// RuleSlug is the file name rule add and learn give a rule: the text in
// lower case, runs of other characters as "-", one dash trimmed from each
// end, then the first 50 characters.
func RuleSlug(text string) string {
	slug := slugEdgeDash.ReplaceAllString(slugNonAlphanumeric.ReplaceAllString(jsToLower(text), "-"), "")

	return JSSlice(slug, 0, 50)
}

// RuleFilePath is the absolute path of a rule file as the commands print
// it: the root and the project path joined with "/".
func RuleFilePath(root, slug string) string {
	return root + "/" + rulesDir + "/" + slug + ".md"
}

// WriteRuleFile writes .eser/rules/<slug>.md.
func WriteRuleFile(root, slug, content string) (string, error) {
	if strings.ContainsAny(slug, `/\`) {
		return "", fmt.Errorf("rule name %q: %w", slug, errUnsafeRuleName)
	}

	if err := writeSyncFile(projectPath(root, rulesDir+"/"+slug+".md"), content); err != nil {
		return "", err
	}

	return RuleFilePath(root, slug), nil
}

var errUnsafeRuleName = errors.New("a rule name cannot hold a path separator")

// LearnedRuleContent is the rule file learn writes for a learning.
func LearnedRuleContent(text, sourceSpec string, now time.Time) string {
	return "---\nphases: [EXECUTING]\nsource: learned from spec \"" + sourceSpec + "\" on " +
		now.UTC().Format("2006-01-02") + "\n---\n" + text + "\n"
}

// JSSlice is String.prototype.slice(start, end) on UTF-16 code units, for
// non-negative offsets.
func JSSlice(s string, start, end int) string {
	units := utf16.Encode([]rune(s))
	if end > len(units) {
		end = len(units)
	}

	if start >= end {
		return ""
	}

	return string(utf16.Decode(units[start:end]))
}

// JSLength is String.prototype.length.
func JSLength(s string) int {
	return jsLength(s)
}

// JSPadEnd is String.prototype.padEnd with spaces.
func JSPadEnd(s string, width int) string {
	if n := jsLength(s); n < width {
		return s + strings.Repeat(" ", width-n)
	}

	return s
}

// JSParseInt is parseInt(text, 10): leading whitespace, an optional sign,
// then the digits up to the first other character; ok is false for NaN.
func JSParseInt(text string) (int, bool) {
	s := jsTrimStart(text)
	negative := false

	if s != "" && (s[0] == '-' || s[0] == '+') {
		negative = s[0] == '-'
		s = s[1:]
	}

	n, digits := 0, 0

	for digits < len(s) && s[digits] >= '0' && s[digits] <= '9' {
		if n < 1<<40 {
			n = n*10 + int(s[digits]-'0')
		}

		digits++
	}

	if digits == 0 {
		return 0, false
	}

	if negative {
		n = -n
	}

	return n, true
}

// JSString is String(value) for a parsed JSON value, and "undefined" for
// a missing one.
func JSString(value any, present bool) string {
	if !present {
		return "undefined"
	}

	return jsString(value)
}

// FieldOf reads a field of a parsed JSON value: present is false when the
// value is not an object or has no such field, as `value.key` gives
// undefined.
func FieldOf(value any, key string) (any, bool) {
	o, ok := value.(*JSObject)
	if !ok {
		return nil, false
	}

	return o.get(key)
}
