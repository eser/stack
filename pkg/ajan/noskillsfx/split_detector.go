// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"strings"
)

// The split detector (context/split-detector.ts) looks for independent work
// areas in the discovery answers and proposes one spec per area. The
// numbered-list and ordinal splits use a lookbehind in TypeScript, which Go's
// regexp lacks; splitAt walks the text instead.

// SplitItem is one proposed spec.
type SplitItem struct {
	Name            string
	Description     string
	EstimatedTasks  int
	RelevantAnswers []string
}

// SplitProposal is analyzeForSplit's result.
type SplitProposal struct {
	Detected  bool
	Reason    string
	Proposals []SplitItem
}

func (p *SplitProposal) object() *JSObject {
	proposals := make([]any, len(p.Proposals))
	for i, item := range p.Proposals {
		proposals[i] = JSObjectOf(
			"name", item.Name,
			"description", item.Description,
			"estimatedTasks", jsInteger(item.EstimatedTasks),
			"relevantAnswers", anyOf(item.RelevantAnswers),
		)
	}

	return JSObjectOf("detected", p.Detected, "reason", p.Reason, "proposals", proposals)
}

const actionVerbs = `fix|add|restore|update|remove|refactor|rewrite|implement|create|migrate|convert`

var (
	separatorPatterns = []*regexp.Regexp{ //nolint:gochecknoglobals // compiled once
		regexp.MustCompile(`(?i)\badditionally\b`),
		regexp.MustCompile(`(?i)\bseparately\b`),
		regexp.MustCompile(`(?i)\band also\b`),
		regexp.MustCompile(`(?i)\banother issue\b`),
		regexp.MustCompile(`(?i)\bsecond problem\b`),
		regexp.MustCompile(`(?i)\bon the other hand\b`),
		regexp.MustCompile(`(?i)\bplus\b`),
	}
	alsoSentence  = regexp.MustCompile(`(?im)(?:^|[.!?]` + jsSpace + `+)also[,` + jsSpaceClass + `]`)                                                                                                                        //nolint:gochecknoglobals // compiled once
	numberedList  = regexp.MustCompile(`(?im)(?:^|\n|\.` + jsSpace + `+)` + jsSpace + `*(?:\(\d+\)|\d+\.` + jsSpace + `|(?:first|second|third|fourth|fifth)[:;,])`)                                                          //nolint:gochecknoglobals // compiled once
	andVerb       = regexp.MustCompile(`(?i)\b(` + actionVerbs + `)` + jsSpace + `+` + jsNonSpace + `+(?:` + jsSpace + `+` + jsNonSpace + `+){0,4}` + jsSpace + `+AND` + jsSpace + `+(` + actionVerbs + `)` + jsSpace + `+`) //nolint:gochecknoglobals // compiled once
	parenNumber   = regexp.MustCompile(`\(\d+\)` + jsSpace + `*`)                                                                                                                                                            //nolint:gochecknoglobals // compiled once
	couplingHints = []*regexp.Regexp{                                                                                                                                                                                        //nolint:gochecknoglobals // compiled once
		regexp.MustCompile(`(?i)\buse` + jsSpace + `+(?:the` + jsSpace + `+)?(?:new` + jsSpace + `+)?(\w+)` + jsSpace + `+(?:type|interface|class|module|function)\b`),
		regexp.MustCompile(`(?i)\bafter` + jsSpace + `+(?:adding|creating|implementing)\b`),
		regexp.MustCompile(`(?i)\bdepends` + jsSpace + `+on\b`),
		regexp.MustCompile(`(?i)\bprerequisite\b`),
		regexp.MustCompile(`(?i)\brequires` + jsSpace + `+(?:the` + jsSpace + `+)?(?:above|previous|first)\b`),
		regexp.MustCompile(`(?i)\bthen` + jsSpace + `+use\b`),
	}
	pascalNoun   = regexp.MustCompile(`\b[A-Z][a-zA-Z0-9]+\b`)                                                                                                                                                                 //nolint:gochecknoglobals // compiled once
	fileNoun     = regexp.MustCompile(`\b[\w-]+\.\w{1,4}\b`)                                                                                                                                                                   //nolint:gochecknoglobals // compiled once
	taskVerbs    = regexp.MustCompile(`(?i)\b(fix|add|restore|update|remove|refactor|rewrite|implement|create|migrate|convert|replace|extract|move|rename|split|merge|test|verify|validate|configure|setup|install|deploy)\b`) //nolint:gochecknoglobals // compiled once
	nonSlugChars = regexp.MustCompile(`[^a-z0-9` + jsSpaceClass + `-]`)                                                                                                                                                        //nolint:gochecknoglobals // compiled once
	dashRuns     = regexp.MustCompile(`--+`)                                                                                                                                                                                   //nolint:gochecknoglobals // compiled once
)

// AnalyzeForSplit is analyzeForSplit without a discovery mode.
func AnalyzeForSplit(answers []*JSObject) SplitProposal {
	text := func(id string) string {
		if a := answerFor(answers, id); a != nil {
			return a.str("answer")
		}

		return ""
	}

	areas := detectAreas(text("status_quo"), text("ambition"))
	if len(areas) < 2 {
		return SplitProposal{}
	}

	total := 0
	for _, a := range areas {
		total += a.EstimatedTasks
	}

	if total <= 3 || tightlyCoupled(areas) {
		return SplitProposal{}
	}

	return SplitProposal{
		Detected:  true,
		Reason:    "Discovery answers cover " + jsNumberString(float64(len(areas))) + " independent areas that could be separate specs.",
		Proposals: areas,
	}
}

type rawArea struct {
	text     string
	question string
}

func detectAreas(statusQuo, ambition string) []SplitItem {
	sources := []rawArea{{statusQuo, "status_quo"}, {ambition, "ambition"}}

	for _, detect := range []func([]rawArea) []rawArea{byNumberedList, bySeparators, byAndPattern} {
		if areas := detect(sources); len(areas) >= 2 {
			items := make([]SplitItem, len(areas))
			for i, a := range areas {
				items[i] = SplitItem{
					Name:            areaSlug(a.text),
					Description:     a.text,
					EstimatedTasks:  estimateAreaTasks(a.text),
					RelevantAnswers: []string{a.question},
				}
			}

			return items
		}
	}

	return nil
}

func byNumberedList(sources []rawArea) []rawArea {
	for _, source := range sources {
		if !numberedList.MatchString(source.text) {
			continue
		}

		if items := splitNumberedList(source.text); len(items) >= 2 {
			areas := make([]rawArea, len(items))
			for i, item := range items {
				areas[i] = rawArea{jsTrim(item), source.question}
			}

			return areas
		}
	}

	return nil
}

// trimmedNonEmpty trims the parts after the first and drops empty ones.
func trimmedNonEmpty(parts []string) []string {
	var out []string

	for _, p := range parts {
		if t := jsTrim(p); t != "" {
			out = append(out, t)
		}
	}

	return out
}

func splitNumberedList(text string) []string {
	if parts := jsSplit(text, parenNumber); len(parts) > 1 {
		if items := trimmedNonEmpty(parts[1:]); len(items) >= 2 {
			return items
		}
	}

	if parts := splitAt(text, numberMarkerEnd); len(parts) > 1 {
		if items := trimmedNonEmpty(parts[1:]); len(items) >= 2 {
			return items
		}
	}

	if parts := splitAt(text, ordinalMarkerEnd); len(parts) > 1 {
		if items := trimmedNonEmpty(parts[1:]); len(items) >= 2 {
			return items
		}
	}

	return nil
}

// splitAt is String.split with a pattern of the form
// `(?:^|\n|(?<=\.)\s+)\s*<marker>`: marker reads from a position and
// returns where its match ends, or -1.
func splitAt(text string, marker func(runes []rune, at int) int) []string {
	runes := []rune(text)

	var parts []string

	last := 0

	for p := 0; p < len(runes); {
		end := -1

		if p == 0 {
			end = marker(runes, skipSpace(runes, 0))
		}

		if end < 0 && runes[p] == '\n' {
			end = marker(runes, skipSpace(runes, p+1))
		}

		if end < 0 && p > 0 && runes[p-1] == '.' && isJSSpace(runes[p]) {
			end = marker(runes, skipSpace(runes, p))
		}

		if end < 0 {
			p++

			continue
		}

		parts = append(parts, string(runes[last:p]))
		last = end
		p = max(end, p+1)
	}

	return append(parts, string(runes[last:]))
}

func skipSpace(runes []rune, at int) int {
	for at < len(runes) && isJSSpace(runes[at]) {
		at++
	}

	return at
}

// numberMarkerEnd matches `\d+\.\s+`.
func numberMarkerEnd(runes []rune, at int) int {
	i := at
	for i < len(runes) && runes[i] >= '0' && runes[i] <= '9' {
		i++
	}

	if i == at || i >= len(runes) || runes[i] != '.' {
		return -1
	}

	end := skipSpace(runes, i+1)
	if end == i+1 {
		return -1
	}

	return end
}

// ordinalMarkerEnd matches `(?:first|second|third|fourth|fifth)[:;,]\s*`.
func ordinalMarkerEnd(runes []rune, at int) int {
	for _, word := range []string{"first", "second", "third", "fourth", "fifth"} {
		w := []rune(word)
		if at+len(w) >= len(runes) || !strings.EqualFold(string(runes[at:at+len(w)]), word) {
			continue
		}

		if strings.ContainsRune(":;,", runes[at+len(w)]) {
			return skipSpace(runes, at+len(w)+1)
		}
	}

	return -1
}

func bySeparators(sources []rawArea) []rawArea {
	for _, source := range sources {
		if loc := alsoSentence.FindStringIndex(source.text); loc != nil {
			before, after := jsTrim(source.text[:loc[0]]), jsTrim(source.text[loc[1]:])
			if before != "" && after != "" {
				return []rawArea{{before, source.question}, {after, source.question}}
			}
		}

		for _, pattern := range separatorPatterns {
			if !pattern.MatchString(source.text) {
				continue
			}

			if parts := trimmedNonEmpty(jsSplit(source.text, pattern)); len(parts) >= 2 {
				areas := make([]rawArea, len(parts))
				for i, part := range parts {
					areas[i] = rawArea{part, source.question}
				}

				return areas
			}
		}
	}

	return nil
}

func byAndPattern(sources []rawArea) []rawArea {
	for _, source := range sources {
		loc := andVerb.FindStringIndex(source.text)
		if loc == nil {
			continue
		}

		// The TypeScript code searches the upper-cased text, which keeps the
		// offsets of ASCII text.
		at := strings.Index(strings.ToUpper(source.text)[loc[0]:], " AND ")
		if at < 0 {
			continue
		}

		at += loc[0]
		before, after := jsTrim(source.text[:at]), jsTrim(source.text[at+5:])

		if before != "" && after != "" {
			return []rawArea{{before, source.question}, {after, source.question}}
		}
	}

	return nil
}

var splitStopWords = map[string]bool{ //nolint:gochecknoglobals // read-only set
	"the": true, "a": true, "an": true, "is": true, "are": true, "was": true, "were": true, "be": true, "been": true,
	"being": true, "have": true, "has": true, "had": true, "do": true, "does": true, "did": true, "will": true,
	"would": true, "shall": true, "should": true, "may": true, "might": true, "must": true, "can": true, "could": true,
	"to": true, "of": true, "in": true, "for": true, "on": true, "with": true, "at": true, "by": true, "from": true,
	"that": true, "this": true, "it": true, "its": true, "and": true, "or": true, "but": true, "not": true, "no": true,
	"so": true, "if": true, "then": true, "too": true, "very": true, "just": true,
}

func areaSlug(text string) string {
	var words []string

	for _, w := range jsSplitWhitespace(nonSlugChars.ReplaceAllString(jsToLower(text), "")) {
		if w != "" && !splitStopWords[w] {
			words = append(words, w)
		}
	}

	slug := strings.Join(words[:min(4, len(words))], "-")
	slug = dashRuns.ReplaceAllString(slug, "-")
	slug = strings.TrimSuffix(strings.TrimPrefix(slug, "-"), "-")
	slug = jsSliceUnits(slug, 50)

	if slug == "" {
		return "area"
	}

	return slug
}

func estimateAreaTasks(text string) int {
	verbs := len(taskVerbs.FindAllStringIndex(text, -1))

	return max(2, min(verbs+1, 5))
}

func tightlyCoupled(areas []SplitItem) bool {
	for i := range areas {
		for j := i + 1; j < len(areas); j++ {
			combined := areas[i].Description + " " + areas[j].Description

			for _, pattern := range couplingHints {
				if pattern.MatchString(combined) {
					return true
				}
			}

			b := keyNouns(areas[j].Description)
			for _, noun := range keyNouns(areas[i].Description) {
				if containsString(b, noun) && ((noun[0] >= 'A' && noun[0] <= 'Z') || strings.Contains(noun, ".")) {
					return true
				}
			}
		}
	}

	return false
}

func keyNouns(text string) []string {
	var nouns []string

	for _, m := range append(pascalNoun.FindAllString(text, -1), fileNoun.FindAllString(text, -1)...) {
		if !containsString(nouns, m) {
			nouns = append(nouns, m)
		}
	}

	return nouns
}
