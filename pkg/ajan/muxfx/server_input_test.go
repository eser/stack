// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"encoding/json"
	"slices"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

// paneModes is a mutable [muxfx.PaneModeSource] for tests.
type paneModes struct {
	mu     sync.Mutex
	byPane map[muxfx.PaneID]vt.Modes
}

func (p *paneModes) PaneModes(pane muxfx.PaneID) vt.Modes {
	p.mu.Lock()
	defer p.mu.Unlock()

	return p.byPane[pane]
}

func (p *paneModes) set(pane muxfx.PaneID, modes vt.Modes) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.byPane[pane] = modes
}

func TestServerUserInput(t *testing.T) {
	t.Parallel()

	arrowUp := &muxfx.KeyInput{Key: "ArrowUp", Code: "ArrowUp"}
	leftPress := &muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 1, Col: 2}

	cases := []struct {
		name  string
		modes vt.Modes
		// msg is sent to the first of two panes, the second one focused.
		msg  func(first muxfx.PaneID) muxfx.FrontendToServer
		want func(first, second muxfx.PaneID) [][2]string
	}{
		{
			name:  "a key goes to the focused pane by its modes",
			modes: vt.Modes{ApplicationCursorKeys: true},
			msg: func(muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageKey, Key: arrowUp}
			},
			want: func(_, second muxfx.PaneID) [][2]string { return [][2]string{{string(second), "\x1bOA"}} },
		},
		{
			name:  "a key goes to the pane it names by that pane's modes",
			modes: vt.Modes{ApplicationCursorKeys: true},
			msg: func(first muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageKey, Pane: first, Key: arrowUp}
			},
			want: func(first, _ muxfx.PaneID) [][2]string { return [][2]string{{string(first), "\x1bOA"}} },
		},
		{
			name: "a key for an unknown pane is dropped",
			msg: func(muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageKey, Pane: "pane-99", Key: arrowUp}
			},
			want: func(_, _ muxfx.PaneID) [][2]string { return nil },
		},
		{
			name:  "a bracketed paste cannot end early",
			modes: vt.Modes{BracketedPaste: true},
			msg: func(first muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessagePaste, Pane: first, Paste: &muxfx.PasteInput{Text: "x\x1b[201~y\n"}}
			},
			want: func(first, _ muxfx.PaneID) [][2]string {
				return [][2]string{{string(first), "\x1b[200~x[201~y\r\x1b[201~"}}
			},
		},
		{
			name:  "a mouse press is reported by the pane's protocol and encoding",
			modes: vt.Modes{MouseProtocol: vt.MouseVT200, MouseEncoding: vt.MouseEncodingSGR},
			msg: func(first muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageMouse, Pane: first, Mouse: leftPress}
			},
			want: func(first, _ muxfx.PaneID) [][2]string { return [][2]string{{string(first), "\x1b[<0;3;2M"}} },
		},
		{
			name:  "a mouse event outside the pane is dropped",
			modes: vt.Modes{MouseProtocol: vt.MouseAny, MouseEncoding: vt.MouseEncodingSGR},
			msg: func(first muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageMouse, Pane: first, Mouse: &muxfx.MouseInput{
					Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 1, Col: 500,
				}}
			},
			want: func(_, _ muxfx.PaneID) [][2]string { return nil },
		},
		{
			name: "a mouse event without mouse reporting is dropped",
			msg: func(first muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageMouse, Pane: first, Mouse: leftPress}
			},
			want: func(_, _ muxfx.PaneID) [][2]string { return nil },
		},
		{
			name:  "focus is reported with 1004",
			modes: vt.Modes{SendFocus: true},
			msg: func(muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageFocus, Focus: &muxfx.FocusInput{Focused: false}}
			},
			want: func(_, second muxfx.PaneID) [][2]string { return [][2]string{{string(second), "\x1b[O"}} },
		},
		{
			name: "focus is dropped without 1004",
			msg: func(muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageFocus, Focus: &muxfx.FocusInput{Focused: true}}
			},
			want: func(_, _ muxfx.PaneID) [][2]string { return nil },
		},
		{
			name: "a message without its payload is dropped",
			msg: func(muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageKey, Paste: &muxfx.PasteInput{Text: "x"}}
			},
			want: func(_, _ muxfx.PaneID) [][2]string { return nil },
		},
		{
			name:  "writeInput still writes its bytes unchanged",
			modes: vt.Modes{ApplicationCursorKeys: true, BracketedPaste: true},
			msg: func(muxfx.PaneID) muxfx.FrontendToServer {
				return muxfx.FrontendToServer{T: muxfx.MessageAction, Action: &muxfx.Action{
					Type: muxfx.ActionWriteInput, Data: "\x1b[A\x1b[201~",
				}}
			},
			want: func(_, second muxfx.PaneID) [][2]string { return [][2]string{{string(second), "\x1b[A\x1b[201~"}} },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			modes := &paneModes{byPane: map[muxfx.PaneID]vt.Modes{}}
			s := newSetup(t, func(opts *muxfx.ServerOptions) { opts.PaneModes = modes })
			s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
			s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionSplitPane, Direction: string(muxfx.SplitVertical)})

			first, second := s.host.spawned[0], s.host.spawned[1]
			modes.set(first, tc.modes)
			modes.set(second, tc.modes)

			s.frontend.Send(tc.msg(first))

			if want := tc.want(first, second); !slices.Equal(s.host.writes, want) {
				t.Errorf("writes = %q, want %q", s.host.writes, want)
			}
		})
	}
}

func TestServerUserInputDefaultModes(t *testing.T) {
	t.Parallel()

	// Without PaneModes every pane has a reset terminal's modes: normal
	// cursor keys, no bracketed paste, no mouse or focus reports.
	s := newSetup(t, nil)
	s.server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

	pane := s.host.spawned[0]

	for _, msg := range []muxfx.FrontendToServer{
		{T: muxfx.MessageKey, Key: &muxfx.KeyInput{Key: "ArrowUp", Code: "ArrowUp"}},
		{T: muxfx.MessagePaste, Paste: &muxfx.PasteInput{Text: "a\nb"}},
		{T: muxfx.MessageMouse, Mouse: &muxfx.MouseInput{Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft}},
		{T: muxfx.MessageFocus, Focus: &muxfx.FocusInput{Focused: true}},
	} {
		s.frontend.Send(msg)
	}

	want := [][2]string{{string(pane), "\x1b[A"}, {string(pane), "a\rb"}}
	if !slices.Equal(s.host.writes, want) {
		t.Errorf("writes = %q, want %q", s.host.writes, want)
	}
}

func TestUserInputMessagesOnTheWire(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		wire string
		msg  muxfx.FrontendToServer
	}{
		{
			name: "key",
			wire: `{"t":"key","pane":"pane-1","key":{"key":"ArrowLeft","code":"ArrowLeft","shift":true,"ctrl":true}}`,
			msg: muxfx.FrontendToServer{T: muxfx.MessageKey, Pane: "pane-1", Key: &muxfx.KeyInput{
				Key: "ArrowLeft", Code: "ArrowLeft", Modifiers: muxfx.Modifiers{Shift: true, Ctrl: true},
			}},
		},
		{
			name: "key with text",
			wire: `{"t":"key","key":{"key":"a","code":"KeyA","text":"a"}}`,
			msg:  muxfx.FrontendToServer{T: muxfx.MessageKey, Key: &muxfx.KeyInput{Key: "a", Code: "KeyA", Text: "a"}},
		},
		{
			name: "paste",
			wire: `{"t":"paste","paste":{"text":"ls -l\n"}}`,
			msg:  muxfx.FrontendToServer{T: muxfx.MessagePaste, Paste: &muxfx.PasteInput{Text: "ls -l\n"}},
		},
		{
			name: "mouse",
			wire: `{"t":"mouse","pane":"pane-2","mouse":{"kind":"press","button":"left","row":3,"col":10,"alt":true}}`,
			msg: muxfx.FrontendToServer{T: muxfx.MessageMouse, Pane: "pane-2", Mouse: &muxfx.MouseInput{
				Kind: muxfx.MouseKindPress, Button: muxfx.MouseButtonLeft, Row: 3, Col: 10,
				Modifiers: muxfx.Modifiers{Alt: true},
			}},
		},
		{
			name: "mouse wheel with pixels",
			wire: `{"t":"mouse","mouse":{"kind":"wheel","wheel":"down","row":0,"col":0,"x":5,"y":7}}`,
			msg: muxfx.FrontendToServer{T: muxfx.MessageMouse, Mouse: &muxfx.MouseInput{
				Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelDown, X: 5, Y: 7,
			}},
		},
		{
			name: "focus",
			wire: `{"t":"focus","focus":{"focused":false}}`,
			msg:  muxfx.FrontendToServer{T: muxfx.MessageFocus, Focus: &muxfx.FocusInput{Focused: false}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			out, err := json.Marshal(tc.msg)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}

			if string(out) != tc.wire {
				t.Errorf("marshal = %s, want %s", out, tc.wire)
			}

			var back muxfx.FrontendToServer
			if err := json.Unmarshal([]byte(tc.wire), &back); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}

			again, err := json.Marshal(back)
			if err != nil {
				t.Fatalf("marshal again: %v", err)
			}

			if string(again) != tc.wire {
				t.Errorf("round trip = %s, want %s", again, tc.wire)
			}
		})
	}
}
