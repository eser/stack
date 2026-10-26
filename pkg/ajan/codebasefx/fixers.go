// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"bytes"
	"strings"
	"unicode/utf8"
)

// FixerFunc returns the fixed content of one file, and false when it has
// nothing to change. The fixers apply what the TypeScript tools of
// pkg/@eserstack/codebase write with --fix.
type FixerFunc func(path string, content []byte) ([]byte, bool)

// licenseHeader is the copyright line FixLicenseHeader writes.
const licenseHeader = "// Copyright " + licenseBaseYear +
	"-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license."

// FixEOF ends a non-empty file with exactly one newline.
func FixEOF(_ string, content []byte) ([]byte, bool) {
	if len(content) == 0 {
		return nil, false
	}

	fixed := append(bytes.Clone(bytes.TrimRight(content, "\n")), '\n')

	return changed(content, fixed)
}

// FixTrailingWhitespace removes the spaces and tabs at the end of each line
// of a text file.
func FixTrailingWhitespace(_ string, content []byte) ([]byte, bool) {
	if !utf8.Valid(content) {
		return nil, false
	}

	lines := bytes.Split(content, []byte("\n"))
	for i, line := range lines {
		lines[i] = bytes.TrimRight(line, " \t")
	}

	return changed(content, bytes.Join(lines, []byte("\n")))
}

// FixBOM removes a leading UTF-8 byte order mark.
func FixBOM(_ string, content []byte) ([]byte, bool) {
	if !bytes.HasPrefix(content, utf8BOM) {
		return nil, false
	}

	return bytes.Clone(content[len(utf8BOM):]), true
}

// FixLineEndings turns CRLF and lone CR line endings into LF.
func FixLineEndings(_ string, content []byte) ([]byte, bool) {
	if bytes.IndexByte(content, '\r') < 0 {
		return nil, false
	}

	fixed := bytes.ReplaceAll(content, []byte("\r\n"), []byte("\n"))
	fixed = bytes.ReplaceAll(fixed, []byte("\r"), []byte("\n"))

	return changed(content, fixed)
}

// FixLicenseHeader writes the copyright header, after a shebang line when
// there is one, or corrects its year. It skips the paths ValidateLicenseHeader
// skips.
func FixLicenseHeader(path string, content []byte) ([]byte, bool) {
	if len(content) == 0 || !utf8.Valid(content) || licenseSkipped(path) {
		return nil, false
	}

	shebangEnd := 0
	if bytes.HasPrefix(content, []byte("#!")) {
		if nl := bytes.IndexByte(content, '\n'); nl >= 0 {
			shebangEnd = nl + 1
		}
	}

	shebang, rest := content[:shebangEnd], content[shebangEnd:]

	match := licenseRx.FindSubmatch(rest)
	if match != nil {
		if string(match[1]) == licenseBaseYear {
			return nil, false
		}

		rest = rest[len(match[0]):]
	}

	fixed := make([]byte, 0, len(content)+len(licenseHeader)+1)
	fixed = append(fixed, shebang...)
	fixed = append(fixed, licenseHeader...)
	fixed = append(fixed, '\n')
	fixed = append(fixed, rest...)

	return changed(content, fixed)
}

// licenseSkipped reports whether path is a generated or documentation file
// that carries no license header.
func licenseSkipped(path string) bool {
	return strings.Contains(path, "/docs/") ||
		strings.Contains(path, "/etc/templates/") ||
		strings.HasSuffix(path, "manifest.gen.ts")
}

func changed(before, after []byte) ([]byte, bool) {
	if bytes.Equal(before, after) {
		return nil, false
	}

	return after, true
}
