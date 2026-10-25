// This file contains code from godotenv (https://github.com/joho/godotenv), which is a go port
// of the ruby dotenv library (https://github.com/bkeepers/dotenv), licensed under the MIT license.
//
// Copyright (c) 2023-present Eser Ozvataf
// Copyright (c) 2013 John Barton

package envparser

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/eser/stack/pkg/ajan/lib"
)

const (
	charComment       = '#'
	prefixSingleQuote = '\''
	prefixDoubleQuote = '"'

	exportPrefix = "export"
)

var (
	ErrZeroLengthString        = errors.New("zero length string")
	ErrKeyNameNotFound         = errors.New("key name not found")
	ErrUnexpectedChar          = errors.New("unexpected character")
	ErrUnterminatedQuotedValue = errors.New("unterminated quoted value")
)

var ErrParsingError = errors.New("parsing error")

// statement is one KEY=value line; expand marks an unquoted value, the only
// kind whose ${NAME} and $NAME references are expanded.
type statement struct {
	key    string
	value  string
	expand bool
}

// ParseBytes reads .env text into out, in the dialect of @std/dotenv (see
// the configfx README). Unquoted values are expanded after the whole file is
// read, so a reference can name a key defined further down, as in
// @std/dotenv.
func ParseBytes(data []byte, keyCaseInsensitive bool, out *map[string]any) error {
	src := bytes.ReplaceAll(data, []byte("\r\n"), []byte("\n"))
	cutset := src

	var statements []statement

	for {
		cutset = getStatementStart(cutset)
		if cutset == nil {
			// reached end of file
			break
		}

		key, left, err := locateKeyName(cutset)
		if err != nil {
			return err
		}

		value, expand, left, err := extractVarValue(left)
		if err != nil {
			return err
		}

		statements = append(statements, statement{key: key, value: value, expand: expand})
		cutset = left
	}

	// References resolve against this file's values as written, then the
	// keys earlier sources loaded.
	vars := maps.Clone(*out)
	if vars == nil {
		vars = map[string]any{}
	}

	for _, st := range statements {
		set(&vars, keyCaseInsensitive, st.key, st.value)
	}

	for _, st := range statements {
		value := st.value
		if st.expand {
			value = expandVariables(value, &vars)
		}

		set(out, keyCaseInsensitive, st.key, value)
	}

	return nil
}

func set(m *map[string]any, keyCaseInsensitive bool, key string, value string) {
	if keyCaseInsensitive {
		lib.CaseInsensitiveSet(m, key, value)

		return
	}

	(*m)[key] = value
}

// getStatementPosition returns position of statement begin.
//
// It skips any comment line or non-whitespace character.
func getStatementStart(src []byte) []byte {
	pos := indexOfNonSpaceChar(src)
	if pos == -1 {
		return nil
	}

	src = src[pos:]
	if src[0] != charComment {
		return src
	}

	// skip comment section
	pos = bytes.IndexFunc(src, isCharFunc('\n'))
	if pos == -1 {
		return nil
	}

	return getStatementStart(src[pos:])
}

func extractKeyName(src []byte) (string, int, error) {
	for i, char := range src {
		rchar := rune(char)
		if !unicode.IsSpace(rchar) &&
			(unicode.IsLetter(rchar) || unicode.IsNumber(rchar) || char == '_' || char == '.') {
			continue
		}

		if char == '=' || char == ':' {
			key := string(src[0:i])

			return key, i + 1, nil
		}

		// Spaces or tabs between the key and the separator, as in KEY = value.
		if char == ' ' || char == '\t' {
			rest := bytes.TrimLeft(src[i:], " \t")
			if len(rest) > 0 && (rest[0] == '=' || rest[0] == ':') {
				return string(src[0:i]), len(src) - len(rest) + 1, nil
			}
		}

		return "", 0, fmt.Errorf(
			"%w (char=%q, src=%q)",
			ErrUnexpectedChar,
			char,
			src,
		)
	}

	return "", 0, fmt.Errorf(
		"%w (src=%q)",
		ErrKeyNameNotFound,
		src,
	)
}

// trimExportPrefix drops a leading `export ` word; a key that only starts
// with the letters (exported=1) keeps its name.
func trimExportPrefix(src []byte) []byte {
	rest, found := bytes.CutPrefix(src, []byte(exportPrefix))
	if !found || len(rest) == 0 || (rest[0] != ' ' && rest[0] != '\t') {
		return src
	}

	return lib.StringsTrimLeadingSpaceFromBytes(rest)
}

// locateKeyName locates and parses key name and returns rest of slice.
func locateKeyName(src []byte) (string, []byte, error) {
	newSrc := trimExportPrefix(src)

	key, offset, err := extractKeyName(newSrc)
	if err != nil {
		return "", nil, err
	}

	if len(newSrc) == 0 {
		return "", nil, fmt.Errorf(
			"%w (src=%q)",
			ErrZeroLengthString,
			newSrc,
		)
	}

	key = lib.StringsTrimTrailingSpace(key)
	// Spaces and tabs only: a newline right after the separator ends an
	// empty value, and the next line is the next statement.
	cutset := bytes.TrimLeft(newSrc[offset:], " \t")

	return key, cutset, nil
}

func extractUnquotedVarValue(src []byte) (string, []byte) {
	// unquoted value - read until end of line
	endOfLine := bytes.IndexFunc(src, isLineEnd)

	// Hit EOF without a trailing newline
	if endOfLine == -1 {
		endOfLine = len(src)

		if endOfLine == 0 {
			return "", nil
		}
	}

	// Convert line to rune away to do accurate countback of runes
	line := []rune(string(src[0:endOfLine]))

	// Assume end of line is end of var
	endOfVar := len(line)
	if endOfVar == 0 {
		return "", src[endOfLine:]
	}

	// Work backwards to check if the line ends in whitespace then
	// a comment (ie asdasd # some comment)
	for i := endOfVar - 1; i >= 0; i-- {
		if line[i] == charComment && i > 0 {
			if isSpace(line[i-1]) {
				endOfVar = i

				break
			}
		}
	}

	trimmed := strings.TrimFunc(string(line[0:endOfVar]), isSpace)

	return trimmed, src[endOfLine:]
}

// extractQuotedVarValue reads a quoted value, which may span lines. A
// double-quoted value ends at the first quote not escaped with a backslash
// and has its escapes applied; a single-quoted one ends at the next single
// quote and is taken as written. Neither is expanded. One newline right
// after the opening quote and one right before the closing quote are
// dropped, as in @std/dotenv.
func extractQuotedVarValue(src []byte, quote byte) (string, []byte, error) {
	for i := 1; i < len(src); i++ {
		if quote == prefixDoubleQuote && src[i] == '\\' {
			i++

			continue
		}

		if src[i] != quote {
			continue
		}

		value := string(src[1:i])
		value = strings.TrimPrefix(value, "\n")
		value = strings.TrimSuffix(value, "\n")

		if quote == prefixDoubleQuote {
			value = expandEscapes(value)
		}

		return value, src[i+1:], nil
	}

	// return formatted error if quoted string is not terminated
	valEndIndex := bytes.IndexFunc(src, isCharFunc('\n'))
	if valEndIndex == -1 {
		valEndIndex = len(src)
	}

	return "", nil, fmt.Errorf(
		"%w (src=%q)",
		ErrUnterminatedQuotedValue,
		src[:valEndIndex],
	)
}

// extractVarValue extracts the value, whether it is expanded (unquoted
// values only) and the rest of the slice.
func extractVarValue(src []byte) (string, bool, []byte, error) {
	quote, hasPrefix := hasQuotePrefix(src)

	if !hasPrefix {
		value, left := extractUnquotedVarValue(src)

		return value, true, left, nil
	}

	value, left, err := extractQuotedVarValue(src, quote)

	return value, false, left, err
}

// doubleQuoteEscapes are the escapes of a double-quoted value; any other
// backslash pair stays as written.
var doubleQuoteEscapes = map[byte]byte{ //nolint:gochecknoglobals // a lookup table
	'n':  '\n',
	'r':  '\r',
	't':  '\t',
	'"':  '"',
	'\'': '\'',
	'\\': '\\',
}

func expandEscapes(str string) string {
	var out strings.Builder

	out.Grow(len(str))

	for i := 0; i < len(str); i++ {
		if str[i] == '\\' && i+1 < len(str) {
			if replacement, ok := doubleQuoteEscapes[str[i+1]]; ok {
				out.WriteByte(replacement)
			} else {
				out.WriteString(str[i : i+2])
			}

			i++

			continue
		}

		out.WriteByte(str[i])
	}

	return out.String()
}

func indexOfNonSpaceChar(src []byte) int {
	return bytes.IndexFunc(src, func(r rune) bool {
		return !unicode.IsSpace(r)
	})
}

// hasQuotePrefix reports whether charset starts with single or double quote and returns quote character.
func hasQuotePrefix(src []byte) (byte, bool) {
	if len(src) == 0 {
		return 0, false
	}

	switch prefix := src[0]; prefix {
	case prefixDoubleQuote, prefixSingleQuote:
		return prefix, true
	default:
		return 0, false
	}
}

func isCharFunc(char rune) func(rune) bool {
	return func(v rune) bool {
		return v == char
	}
}

// isSpace reports whether the rune is a space character but not line break character
//
// this differs from unicode.IsSpace, which also applies line break as space.
func isSpace(r rune) bool {
	switch r {
	case '\t', '\v', '\f', '\r', ' ', 0x85, 0xA0: //nolint:mnd
		return true
	}

	return false
}

func isLineEnd(r rune) bool {
	if r == '\n' || r == '\r' {
		return true
	}

	return false
}

// maxExpandPasses bounds the expansion of a value whose references expand
// to more references; a self reference (A=$A) stops once nothing changes.
const maxExpandPasses = 10

// expandVariables expands ${NAME}, ${NAME:-default}, $NAME and
// $NAME:-default in an unquoted value, again while a pass changes it.
func expandVariables(value string, vars *map[string]any) string {
	for range maxExpandPasses {
		next := expandOnce(value, vars)
		if next == value {
			break
		}

		value = next
	}

	return value
}

// expandOnce is one pass of @std/dotenv's expansion. ${...} always expands;
// $NAME stays as written after a backslash. A default after :- runs to the
// closing brace, or to the end of the value for $NAME.
func expandOnce(value string, vars *map[string]any) string { //nolint:cyclop // one branch per reference form
	var out strings.Builder

	for i := 0; i < len(value); {
		if value[i] != '$' {
			out.WriteByte(value[i])
			i++

			continue
		}

		if i+1 < len(value) && value[i+1] == '{' {
			end := strings.IndexByte(value[i+2:], '}')
			if end > 0 {
				name, fallback, hasDefault := strings.Cut(value[i+2:i+2+end], ":-")
				if name == "" || fallback == "" {
					name, hasDefault = value[i+2:i+2+end], false
				}

				out.WriteString(resolveVar(vars, name, fallback, hasDefault))
				i += end + 3

				continue
			}
		}

		end := i + 1
		for end < len(value) && isWordByte(value[end]) {
			end++
		}

		if end == i+1 || (i > 0 && value[i-1] == '\\') {
			out.WriteByte('$')
			i++

			continue
		}

		name := value[i+1 : end]
		if fallback, ok := strings.CutPrefix(value[end:], ":-"); ok && fallback != "" {
			out.WriteString(resolveVar(vars, name, fallback, true))

			break
		}

		out.WriteString(resolveVar(vars, name, "", false))
		i = end
	}

	return out.String()
}

func isWordByte(c byte) bool {
	return c == '_' || ('0' <= c && c <= '9') || ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z')
}

// resolveVar is the value of name, else the default, else "" (@std/dotenv
// falls back to the process environment and then prints "undefined").
func resolveVar(vars *map[string]any, name, fallback string, hasDefault bool) string {
	if value, ok := lookupVar(vars, name); ok {
		return value
	}

	if hasDefault {
		return fallback
	}

	return ""
}

// lookupVar resolves an expanded ${NAME}, and reports whether it is defined.
//
// This used to be a bare map index followed by a `.(string)` assertion, which
// panicked two ways: an undefined name indexes to an untyped nil, and a name
// defined through a case-insensitive parse is stored under a normalised key
// that a literal-case index never finds -- so it panicked even when the
// variable existed. A panic here is not survivable by the caller: the same code
// runs inside the cgo bridge, where it unwinds past the FFI boundary and aborts
// the host process.
//
// Undefined expands to empty, following POSIX shells and godotenv, which this
// parser is a port of.
func lookupVar(m *map[string]any, name string) (string, bool) {
	value, ok := lib.CaseInsensitiveGet(*m, name)
	if !ok {
		return "", false
	}

	if text, isText := value.(string); isText {
		return text, true
	}

	// A merged JSON source can put numbers and booleans in here. Rendering
	// beats asserting: the value is going into a string either way.
	return fmt.Sprint(value), true
}

func Parse(m *map[string]any, keyCaseInsensitive bool, r io.Reader) error { //nolint:varnamelen
	var buf bytes.Buffer

	_, err := io.Copy(&buf, r)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrParsingError, err)
	}

	return ParseBytes(buf.Bytes(), keyCaseInsensitive, m)
}

func tryParseFile(
	m *map[string]any, //nolint:varnamelen
	keyCaseInsensitive bool,
	filename string,
) (err error) {
	file, fileErr := os.Open(filepath.Clean(filename))
	if fileErr != nil {
		if os.IsNotExist(fileErr) {
			return nil
		}

		return fmt.Errorf("%w: %w", ErrParsingError, fileErr)
	}

	// Assign only when the parse itself succeeded. This used to be a bare
	// `err = file.Close()`, which overwrote the named return unconditionally --
	// so Close's nil erased the parse error and a truncated or malformed file
	// was indistinguishable from a valid one.
	defer func() {
		closeErr := file.Close()
		if err == nil && closeErr != nil {
			err = fmt.Errorf("%w: %w", ErrParsingError, closeErr)
		}
	}()

	return Parse(m, keyCaseInsensitive, file)
}

func TryParseFiles(m *map[string]any, keyCaseInsensitive bool, filenames ...string) error {
	for _, filename := range filenames {
		err := tryParseFile(m, keyCaseInsensitive, filename)
		if err != nil {
			return err
		}
	}

	return nil
}
