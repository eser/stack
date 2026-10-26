// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"math"
	"regexp"
	"strings"
)

// The TypeScript CLI writes YAML with the yaml package: the spec frontmatter
// (`yaml.stringify(metadata, { lineWidth: 0 })`) and the manifest's noskills
// section (`doc.createNode`, then `doc.toString()` at its default width of
// 80). This emitter writes the block style that library gives plain data:
// two-space indents, sequences indented under their key, empty collections
// as [] and {}, and strings plain unless a YAML 1.2 core schema reader
// would read them as something else, in which case they are quoted the way
// the library quotes them.

type yamlEmitter struct {
	// lineWidth folds long flow scalars, as the library does; 0 never folds.
	lineWidth int
}

const yamlMinContentWidth = 20

var (
	yamlPlainForbidden = regexp.MustCompile(`^[\n\t ,\[\]{}#&*!|>'"%@` + "`" + `]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$`) //nolint:gochecknoglobals // compiled once
	yamlDocumentMarker = regexp.MustCompile(`(?m)^(?:%|---|\.\.\.)`)                                                                        //nolint:gochecknoglobals // compiled once
	yamlCoreNonString  = []*regexp.Regexp{                                                                                                  //nolint:gochecknoglobals // compiled once
		regexp.MustCompile(`^(?:~|[Nn]ull|NULL)?$`),
		regexp.MustCompile(`^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$`), //nolint:misspell // the YAML 1.2 booleans
		regexp.MustCompile(`^0o[0-7]+$`),
		regexp.MustCompile(`^[-+]?[0-9]+$`),
		regexp.MustCompile(`^0x[0-9a-fA-F]+$`),
		regexp.MustCompile(`^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$`),
		regexp.MustCompile(`^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$`),
		regexp.MustCompile(`^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$`),
	}
	yamlForceDouble = regexp.MustCompile(`[\x00-\x08\x0b-\x1f\x7f-\x9f]`) //nolint:gochecknoglobals // compiled once
)

// yamlStringify is `yaml.stringify(value, { lineWidth })` for a map, with
// the trailing newline.
func yamlStringify(value *JSObject, lineWidth int) string {
	e := yamlEmitter{lineWidth: lineWidth}

	return e.mapping(value, "") + "\n"
}

// mapping writes a block mapping whose keys start at indent.
func (e yamlEmitter) mapping(o *JSObject, indent string) string {
	keys := o.orderedKeys()
	if len(keys) == 0 {
		return "{}"
	}

	lines := make([]string, 0, len(keys))

	for _, key := range keys {
		lines = append(lines, e.pair(key, o.values[key], indent))
	}

	return strings.Join(lines, "\n"+indent)
}

// pair writes `key: value` at indent; a non-empty collection goes on the
// lines after the key.
func (e yamlEmitter) pair(key string, value any, indent string) string {
	head := e.scalarString(key, indent, true, 0) + ":"
	inner := indent + "  "

	switch v := value.(type) {
	case *JSObject:
		if len(v.keys) == 0 {
			return head + " {}"
		}

		return head + "\n" + inner + e.mapping(v, inner)
	case []any:
		if len(v) == 0 {
			return head + " []"
		}

		return head + "\n" + inner + e.sequence(v, inner)
	case []string:
		return e.pair(key, anyOf(v), indent)
	default:
		return head + " " + e.scalar(value, inner, len(head)+1)
	}
}

// sequence writes `- item` lines at indent.
func (e yamlEmitter) sequence(items []any, indent string) string {
	lines := make([]string, 0, len(items))
	inner := indent + "  "

	for _, item := range items {
		switch v := item.(type) {
		case *JSObject:
			if len(v.keys) == 0 {
				lines = append(lines, "- {}")
			} else {
				lines = append(lines, "- "+e.mapping(v, inner))
			}
		case []any:
			if len(v) == 0 {
				lines = append(lines, "- []")
			} else {
				lines = append(lines, "- "+e.sequence(v, inner))
			}
		default:
			lines = append(lines, "- "+e.scalar(item, inner, -1))
		}
	}

	return strings.Join(lines, "\n"+indent)
}

// scalar writes a scalar value; indent is the indent of its continuation
// lines and indentAtStart the column it starts at.
func (e yamlEmitter) scalar(value any, indent string, indentAtStart int) string {
	switch v := value.(type) {
	case nil:
		return "null"
	case bool:
		if v {
			return "true"
		}

		return "false"
	case float64, int:
		return yamlNumber(numberOf(v))
	case string:
		return e.scalarString(v, indent, false, indentAtStart)
	default:
		return "null"
	}
}

func yamlNumber(f float64) string {
	switch {
	case math.IsNaN(f):
		return ".nan"
	case math.IsInf(f, 1):
		return ".inf"
	case math.IsInf(f, -1):
		return "-.inf"
	default:
		return jsNumberJSON(f)
	}
}

// scalarString is stringifyString for a plain string value.
func (e yamlEmitter) scalarString(value, indent string, implicitKey bool, indentAtStart int) string {
	if yamlForceDouble.MatchString(value) {
		return e.doubleQuoted(value, indent, implicitKey, indentAtStart)
	}

	if implicitKey && strings.Contains(value, "\n") {
		return e.quoted(value, indent, implicitKey, indentAtStart)
	}

	if yamlPlainForbidden.MatchString(value) {
		if implicitKey || !strings.Contains(value, "\n") {
			return e.quoted(value, indent, implicitKey, indentAtStart)
		}

		return e.block(value, indent)
	}

	if !implicitKey && strings.Contains(value, "\n") {
		return e.block(value, indent)
	}

	if yamlDocumentMarker.MatchString(value) && indent == "" {
		return e.block(value, "  ")
	}

	for _, test := range yamlCoreNonString {
		if test.MatchString(value) {
			return e.quoted(value, indent, implicitKey, indentAtStart)
		}
	}

	if implicitKey {
		return value
	}

	return e.fold(value, indent, yamlFoldFlow, indentAtStart)
}

// quoted picks single quotes for a string with double quotes and no single
// ones, double quotes otherwise.
func (e yamlEmitter) quoted(value, indent string, implicitKey bool, indentAtStart int) string {
	if strings.Contains(value, `"`) && !strings.Contains(value, "'") {
		return e.singleQuoted(value, indent, implicitKey, indentAtStart)
	}

	return e.doubleQuoted(value, indent, implicitKey, indentAtStart)
}

var yamlSpaceAroundNewline = regexp.MustCompile(`[ \t]\n|\n[ \t]`) //nolint:gochecknoglobals // compiled once

func (e yamlEmitter) singleQuoted(value, indent string, implicitKey bool, indentAtStart int) string {
	if (implicitKey && strings.Contains(value, "\n")) || yamlSpaceAroundNewline.MatchString(value) {
		return e.doubleQuoted(value, indent, implicitKey, indentAtStart)
	}

	if indent == "" && yamlDocumentMarker.MatchString(value) {
		indent = "  "
	}

	escaped := strings.ReplaceAll(value, "'", "''")
	escaped = regexp.MustCompile(`\n+`).ReplaceAllStringFunc(escaped, func(run string) string { return run + "\n" + indent })
	res := "'" + escaped + "'"

	if implicitKey {
		return res
	}

	return e.fold(res, indent, yamlFoldFlow, indentAtStart)
}

// doubleQuoted is doubleQuotedString for a single-line value: JSON escapes
// with YAML's short forms for some control characters. A value with line
// breaks keeps them as \n escapes.
func (e yamlEmitter) doubleQuoted(value, indent string, implicitKey bool, indentAtStart int) string {
	json := jsonStringify(value)

	var b strings.Builder

	for i := 0; i < len(json); i++ {
		if json[i] == '\\' && i+1 < len(json) && json[i+1] == 'u' && i+5 < len(json) {
			code := json[i+2 : i+6]

			switch code {
			case "0000":
				b.WriteString(`\0`)
			case "0007":
				b.WriteString(`\a`)
			case "000b":
				b.WriteString(`\v`)
			case "001b":
				b.WriteString(`\e`)
			default:
				if strings.HasPrefix(code, "00") {
					b.WriteString(`\x` + code[2:])
				} else {
					b.WriteString(json[i : i+6])
				}
			}

			i += 5

			continue
		}

		if json[i] == '\\' && i+1 < len(json) {
			b.WriteString(json[i : i+2])
			i++

			continue
		}

		b.WriteByte(json[i])
	}

	res := b.String()
	if implicitKey {
		return res
	}

	return e.fold(res, indent, yamlFoldQuoted, indentAtStart)
}

// block is a literal block scalar (`|`, `|-` or `|+`), which the library
// writes for multi-line strings when lines are not folded.
func (e yamlEmitter) block(value, indent string) string {
	if indent == "" {
		indent = "  "
	}

	if regexp.MustCompile(`\n[\t ]+$`).MatchString(value) {
		return e.doubleQuoted(value, indent, false, 0)
	}

	if value == "" {
		return "|\n"
	}

	endStart := len(value)
	for endStart > 0 && strings.ContainsRune("\n\t ", rune(value[endStart-1])) {
		endStart--
	}

	end := value[endStart:]

	chomp := ""

	switch nl := strings.Index(end, "\n"); {
	case nl == -1:
		chomp = "-"
	case value == end || nl != len(end)-1:
		chomp = "+"
	}

	if end != "" {
		value = value[:len(value)-len(end)]
		end = strings.TrimSuffix(end, "\n")
		end = regexp.MustCompile(`\n+`).ReplaceAllStringFunc(end, func(run string) string { return run + indent })
	}

	startWithSpace := false
	startEnd, startNL := 0, -1

	for ; startEnd < len(value); startEnd++ {
		switch value[startEnd] {
		case ' ':
			startWithSpace = true

			continue
		case '\n':
			startNL = startEnd

			continue
		}

		break
	}

	cut := startEnd
	if startNL < startEnd {
		cut = startNL + 1
	}

	start := value[:cut]
	value = value[cut:]
	start = regexp.MustCompile(`\n+`).ReplaceAllStringFunc(start, func(run string) string { return run + indent })

	header := chomp
	if startWithSpace {
		header = "2" + chomp
	}

	value = regexp.MustCompile(`\n+`).ReplaceAllStringFunc(value, func(run string) string { return run + indent })

	return "|" + header + "\n" + indent + start + value + end
}

const (
	yamlFoldFlow = iota
	yamlFoldQuoted
)

// fold is foldFlowLines for flow and quoted scalars: it breaks a line
// longer than the width at a space between two non-space characters.
func (e yamlEmitter) fold(text, indent string, mode, indentAtStart int) string { //nolint:cyclop,gocognit,funlen // a port of the library's loop
	if e.lineWidth <= 0 {
		return text
	}

	minContent := yamlMinContentWidth
	if e.lineWidth < minContent {
		minContent = 0
	}

	units := []rune(text)
	endStep := max(1+minContent, 1+e.lineWidth-len(indent))

	if len(units) <= endStep {
		return text
	}

	var folds []int

	escaped := map[int]bool{}
	end := e.lineWidth - len(indent)

	// A negative indentAtStart stands for the library's undefined one.
	if indentAtStart >= 0 {
		if indentAtStart > e.lineWidth-max(2, minContent) {
			folds = append(folds, 0)
		} else {
			end = e.lineWidth - indentAtStart
		}
	}

	split := -1
	var prev rune

	escStart, escEnd := -1, -1

	for i := 0; i < len(units); i++ {
		ch := units[i]

		if mode == yamlFoldQuoted && ch == '\\' && i+1 < len(units) {
			escStart = i

			switch units[i+1] {
			case 'x':
				i += 3
			case 'u':
				i += 5
			case 'U':
				i += 9
			default:
				i++
			}

			escEnd = i
		}

		if ch == '\n' {
			end = i + len(indent) + endStep
			split = -1
		} else {
			if ch == ' ' && prev != 0 && prev != ' ' && prev != '\n' && prev != '\t' {
				if i+1 < len(units) && units[i+1] != ' ' && units[i+1] != '\n' && units[i+1] != '\t' {
					split = i
				}
			}

			if i >= end {
				switch {
				case split > 0:
					folds = append(folds, split)
					end = split + endStep
					split = -1
				case mode == yamlFoldQuoted:
					for prev == ' ' || prev == '\t' {
						prev = ch
						i++

						if i >= len(units) {
							break
						}

						ch = units[i]
					}

					j := escStart - 1
					if i > escEnd+1 {
						j = i - 2
					}

					if escaped[j] {
						return text
					}

					folds = append(folds, j)
					escaped[j] = true
					end = j + endStep
					split = -1
				}
			}
		}

		prev = ch
	}

	if len(folds) == 0 {
		return text
	}

	var b strings.Builder

	b.WriteString(string(units[:max(folds[0], 0)]))

	for k, fold := range folds {
		stop := len(units)
		if k+1 < len(folds) {
			stop = folds[k+1]
		}

		if fold == 0 {
			b.Reset()
			b.WriteString("\n" + indent + string(units[:stop]))

			continue
		}

		if mode == yamlFoldQuoted && escaped[fold] {
			b.WriteString(string(units[fold]) + `\`)
		}

		b.WriteString("\n" + indent + string(units[fold+1:stop]))
	}

	return b.String()
}
