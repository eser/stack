// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"fmt"
	"os"

	"golang.org/x/term"
)

// The confirm and select prompts of @eserstack/shell/tui (confirm.ts,
// select.ts), drawn as multiselect in init.go draws its prompt: arrow keys
// move, Enter accepts, Escape cancels, and so does the end of the input.

// stdinIsTerminal reports whether stdin is a terminal, which
// detectInteraction checks before a command asks anything.
func stdinIsTerminal(e *env) bool {
	file, ok := e.stdin.(*os.File)
	if !ok {
		return false
	}

	return term.IsTerminal(int(file.Fd())) //nolint:gosec // G115: a file descriptor fits an int
}

func (l *lifecycleRun) readKey(buf []byte) (string, bool) {
	for {
		n, err := l.e.stdin.Read(buf)
		if n > 0 {
			return string(buf[:n]), true
		}

		if err != nil {
			return "", false
		}
	}
}

func (l *lifecycleRun) startPrompt(t *tui) func() {
	t.raw("\x1b[?25l")

	restore := func() {}
	if l.e.rawInput != nil {
		restore = l.e.rawInput()
	}

	return func() {
		restore()
		t.raw("\x1b[?25h")
	}
}

func clearPrompt(t *tui, lines int) {
	if lines > 0 {
		t.raw(fmt.Sprintf("\x1b[%dA\x1b[J", lines))
	}
}

// confirm asks a yes or no question; cancelled is set when nothing was
// accepted.
func (l *lifecycleRun) confirm(t *tui, message string) (answer, cancelled bool) {
	value := true

	frame := func() int {
		yes := t.style(green, "●") + " Yes"
		no := t.style(dim, "○") + t.style(dim, " No")

		if !value {
			yes = t.style(dim, "○") + t.style(dim, " Yes")
			no = t.style(green, "●") + " No"
		}

		t.line(t.style(cyan, "◆"), "  "+message)
		t.line(t.style(dim, "│"), "  ", yes, t.style(dim, " / "), no)
		t.line(t.style(dim, "└"))

		return 3
	}

	done := l.startPrompt(t)
	defer done()

	lines := frame()
	buf := make([]byte, 64)

	for {
		key, ok := l.readKey(buf)
		if !ok {
			return false, true
		}

		switch key {
		case "\x03", "\x1b":
			clearPrompt(t, lines)
			t.line(t.style(red, "■"), "  "+message)

			if key == "\x03" {
				done()
				l.exit(130)
			}

			return false, true
		case "\r", "\n":
			clearPrompt(t, lines)

			label := "No"
			if value {
				label = "Yes"
			}

			t.line(t.style(green, "◇"), "  "+message, t.style(dim, " · "+label))

			return value, false
		case "\x1b[C", "\x1b[D":
			value = !value
		case "y", "Y":
			value = true
		case "n", "N":
			value = false
		default:
			continue
		}

		clearPrompt(t, lines)
		lines = frame()
	}
}

// selectOne asks for one of the options and returns its index.
func (l *lifecycleRun) selectOne(t *tui, message string, options []choice) (int, bool) {
	cursor := 0

	frame := func() int {
		t.line(t.style(cyan, "◆"), "  "+message)

		for i, opt := range options {
			radio := t.style(dim, "○")
			label := t.style(dim, " "+opt.label)

			if i == cursor {
				radio = t.style(green, "●")
				label = " " + opt.label
			}

			hint := ""
			if opt.hint != "" {
				hint = t.style(dim, "  ("+opt.hint+")")
			}

			t.line(t.style(dim, "│"), "  ", radio, label, hint)
		}

		t.line(t.style(dim, "└"))

		return len(options) + 2
	}

	done := l.startPrompt(t)
	defer done()

	lines := frame()
	buf := make([]byte, 64)

	for {
		key, ok := l.readKey(buf)
		if !ok {
			return 0, true
		}

		switch key {
		case "\x03", "\x1b":
			clearPrompt(t, lines)
			t.line(t.style(red, "■"), "  "+message)

			if key == "\x03" {
				done()
				l.exit(130)
			}

			return 0, true
		case "\r", "\n":
			clearPrompt(t, lines)
			t.line(t.style(green, "◇"), "  "+message, t.style(dim, " · "+options[cursor].label))

			return cursor, false
		case "\x1b[A", "k":
			cursor = (cursor - 1 + len(options)) % len(options)
		case "\x1b[B", "j":
			cursor = (cursor + 1) % len(options)
		default:
			continue
		}

		clearPrompt(t, lines)
		lines = frame()
	}
}
