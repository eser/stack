// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"io"
	"strings"
)

// The TypeScript commands print through @eserstack/streams' ANSI renderer,
// which styles every line whether or not the output is a terminal, and ends
// a styled line with a reset. These helpers write the same bytes.

const (
	ansiEscape = "\x1b["
	ansiReset  = ansiEscape + "0m"
)

func ansiStyle(open, closing string) func(string) string {
	return func(text string) string { return ansiEscape + open + text + ansiEscape + closing }
}

//nolint:gochecknoglobals // the renderer's fixed styles
var (
	bold   = ansiStyle("1m", "22m")
	dim    = ansiStyle("2m", "22m")
	red    = ansiStyle("31m", "39m")
	green  = ansiStyle("32m", "39m")
	yellow = ansiStyle("33m", "39m")
	cyan   = ansiStyle("36m", "39m")
	gray   = ansiStyle("90m", "39m")
)

// writeln writes one rendered line, as the renderer's writeln does.
func writeln(w io.Writer, parts ...string) {
	line := strings.Join(parts, "")
	if strings.Contains(line, ansiEscape) {
		line += ansiReset
	}

	_, _ = io.WriteString(w, line+"\n")
}

// write writes rendered text without a line break.
func write(w io.Writer, parts ...string) {
	text := strings.Join(parts, "")
	if strings.Contains(text, ansiEscape) {
		text += ansiReset
	}

	_, _ = io.WriteString(w, text)
}
