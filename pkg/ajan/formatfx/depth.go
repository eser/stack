// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"errors"
	"fmt"
	"strings"
)

// MaxNestingDepth is the deepest nesting of arrays and objects (or YAML
// sequences and mappings) a document may have before it is decoded. Decoding
// recurses once per level: in the WASM build a few thousand levels overflow
// the host's stack and kill the instance, which Go's recover cannot catch, and
// natively a deep document costs a large goroutine stack. 1,000 levels is far
// above what real documents use and well below the measured trap at 5,000 to
// 6,000 levels.
const MaxNestingDepth = 1000

// ErrNestingTooDeep is the error for a document nested deeper than
// MaxNestingDepth.
var ErrNestingTooDeep = errors.New("nesting is too deep")

func nestingError(depth int) error {
	return fmt.Errorf("%w: more than %d levels (found %d); flatten the document", ErrNestingTooDeep, MaxNestingDepth, depth)
}

// CheckJSONDepth reports ErrNestingTooDeep when the JSON text nests arrays and
// objects deeper than MaxNestingDepth. It scans bytes without decoding, so it
// is cheap to run before json.Unmarshal; brackets inside strings do not count.
func CheckJSONDepth(text string) error {
	return checkBracketDepth(text, `"`, 0)
}

// CheckTOMLDepth is CheckJSONDepth for TOML: inline arrays and tables nest
// with the same brackets, and basic and literal strings both hide them.
func CheckTOMLDepth(text string) error {
	return checkBracketDepth(text, `"'`, '#')
}

// CheckYAMLDepth reports ErrNestingTooDeep when a YAML document nests deeper
// than MaxNestingDepth: flow collections count by their brackets, block
// collections by their indentation levels.
func CheckYAMLDepth(text string) error {
	var indents []int // the open block levels, by indentation

	flow := 0
	maxDepth := 0

	for line := range strings.Lines(text) {
		trimmed := strings.TrimLeft(line, " ")
		content := strings.TrimSpace(trimmed)

		// A block level is a mapping key or a sequence item; a line that is a
		// flow collection or a bare scalar opens none, its brackets count below.
		opensBlock := content != "" && !strings.HasPrefix(content, "#") &&
			content != "---" && content != "..." &&
			!strings.HasPrefix(content, "[") && !strings.HasPrefix(content, "{")

		if flow == 0 && opensBlock {
			indent := len(line) - len(trimmed)
			for len(indents) > 0 && indents[len(indents)-1] >= indent {
				indents = indents[:len(indents)-1]
			}

			indents = append(indents, indent)

			// "- - x" opens a sequence inside a sequence on one line: each dash
			// after the first adds a level.
			dashes := 0
			for rest := content; strings.HasPrefix(rest, "- "); rest = strings.TrimLeft(rest[2:], " ") {
				dashes++
			}

			for range max(dashes-1, 0) {
				indents = append(indents, indent)
			}
		}

		depth, err := bracketDepth(line, `"'`, '#', &flow)
		if err != nil {
			return err
		}

		if total := len(indents) + depth; total > maxDepth {
			maxDepth = total
		}

		if maxDepth > MaxNestingDepth {
			return nestingError(maxDepth)
		}
	}

	return nil
}

// checkBracketDepth scans text for [ and { outside the quote characters and
// comments, and fails once the nesting passes MaxNestingDepth.
func checkBracketDepth(text, quotes string, comment byte) error {
	depth := 0

	for line := range strings.Lines(text) {
		if _, err := bracketDepth(line, quotes, comment, &depth); err != nil {
			return err
		}
	}

	return nil
}

// bracketDepth scans one line, carrying the open bracket count in depth, and
// returns the deepest count seen on the line. A string never spans lines in
// the scanned formats except JSON, whose strings cannot hold raw newlines.
func bracketDepth(line, quotes string, comment byte, depth *int) (int, error) {
	deepest := *depth
	var quote byte

	for i := 0; i < len(line); i++ {
		c := line[i]

		switch {
		case quote != 0:
			if c == '\\' && quote == '"' {
				i++
			} else if c == quote {
				quote = 0
			}
		case strings.IndexByte(quotes, c) >= 0:
			quote = c
		case comment != 0 && c == comment:
			return deepest, nil
		case c == '[' || c == '{':
			*depth++
			if *depth > deepest {
				deepest = *depth
			}

			if *depth > MaxNestingDepth {
				return deepest, nestingError(*depth)
			}
		case c == ']' || c == '}':
			if *depth > 0 {
				*depth--
			}
		}
	}

	return deepest, nil
}
