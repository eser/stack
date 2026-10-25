// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/muxfx/vt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The dashboard paints Claude Code from the screens the server sends. These
// tests play a Claude Code session recorded on a pseudo-terminal (the muxfx
// fidelity corpus, whose snapshots came from @xterm/headless) through the
// dashboard's multiplexer and its /mux hub, as `noskills web` runs it, and
// compare what the frames paint with the recorded screens: the trust prompt,
// the start screen, /help typed and the /help screen with its tabs.
//
// The frames are kept in testdata/claude_code_screens.json.gz with the
// screens they must paint, so browser_scripts.test.ts can paint the same
// frames with mux-render.js. Regenerate the file after a protocol change
// with:
//
//	go test ./pkg/ajan/noskillsserverfx/ -run TestDashboardPaintsTheClaudeCodeCorpus -update-screens

var updateScreens = flag.Bool("update-screens", false, "rewrite testdata/claude_code_screens.json.gz") //nolint:gochecknoglobals // a test flag

const (
	// claudeCorpusCase is the corpus case played: Claude Code at 100 by 30.
	claudeCorpusCase = "pty-claude-100x30"

	// claudeScreensFixture holds the frames and the screens they paint.
	claudeScreensFixture = "testdata/claude_code_screens.json.gz"

	// screenSettle bounds the wait for one step's frames, past the
	// synchronized-output hold.
	screenSettle = 5 * time.Second
)

type corpusFile struct {
	Source string       `json:"source"`
	Cases  []corpusCase `json:"cases"`
}

type corpusCase struct {
	Name  string       `json:"name"`
	Cols  int          `json:"cols"`
	Rows  int          `json:"rows"`
	Steps []corpusStep `json:"steps"`
}

type corpusStep struct {
	Write       *string       `json:"write"`
	WriteBase64 *string       `json:"writeBase64"`
	Resize      []int         `json:"resize"`
	Expect      *paintedScene `json:"expect"`
}

// paintedScene is what a screen shows, in the corpus snapshot's terms.
type paintedScene struct {
	Cursor       struct{ X, Y int } `json:"cursor"`
	CursorHidden bool               `json:"cursorHidden,omitempty"`
	Alt          bool               `json:"alt,omitempty"`
	Lines        []string           `json:"lines"`
	Widths       [][3]int           `json:"widths,omitempty"`
	Styles       []paintedStyleRun  `json:"styles,omitempty"`
	Title        string             `json:"title,omitempty"`
}

type paintedStyleRun struct {
	Row   int    `json:"row"`
	Col   int    `json:"col"`
	Len   int    `json:"len"`
	Style string `json:"style"`
}

// screensFixture is the file browser_scripts.test.ts paints.
type screensFixture struct {
	Source string        `json:"source"`
	Case   string        `json:"case"`
	Pane   string        `json:"pane"`
	Cols   int           `json:"cols"`
	Rows   int           `json:"rows"`
	Steps  []screensStep `json:"steps"`
}

// screensStep is the screen messages one corpus step brought and the screen
// they paint.
type screensStep struct {
	Frames []json.RawMessage `json:"frames"`
	Expect paintedScene      `json:"expect"`
}

func loadClaudeCorpusCase(t testing.TB) (string, corpusCase) {
	t.Helper()

	compressed, err := os.ReadFile(filepath.Join("..", "muxfx", "testdata", "vt_corpus.json.gz"))
	require.NoError(t, err)

	reader, err := gzip.NewReader(bytes.NewReader(compressed))
	require.NoError(t, err)

	raw, err := io.ReadAll(reader)
	require.NoError(t, err)

	var corpus corpusFile

	require.NoError(t, json.Unmarshal(raw, &corpus))

	for _, c := range corpus.Cases {
		if c.Name == claudeCorpusCase {
			return corpus.Source, c
		}
	}

	require.FailNow(t, "the corpus has no case "+claudeCorpusCase)

	return "", corpusCase{} //nolint:exhaustruct // unreachable
}

// stepBytes is what a corpus step writes.
func stepBytes(t testing.TB, step *corpusStep) []byte {
	t.Helper()

	switch {
	case step.Write != nil:
		return []byte(*step.Write)
	case step.WriteBase64 != nil:
		data, err := base64.StdEncoding.DecodeString(*step.WriteBase64)
		require.NoError(t, err)

		return data
	default:
		return nil
	}
}

// screenPainter applies screen messages to a copy of a pane's screen, as
// mux-render.js does, and reads it back as the corpus snapshots read a
// terminal.
type screenPainter struct {
	cols, rows int
	lines      [][]vt.Cell
	history    []string
	cursor     muxfx.ScreenCursor
	alt        bool
	title      string
	mouse      string
	links      map[uint32]muxfx.ScreenLink
}

func newScreenPainter() *screenPainter {
	return &screenPainter{links: map[uint32]muxfx.ScreenLink{}} //nolint:exhaustruct
}

func (p *screenPainter) apply(update *muxfx.ScreenUpdate) {
	if update.Full || update.Cols != p.cols || update.Rows != p.rows {
		p.cols, p.rows = update.Cols, update.Rows
		p.lines = make([][]vt.Cell, p.rows)

		for row := range p.lines {
			p.lines[row] = vt.RunCells(nil, p.cols)
		}
	}

	for _, link := range update.Links {
		p.links[link.Link] = link
	}

	if update.Full {
		p.history = nil
	}

	if update.History != nil {
		if update.History.Reset {
			p.history = nil
		}

		for _, line := range update.History.Lines {
			p.history = append(p.history, runsText(line.Runs))
		}
	}

	for _, line := range update.Lines {
		runs := make([]vt.Run, len(line.Runs))

		for i, r := range line.Runs {
			runs[i] = vt.Run{
				Text: r.Text, Attrs: vt.Attrs(update.Styles[r.Style]), Width: r.Width, Cells: r.Cells,
				Cluster: r.Cluster, Link: r.Link,
			}
		}

		p.lines[line.Row] = vt.RunCells(runs, p.cols)
	}

	p.cursor = update.Cursor
	p.alt = update.AltScreen
	p.title = update.Title
	p.mouse = update.Mouse
}

// runsText is the text of a row's runs, blank cells as spaces.
func runsText(runs []muxfx.ScreenRun) string {
	var text strings.Builder

	for _, r := range runs {
		if r.Text == "" {
			text.WriteString(strings.Repeat(" ", r.Cells))
		} else {
			text.WriteString(r.Text)
		}
	}

	return text.String()
}

// text is the history and the screen, one line each.
func (p *screenPainter) text() string {
	return strings.Join(append(append([]string{}, p.history...), p.scene().Lines...), "\n")
}

// scene reads the screen cell by cell, as the corpus recorder read
// xterm.js.
func (p *screenPainter) scene() paintedScene {
	out := paintedScene{ //nolint:exhaustruct
		CursorHidden: !p.cursor.Visible, Alt: p.alt, Title: p.title, Lines: make([]string, 0, p.rows),
	}
	out.Cursor.X, out.Cursor.Y = p.cursor.X, p.cursor.Y

	for row, cells := range p.lines {
		var text strings.Builder

		var run *paintedStyleRun

		for col, c := range cells {
			if c.Width != 1 {
				out.Widths = append(out.Widths, [3]int{row, col, c.Width})
			}

			if c.Width != 0 {
				text.WriteString(c.Text())
			}

			key := p.styleKey(c)
			if run != nil && run.Style == key {
				run.Len++

				continue
			}

			if run != nil && run.Style != "" {
				out.Styles = append(out.Styles, *run)
			}

			run = &paintedStyleRun{Row: row, Col: col, Len: 1, Style: key}
		}

		if run != nil && run.Style != "" {
			out.Styles = append(out.Styles, *run)
		}

		out.Lines = append(out.Lines, text.String())
	}

	return out
}

func corpusColorKey(c vt.Color) string {
	switch c.Mode {
	case vt.ColorPalette16:
		return fmt.Sprintf("16:%d", c.Value)
	case vt.ColorPalette256:
		return fmt.Sprintf("256:%d", c.Value)
	case vt.ColorRGB:
		return fmt.Sprintf("rgb:%06x", c.Value)
	case vt.ColorDefault:
		return ""
	default:
		return fmt.Sprintf("?%d:%d", c.Mode, c.Value)
	}
}

// styleKey names a cell's style as the corpus recorder does.
func (p *screenPainter) styleKey(c vt.Cell) string {
	parts := make([]string, 0, 12)

	if fg := corpusColorKey(c.Attrs.Fg); fg != "" {
		parts = append(parts, "fg="+fg)
	}

	if bg := corpusColorKey(c.Attrs.Bg); bg != "" {
		parts = append(parts, "bg="+bg)
	}

	flags := []struct {
		flag vt.Flags
		name string
	}{
		{vt.FlagBold, "bold"}, {vt.FlagDim, "dim"}, {vt.FlagItalic, "italic"}, {vt.FlagUnderline, "underline"},
		{vt.FlagBlink, "blink"}, {vt.FlagInverse, "inverse"}, {vt.FlagInvisible, "invisible"},
		{vt.FlagStrikethrough, "strikethrough"}, {vt.FlagOverline, "overline"},
	}

	for _, f := range flags {
		if c.Attrs.Flags&f.flag != 0 {
			parts = append(parts, f.name)
		}
	}

	if c.Attrs.Flags&vt.FlagUnderline != 0 && c.Attrs.Underline != vt.UnderlineSingle {
		parts = append(parts, fmt.Sprintf("underline-style=%d", c.Attrs.Underline))
	}

	if ul := corpusColorKey(c.Attrs.UnderlineColor); ul != "" && c.Attrs.Flags&vt.FlagUnderline != 0 {
		parts = append(parts, "underline-color="+ul)
	}

	if c.Link != 0 {
		link, ok := p.links[c.Link]
		if !ok {
			link.URI = "?"
		}

		parts = append(parts, "link="+link.ID+";"+link.URI)
	}

	return strings.Join(parts, " ")
}

// screenFrames are the screen messages of pane among a socket's frames.
func screenFrames(t *testing.T, frames []string, pane muxfx.PaneID) []json.RawMessage {
	t.Helper()

	var out []json.RawMessage

	for _, frame := range frames {
		var msg struct {
			T    muxfx.MessageType `json:"t"`
			Pane muxfx.PaneID      `json:"pane"`
		}

		require.NoError(t, json.Unmarshal([]byte(frame), &msg))

		if msg.T == muxfx.MessageScreen && msg.Pane == pane {
			out = append(out, json.RawMessage(frame))
		}
	}

	return out
}

func paintFrames(t *testing.T, painter *screenPainter, frames []json.RawMessage) {
	t.Helper()

	for _, frame := range frames {
		var msg muxfx.ServerToFrontend

		require.NoError(t, json.Unmarshal(frame, &msg))
		require.NotNil(t, msg.Screen)
		painter.apply(msg.Screen)
	}
}

// corpusExpectation is the part of a corpus snapshot the dashboard paints.
func corpusExpectation(expect *paintedScene) paintedScene {
	return paintedScene{
		Cursor: expect.Cursor, CursorHidden: expect.CursorHidden, Alt: expect.Alt, Lines: expect.Lines,
		Widths: expect.Widths, Styles: expect.Styles, Title: expect.Title,
	}
}

// TestDashboardPaintsTheClaudeCodeCorpus plays Claude Code's start screen
// and /help through the dashboard's server and hub, as an attached browser
// sees them, and checks that the screen
// messages paint the recorded screens: text, wide cells, styles, the cursor,
// the alternate screen and the title.
func TestDashboardPaintsTheClaudeCodeCorpus(t *testing.T) {
	t.Parallel()

	source, corpus := loadClaudeCorpusCase(t)

	f := newDashboardFixture(t)

	_, err := f.d.mux.createTab(t.Context(), nil)
	require.NoError(t, err)

	pane := f.host.onlyPane(t)
	socket := &recordingSocket{} //nolint:exhaustruct

	// The dashboard reserves no chrome and draws a one-cell border, so this
	// viewport gives the pane the recorded size.
	f.d.mux.attachSocket(socket)
	f.d.mux.deliver(&muxfx.FrontendToServer{ //nolint:exhaustruct
		T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: corpus.Cols + 2, Rows: corpus.Rows + 2},
	})

	painter := newScreenPainter()
	fixture := screensFixture{
		Source: source, Case: corpus.Name, Pane: string(pane), Cols: corpus.Cols, Rows: corpus.Rows, Steps: nil,
	}
	seen := 0

	for i := range corpus.Steps {
		step := &corpus.Steps[i]
		if step.Resize != nil {
			break // the start screen and /help come before the first resize
		}

		require.NotNil(t, step.Expect)
		f.host.output(pane, string(stepBytes(t, step)))

		want := corpusExpectation(step.Expect)

		var frames []json.RawMessage

		deadline := time.Now().Add(screenSettle)

		for {
			all, _ := socket.state()
			frames = screenFrames(t, all, pane)

			stepPainter := newScreenPainter()
			paintFrames(t, stepPainter, frames)

			if stepPainter.cols == corpus.Cols && stepPainter.rows == corpus.Rows {
				got := stepPainter.scene()
				if assert.ObjectsAreEqual(want, got) || time.Now().After(deadline) {
					break
				}
			} else if time.Now().After(deadline) {
				break
			}

			time.Sleep(5 * time.Millisecond)
		}

		stepFrames := frames[seen:]
		seen = len(frames)

		paintFrames(t, painter, stepFrames)
		require.Equal(t, corpus.Cols, painter.cols, "step %d: pane width", i)
		require.Equal(t, corpus.Rows, painter.rows, "step %d: pane height", i)
		require.Equal(t, want, painter.scene(), "step %d of %s", i, corpus.Name)

		fixture.Steps = append(fixture.Steps, screensStep{Frames: stepFrames, Expect: want})
	}

	require.GreaterOrEqual(t, len(fixture.Steps), 5, "the steps before the first resize")
	assert.True(t, fixture.Steps[2].Expect.Alt, "step 2 is Claude Code's start screen on the alternate screen")
	assert.Contains(t, strings.Join(fixture.Steps[4].Expect.Lines, "\n"), "Shortcuts", "step 4 is the /help screen")

	checkScreensFixture(t, &fixture)
}

// checkScreensFixture compares the frames with the fixture the browser
// harness paints, or rewrites it with -update-screens.
func checkScreensFixture(t *testing.T, fixture *screensFixture) {
	t.Helper()

	encoded, err := json.Marshal(fixture)
	require.NoError(t, err)

	if *updateScreens {
		var out bytes.Buffer

		// No name or time in the header, so the file only changes with the
		// frames.
		writer, err := gzip.NewWriterLevel(&out, gzip.BestCompression)
		require.NoError(t, err)

		_, err = writer.Write(encoded)
		require.NoError(t, err)
		require.NoError(t, writer.Close())
		require.NoError(t, os.WriteFile(claudeScreensFixture, out.Bytes(), 0o600))

		return
	}

	compressed, err := os.ReadFile(claudeScreensFixture)
	require.NoError(t, err, "run the test with -update-screens to write the fixture")

	reader, err := gzip.NewReader(bytes.NewReader(compressed))
	require.NoError(t, err)

	stored, err := io.ReadAll(reader)
	require.NoError(t, err)

	assert.JSONEq(t, string(stored), string(encoded),
		"the frames changed; run the test with -update-screens and check browser_scripts.test.ts")
}
