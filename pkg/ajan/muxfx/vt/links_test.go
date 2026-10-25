// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

func osc8(params, uri string) string {
	return "\x1b]8;" + params + ";" + uri + "\x1b\\"
}

func TestLinksArePerCellAndClosedByAnEmptyURI(t *testing.T) {
	t.Parallel()

	term := vt.New(20, 2)
	term.WriteString("a" + osc8("", "https://example.com/a;b") + "link" + osc8("", "") + "b")

	if _, ok := term.CellLink(0, 0); ok {
		t.Error("cell 0,0 has a link before the OSC 8")
	}

	for col := 1; col <= 4; col++ {
		link, ok := term.CellLink(0, col)
		if !ok || link.URI != "https://example.com/a;b" {
			t.Errorf("cell 0,%d link = %+v, %v, want the URI with its semicolon", col, link, ok)
		}
	}

	if _, ok := term.CellLink(0, 5); ok {
		t.Error("cell 0,5 has a link after the closing OSC 8")
	}
}

func TestLinksWithTheSameIDShareALinkID(t *testing.T) {
	t.Parallel()

	term := vt.New(20, 2)
	term.WriteString(osc8("id=a", "http://one") + "1" + osc8("", "") + " " +
		osc8("id=a", "http://one") + "2" + osc8("id=b", "http://one") + "3" + osc8("", "http://one") + "4")

	first, second := term.Cell(0, 0).Link, term.Cell(0, 2).Link
	if first == 0 || first != second {
		t.Errorf("the two id=a parts have link ids %d and %d, want one shared id", first, second)
	}

	if other := term.Cell(0, 3).Link; other == first {
		t.Error("id=b shares id=a's link id")
	}

	if anonymous := term.Cell(0, 4).Link; anonymous == first || anonymous == term.Cell(0, 3).Link {
		t.Error("a link without an id shares another link's id")
	}

	if link, _ := term.Link(first); link.ID != "a" || link.URI != "http://one" {
		t.Errorf("link %d = %+v, want id a and http://one", first, link)
	}
}

func TestLinksSurviveSGRResetAndLeaveErasedCells(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 2)
	term.WriteString(osc8("", "http://x") + "ab\x1b[0mcd\x1b[1;2H\x1b[K")

	if _, ok := term.CellLink(0, 0); !ok {
		t.Error("cell 0,0 lost its link")
	}

	if _, ok := term.CellLink(0, 1); ok {
		t.Error("an erased cell kept its link")
	}

	term.WriteString("\x1b[2;1Hz")

	if _, ok := term.CellLink(1, 0); !ok {
		t.Error("text after SGR 0 has no link")
	}
}

func TestLinksResetWithTheTerminal(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 2)
	term.WriteString(osc8("", "http://x") + "a")
	old := term.Cell(0, 0).Link

	term.WriteString("\x1bcb")

	if _, ok := term.CellLink(0, 0); ok {
		t.Error("text after RIS has a link")
	}

	if _, ok := term.Link(old); ok {
		t.Error("RIS kept the old link in the table")
	}

	term.WriteString(osc8("", "http://y") + "c")

	if id := term.Cell(0, 1).Link; id == old {
		t.Errorf("a link after RIS reused id %d", id)
	}

	term.WriteString(osc8("", "http://z") + "d\x1b[!pe")

	if _, ok := term.CellLink(0, 3); ok {
		t.Error("text after DECSTR has a link")
	}
}

func TestLinkTableIsBounded(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 2)

	var first uint32

	for i := range 5000 {
		term.WriteString(osc8("", fmt.Sprintf("http://example.com/%d", i)) + "x\r")

		if i == 0 {
			first = term.Cell(0, 0).Link
		}
	}

	if _, ok := term.Link(first); ok {
		t.Error("the first of 5000 links is still in the table, want it dropped past 4096")
	}

	if link, ok := term.CellLink(0, 0); !ok || link.URI != "http://example.com/4999" {
		t.Errorf("the newest link = %+v, %v, want example.com/4999", link, ok)
	}

	// Long URIs fill the byte bound first.
	long := strings.Repeat("y", 2000)
	for i := range 1000 {
		term.WriteString(osc8("", fmt.Sprintf("http://%d/%s", i, long)) + "x\r")
	}

	if link, ok := term.CellLink(0, 0); !ok || !strings.HasPrefix(link.URI, "http://999/") {
		t.Errorf("the newest long link = %.20q, %v, want http://999/", link.URI, ok)
	}
}

func TestHistoryRunsKeepLinks(t *testing.T) {
	t.Parallel()

	term := vt.New(10, 2)
	term.WriteString(osc8("", "http://h") + "hi" + osc8("", "") + " x\r\n\r\n\r\n")

	lines := term.History(0, term.HistoryLen())
	if len(lines) == 0 {
		t.Fatal("no history")
	}

	runs := lines[0].Runs
	if len(runs) < 2 || runs[0].Text != "hi" || runs[0].Link == 0 || runs[1].Link != 0 {
		t.Fatalf("runs = %+v, want hi with a link, then text without", runs)
	}

	if link, ok := term.Link(runs[0].Link); !ok || link.URI != "http://h" {
		t.Errorf("history link = %+v, %v, want http://h", link, ok)
	}
}

func TestIsSafeLinkURI(t *testing.T) {
	t.Parallel()

	tests := []struct {
		uri  string
		want bool
	}{
		{"https://example.com/a?b=c", true},
		{"HTTP://example.com", true},
		{"mailto:someone@example.com", true},
		{"file:///tmp/report.txt", true},
		{"javascript:alert(1)", false},
		{"data:text/html,hi", false},
		{"vscode://open", false},
		{"/relative/path", false},
		{"http://[::1", false},
		{"", false},
	}

	for _, tc := range tests {
		if got := vt.IsSafeLinkURI(tc.uri); got != tc.want {
			t.Errorf("IsSafeLinkURI(%q) = %v, want %v", tc.uri, got, tc.want)
		}
	}
}
