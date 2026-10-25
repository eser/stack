// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

import (
	"net/url"
	"strings"
)

// OSC 8 hyperlinks (OSC 8 ; params ; URI ST) give the cells printed after
// them a link, until an OSC 8 with an empty URI or a new link. A cell holds
// the link's id ([Cell.Link]); the terminal's link table holds the URI and
// the "id=" parameter. Links whose parameters name the same id and URI share
// one link id, as in xterm.js, so a frontend can treat them as one link.
//
// The table is bounded. It keeps at most maxLinks links and maxLinkBytes of
// URIs and ids, and drops the oldest past either: a cell whose link was
// dropped then has no link ([Terminal.Link] reports false). A URI longer than
// maxLinkURI, or an id longer than maxLinkID, is not stored: the text after
// such a sequence has no link, or no shared id.
//
// URIs are stored as the program sent them. A frontend must check the scheme
// before it opens one; [IsSafeLinkURI] does that check.
const (
	maxLinks     = 4096
	maxLinkBytes = 1 << 20
	maxLinkURI   = 2048
	maxLinkID    = 256

	// linkEntrySize is what an entry costs outside its strings: the map
	// entries and the slot in the order list.
	linkEntrySize = 64
)

// Link is an OSC 8 hyperlink: the "id=" parameter the program gave, if any,
// and the URI.
type Link struct {
	ID  string `json:"id,omitempty"`
	URI string `json:"uri"`
}

// linkTable maps link ids to links, oldest first in order, bounded by
// maxLinks and maxLinkBytes.
type linkTable struct {
	byID  map[uint32]Link
	byKey map[string]uint32
	order []uint32
	head  int
	bytes int
	next  uint32
}

func newLinkTable() *linkTable {
	return &linkTable{byID: map[uint32]Link{}, byKey: map[string]uint32{}, next: 1}
}

func linkKey(id, uri string) string {
	return id + "\x00" + uri
}

func linkCost(l Link) int {
	return linkEntrySize + 2*len(l.ID) + 2*len(l.URI)
}

// register returns the link id for a link, reusing the one of an earlier
// link with the same id parameter and URI.
func (lt *linkTable) register(id, uri string) uint32 {
	if id != "" {
		if existing, ok := lt.byKey[linkKey(id, uri)]; ok {
			return existing
		}
	}

	linkID := lt.next

	lt.next++
	if lt.next == 0 {
		// After 2^32 links the ids start over; 0 means no link.
		lt.next = 1
	}

	l := Link{ID: id, URI: uri}
	lt.byID[linkID] = l
	lt.order = append(lt.order, linkID)
	lt.bytes += linkCost(l)

	if id != "" {
		lt.byKey[linkKey(id, uri)] = linkID
	}

	for len(lt.order)-lt.head > maxLinks || lt.bytes > maxLinkBytes {
		lt.evictOldest()
	}

	return linkID
}

func (lt *linkTable) evictOldest() {
	oldest := lt.order[lt.head]
	lt.head++

	if l, ok := lt.byID[oldest]; ok {
		delete(lt.byID, oldest)

		if l.ID != "" && lt.byKey[linkKey(l.ID, l.URI)] == oldest {
			delete(lt.byKey, linkKey(l.ID, l.URI))
		}

		lt.bytes -= linkCost(l)
	}

	// Drop the evicted prefix once it is half the list.
	if lt.head > len(lt.order)/2 {
		lt.order = append(lt.order[:0:0], lt.order[lt.head:]...)
		lt.head = 0
	}
}

// clear drops every link; ids keep counting up, so an id a frontend saw
// before never names another link.
func (lt *linkTable) clear() {
	lt.byID = map[uint32]Link{}
	lt.byKey = map[string]uint32{}
	lt.order = nil
	lt.head = 0
	lt.bytes = 0
}

func (lt *linkTable) get(linkID uint32) (Link, bool) {
	l, ok := lt.byID[linkID]

	return l, ok
}

// setHyperlink handles OSC 8: "params;URI" opens a link, "params;" closes it.
// The URI may hold semicolons; the parameters end at the first one.
//
// xterm.js ignores a closing sequence that carries parameters (OSC 8 ;
// id=x ; ST); here it closes the link, as the hyperlink specification's
// "empty URI ends the link" says.
func (t *Terminal) setHyperlink(data string) {
	params, uri, found := strings.Cut(data, ";")
	if !found {
		return
	}

	if uri == "" || len(uri) > maxLinkURI {
		t.link = 0

		return
	}

	id := ""

	for _, p := range strings.Split(strings.TrimSpace(params), ":") {
		if v, ok := strings.CutPrefix(p, "id="); ok {
			id = v

			break
		}
	}

	if len(id) > maxLinkID {
		id = ""
	}

	t.link = t.links.register(id, uri)
}

// Link returns the hyperlink a cell's Link id names, and false for 0 or a
// link the bounded table has dropped.
func (t *Terminal) Link(linkID uint32) (Link, bool) {
	if linkID == 0 {
		return Link{}, false
	}

	return t.links.get(linkID)
}

// CellLink returns the hyperlink of the cell at row, col of the visible
// screen, if it has one.
func (t *Terminal) CellLink(row, col int) (Link, bool) {
	return t.Link(t.Cell(row, col).Link)
}

// IsSafeLinkURI reports whether a link's URI has a scheme a frontend may open
// without more checks: http, https, mailto or file. Programs choose link
// URIs freely, so a frontend opens no other scheme (javascript:, data:,
// custom handlers) unless the user agrees.
func IsSafeLinkURI(uri string) bool {
	u, err := url.Parse(uri)
	if err != nil {
		return false
	}

	switch strings.ToLower(u.Scheme) {
	case "http", "https", "mailto", "file":
		return true
	default:
		return false
	}
}
