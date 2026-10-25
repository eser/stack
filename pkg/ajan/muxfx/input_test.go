// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

func TestParseChord(t *testing.T) {
	t.Parallel()

	tests := []struct {
		key  muxfx.KeyEvent
		want muxfx.KeyChord
	}{
		{muxfx.KeyEvent{Name: "p", Ctrl: true}, "ctrl+p"},
		{muxfx.KeyEvent{Name: "left", Meta: true}, "alt+left"},
		{muxfx.KeyEvent{Name: "tab", Shift: true}, "shift+tab"},
		{muxfx.KeyEvent{Name: "A", Shift: true}, "a"},
		{muxfx.KeyEvent{Name: "3"}, "3"},
	}

	for _, tc := range tests {
		if got := muxfx.ParseChord(&tc.key); got != tc.want {
			t.Errorf("ParseChord(%+v) = %q, want %q", tc.key, got, tc.want)
		}
	}
}

func TestDefaultKeymap(t *testing.T) {
	t.Parallel()

	km := muxfx.DefaultKeymap()

	if actions, ok := muxfx.Lookup(km, muxfx.ModeNormal, "ctrl+p"); !ok || actions[0].Mode != muxfx.ModePane {
		t.Errorf("ctrl+p = %+v", actions)
	}

	if actions, _ := muxfx.Lookup(km, muxfx.ModePane, "v"); len(actions) != 2 || actions[1].Mode != muxfx.ModeNormal {
		t.Errorf("pane v = %+v, want a split then back to normal", actions)
	}

	if len(km[muxfx.ModeLocked]) != 1 {
		t.Errorf("locked mode binds %d chords, want only ctrl+g", len(km[muxfx.ModeLocked]))
	}

	merged := muxfx.MergeOverrides(km, muxfx.KeymapTable{
		muxfx.ModeNormal: {"ctrl+b": {{Type: muxfx.ActionSwitchMode, Mode: muxfx.ModePane}}},
	})

	if _, ok := muxfx.Lookup(merged, muxfx.ModeNormal, "ctrl+b"); !ok {
		t.Error("override not added")
	}

	if _, ok := muxfx.Lookup(merged, muxfx.ModeNormal, "ctrl+p"); !ok {
		t.Error("override dropped an existing binding")
	}

	if _, ok := muxfx.Lookup(km, muxfx.ModeNormal, "ctrl+b"); ok {
		t.Error("merging changed the base keymap")
	}
}

func TestKeyToMessages(t *testing.T) {
	t.Parallel()

	km := muxfx.DefaultKeymap()

	t.Run("a bound chord sends its actions", func(t *testing.T) {
		t.Parallel()

		msgs := muxfx.KeyToMessages(&muxfx.KeyEvent{Name: "p", Ctrl: true, Raw: []byte{0x10}}, muxfx.ModeNormal, km)
		if len(msgs) != 1 || msgs[0].Action.Type != muxfx.ActionSwitchMode {
			t.Errorf("msgs = %+v", msgs)
		}
	})

	t.Run("an unbound key in normal mode passes through raw", func(t *testing.T) {
		t.Parallel()

		msgs := muxfx.KeyToMessages(&muxfx.KeyEvent{Name: "a", Raw: []byte("a")}, muxfx.ModeNormal, km)
		if len(msgs) != 1 || msgs[0].Action.Type != muxfx.ActionWriteInput || msgs[0].Action.Data != "a" {
			t.Errorf("msgs = %+v", msgs)
		}
	})

	t.Run("an unbound key in a command mode is dropped", func(t *testing.T) {
		t.Parallel()

		if msgs := muxfx.KeyToMessages(&muxfx.KeyEvent{Name: "a", Raw: []byte("a")}, muxfx.ModePane, km); len(msgs) != 0 {
			t.Errorf("msgs = %+v", msgs)
		}
	})

	t.Run("locked mode forwards everything except ctrl+g", func(t *testing.T) {
		t.Parallel()

		msgs := muxfx.KeyToMessages(&muxfx.KeyEvent{Name: "p", Ctrl: true, Raw: []byte{0x10}}, muxfx.ModeLocked, km)
		if len(msgs) != 1 || msgs[0].Action.Type != muxfx.ActionWriteInput {
			t.Errorf("ctrl+p in locked mode = %+v", msgs)
		}

		msgs = muxfx.KeyToMessages(&muxfx.KeyEvent{Name: "g", Ctrl: true, Raw: []byte{0x07}}, muxfx.ModeLocked, km)
		if len(msgs) != 1 || msgs[0].Action.Mode != muxfx.ModeNormal {
			t.Errorf("ctrl+g in locked mode = %+v", msgs)
		}
	})
}

func TestMouseToMessages(t *testing.T) {
	t.Parallel()

	scene := &muxfx.Scene{
		Panes: []muxfx.ScenePane{
			{ID: "pane-1", Geom: muxfx.Geom{X: 0, Y: 1, Width: 40, Height: 22}},
			{ID: "pane-2", Geom: muxfx.Geom{X: 40, Y: 1, Width: 40, Height: 22}},
		},
	}

	msgs := muxfx.MouseToMessages(&muxfx.MouseEvent{Type: muxfx.MouseDown, X: 50, Y: 5}, scene)
	if len(msgs) != 1 || msgs[0].Action.Pane != "pane-2" {
		t.Errorf("msgs = %+v", msgs)
	}

	if msgs := muxfx.MouseToMessages(&muxfx.MouseEvent{Type: muxfx.MouseUp, X: 50, Y: 5}, scene); len(msgs) != 0 {
		t.Errorf("a release focused a pane: %+v", msgs)
	}
}

func TestDecodeInput(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		raw   string
		names []string
	}{
		{"ctrl letter", "\x10", []string{"p"}},
		{"arrows and keys", "\x1b[Aa\r", []string{"up", "a", "enter"}},
		{"application cursor key", "\x1bOB", []string{"down"}},
		{"page keys", "\x1b[5~\x1b[6~", []string{"pageup", "pagedown"}},
		{"alt chord", "\x1bx", []string{"x"}},
		{"lone escape", "\x1b", []string{"escape"}},
		{"multi-byte character", "ğ", []string{"ğ"}},
		{"unknown sequence stays whole", "\x1b[200~", []string{"unknown"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			events := muxfx.DecodeInput([]byte(tc.raw))
			if len(events) != len(tc.names) {
				t.Fatalf("events = %d, want %d", len(events), len(tc.names))
			}

			total := 0

			for i, ev := range events {
				if ev.Key == nil || ev.Key.Name != tc.names[i] {
					t.Errorf("event %d = %+v, want key %q", i, ev, tc.names[i])

					continue
				}

				total += len(ev.Key.Raw)
			}

			if total != len(tc.raw) {
				t.Errorf("raw bytes covered = %d, want %d", total, len(tc.raw))
			}
		})
	}

	t.Run("SGR mouse press", func(t *testing.T) {
		t.Parallel()

		events := muxfx.DecodeInput([]byte("\x1b[<0;12;5M\x1b[<64;1;1M"))
		if len(events) != 2 || events[0].Mouse == nil || events[0].Mouse.X != 11 || events[0].Mouse.Y != 4 ||
			events[0].Mouse.Type != muxfx.MouseDown || events[1].Mouse.Type != muxfx.MouseWheel {
			t.Errorf("events = %+v", events)
		}
	})
}
