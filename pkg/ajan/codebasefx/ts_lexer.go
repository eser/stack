// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"unicode"
	"unicode/utf8"
)

// tsTokenKind is the kind of a token the TypeScript source lexer produces.
type tsTokenKind int

const (
	// tsComment is a line or block comment, delimiters included.
	tsComment tsTokenKind = iota
	// tsString is a single- or double-quoted string literal.
	tsString
	// tsTemplate is the text of a template literal outside its ${} parts.
	tsTemplate
	// tsRegex is a regular expression literal.
	tsRegex
	// tsIdent is an identifier or a keyword.
	tsIdent
	// tsNumber is a numeric literal.
	tsNumber
	// tsPunct is any other character, one per token.
	tsPunct
)

// tsToken is one token of TypeScript or JavaScript source.
type tsToken struct {
	Text  string
	Kind  tsTokenKind
	Line  int // 1-based line of the token's first character
	Start int // byte offset of the token's first character
}

// regexAfterKeyword lists the keywords after which a slash starts a regular
// expression rather than a division.
var regexAfterKeyword = map[string]bool{
	"return": true, "typeof": true, "instanceof": true, "in": true, "of": true,
	"new": true, "delete": true, "void": true, "throw": true, "case": true,
	"do": true, "else": true, "yield": true, "await": true,
}

// tsLexer splits TypeScript and JavaScript source into comments, string,
// template and regular expression literals, identifiers, numbers and single
// punctuation characters. It is small on purpose: validators that read only
// comments or only identifiers need these boundaries and nothing else. It does
// not parse JSX; JSX text is lexed as code, and a quote in it ends at the end
// of its line, so a mislexed quote cannot swallow the rest of the file.
type tsLexer struct {
	src    []byte
	tokens []tsToken
	pos    int
	line   int
}

// lexTS returns the tokens of src in order.
func lexTS(src []byte) []tsToken {
	lx := &tsLexer{src: src, pos: 0, line: 1, tokens: nil}
	lx.lexCode(false)

	return lx.tokens
}

func (lx *tsLexer) emit(kind tsTokenKind, start, line int) {
	lx.tokens = append(lx.tokens, tsToken{Kind: kind, Text: string(lx.src[start:lx.pos]), Line: line, Start: start})
}

// advance moves past one byte, counting newlines.
func (lx *tsLexer) advance() {
	if lx.src[lx.pos] == '\n' {
		lx.line++
	}

	lx.pos++
}

// next returns the byte after the current one, or 0 at the end.
func (lx *tsLexer) next() byte {
	if lx.pos+1 < len(lx.src) {
		return lx.src[lx.pos+1]
	}

	return 0
}

// regexAllowed reports whether a slash at the current position starts a
// regular expression, judged by the previous significant token.
func (lx *tsLexer) regexAllowed() bool {
	for i := len(lx.tokens) - 1; i >= 0; i-- {
		tok := lx.tokens[i]

		switch tok.Kind {
		case tsComment:
			continue
		case tsIdent:
			return regexAfterKeyword[tok.Text]
		case tsNumber, tsString, tsTemplate, tsRegex:
			return false
		case tsPunct:
			return tok.Text != ")" && tok.Text != "]"
		}
	}

	return true
}

// lexCode lexes code until the end of the source or, inside a template
// substitution, until the brace that closes it.
func (lx *tsLexer) lexCode(inSubstitution bool) {
	depth := 0

	for lx.pos < len(lx.src) {
		c := lx.src[lx.pos]
		start, line := lx.pos, lx.line

		switch {
		case c == '\n' || c == ' ' || c == '\t' || c == '\r':
			lx.advance()
		case c == '/' && lx.next() == '/':
			for lx.pos < len(lx.src) && lx.src[lx.pos] != '\n' {
				lx.pos++
			}

			lx.emit(tsComment, start, line)
		case c == '/' && lx.next() == '*':
			lx.pos += 2

			for lx.pos < len(lx.src) && (lx.src[lx.pos] != '*' || lx.next() != '/') {
				lx.advance()
			}

			lx.pos = min(lx.pos+2, len(lx.src))
			lx.emit(tsComment, start, line)
		case c == '\'' || c == '"':
			lx.lexString(c)
			lx.emit(tsString, start, line)
		case c == '`':
			lx.pos++
			lx.lexTemplate(start, line)
		case c == '/' && lx.regexAllowed():
			lx.lexRegex()
			lx.emit(tsRegex, start, line)
		case isIdentStart(lx.src[lx.pos:]):
			for lx.pos < len(lx.src) && isIdentPart(lx.src[lx.pos:]) {
				_, size := utf8.DecodeRune(lx.src[lx.pos:])
				lx.pos += size
			}

			lx.emit(tsIdent, start, line)
		case c >= '0' && c <= '9':
			for lx.pos < len(lx.src) && isNumberPart(lx.src[lx.pos]) {
				lx.pos++
			}

			lx.emit(tsNumber, start, line)
		default:
			if inSubstitution {
				switch c {
				case '{':
					depth++
				case '}':
					if depth == 0 {
						return // the caller consumes the closing brace
					}

					depth--
				}
			}

			_, size := utf8.DecodeRune(lx.src[lx.pos:])
			lx.pos += size
			lx.emit(tsPunct, start, line)
		}
	}
}

// lexString moves past a quoted string. A string ends at its closing quote or,
// unterminated, at the end of the line.
func (lx *tsLexer) lexString(quote byte) {
	lx.pos++

	for lx.pos < len(lx.src) {
		c := lx.src[lx.pos]

		switch {
		case c == '\\' && lx.pos+1 < len(lx.src):
			lx.pos++
			lx.advance()
		case c == quote:
			lx.pos++

			return
		case c == '\n':
			return
		default:
			lx.pos++
		}
	}
}

// lexTemplate lexes a template literal after its opening backtick: its text
// parts become template tokens and its substitutions are lexed as code.
func (lx *tsLexer) lexTemplate(start, line int) {
	for lx.pos < len(lx.src) {
		c := lx.src[lx.pos]

		switch {
		case c == '\\' && lx.pos+1 < len(lx.src):
			lx.pos++
			lx.advance()
		case c == '`':
			lx.pos++
			lx.emit(tsTemplate, start, line)

			return
		case c == '$' && lx.next() == '{':
			lx.pos += 2
			lx.emit(tsTemplate, start, line)
			lx.lexCode(true)

			if lx.pos < len(lx.src) {
				lx.pos++ // the closing brace
			}

			start, line = lx.pos, lx.line
		default:
			lx.advance()
		}
	}

	lx.emit(tsTemplate, start, line)
}

// lexRegex moves past a regular expression literal and its flags. It ends at
// the closing slash outside a character class or, unterminated, at the end of
// the line.
func (lx *tsLexer) lexRegex() {
	lx.pos++
	inClass := false

	for lx.pos < len(lx.src) {
		c := lx.src[lx.pos]

		switch {
		case c == '\\' && lx.pos+1 < len(lx.src) && lx.src[lx.pos+1] != '\n':
			lx.pos += 2
		case c == '\n':
			return
		case c == '[':
			inClass = true
			lx.pos++
		case c == ']':
			inClass = false
			lx.pos++
		case c == '/' && !inClass:
			lx.pos++

			for lx.pos < len(lx.src) && isASCIILetter(lx.src[lx.pos]) {
				lx.pos++
			}

			return
		default:
			lx.pos++
		}
	}
}

func isASCIILetter(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func isIdentStart(b []byte) bool {
	r, _ := utf8.DecodeRune(b)

	return r == '_' || r == '$' || unicode.IsLetter(r)
}

func isIdentPart(b []byte) bool {
	r, _ := utf8.DecodeRune(b)

	return r == '_' || r == '$' || unicode.IsLetter(r) || unicode.IsDigit(r)
}

func isNumberPart(c byte) bool {
	return (c >= '0' && c <= '9') || isASCIILetter(c) || c == '.' || c == '_'
}
