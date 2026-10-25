// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

func TestDeriveScene(t *testing.T) {
	t.Parallel()

	t.Run("exposes panes with geometry and focus", func(t *testing.T) {
		t.Parallel()

		s := split(t, ptr(baseState(t)))
		scene := muxfx.DeriveScene(&s, muxfx.DefaultChrome())

		if len(scene.Panes) != 2 || !scene.Panes[1].Focused || scene.Panes[0].Focused {
			t.Fatalf("panes = %+v", scene.Panes)
		}

		if scene.Panes[0].Geom != (muxfx.Geom{X: 0, Y: 1, Width: 40, Height: 22}) {
			t.Errorf("first pane geom = %+v", scene.Panes[0].Geom)
		}

		if string(scene.FocusedPane) != string(s.Tabs[0].FocusedPane) {
			t.Errorf("focused = %q", scene.FocusedPane)
		}
	})

	t.Run("a fullscreen pane is the only pane", func(t *testing.T) {
		t.Parallel()

		s := split(t, ptr(baseState(t)))
		s = reduce(t, &s, &muxfx.Action{Type: muxfx.ActionToggleFullscreen}).State

		scene := muxfx.DeriveScene(&s, muxfx.DefaultChrome())
		if len(scene.Panes) != 1 || scene.Panes[0].Geom != (muxfx.Geom{X: 0, Y: 1, Width: 80, Height: 22}) {
			t.Errorf("panes = %+v", scene.Panes)
		}
	})
}

func TestDiffScene(t *testing.T) {
	t.Parallel()

	s := baseState(t)
	scene := muxfx.DeriveScene(&s, muxfx.DefaultChrome())

	t.Run("a nil previous scene gives a full delta", func(t *testing.T) {
		t.Parallel()

		d := muxfx.DiffScene(nil, &scene)
		if d == nil || d.Mode == nil || d.Viewport == nil || !d.HasTabs() || !d.HasPanes() || d.Chrome == nil || d.FocusedPane == nil {
			t.Errorf("delta = %+v", d)
		}
	})

	t.Run("an unchanged scene gives no delta", func(t *testing.T) {
		t.Parallel()

		same := scene
		if d := muxfx.DiffScene(&scene, &same); d != nil {
			t.Errorf("delta = %+v, want none", d)
		}
	})

	t.Run("only the changed fields are reported", func(t *testing.T) {
		t.Parallel()

		next := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionSwitchMode, Mode: muxfx.ModePane}).State
		nextScene := muxfx.DeriveScene(&next, muxfx.DefaultChrome())

		d := muxfx.DiffScene(&scene, &nextScene)
		if d == nil || d.Mode == nil || *d.Mode != muxfx.ModePane || d.HasPanes() || d.HasTabs() || d.Viewport != nil {
			t.Errorf("delta = %+v", d)
		}
	})
}

func TestSceneDeltaWireFormat(t *testing.T) {
	t.Parallel()

	s := baseState(t)
	scene := muxfx.DeriveScene(&s, muxfx.DefaultChrome())

	closed := reduce(t, &s, &muxfx.Action{Type: muxfx.ActionCloseTab}).State
	empty := muxfx.DeriveScene(&closed, muxfx.DefaultChrome())

	msg := muxfx.ServerToFrontend{T: muxfx.MessageScene, Delta: muxfx.DiffScene(&scene, &empty)}

	raw, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// Closing the last tab empties both lists and moves focus to no pane:
	// all three must be on the wire, not dropped as empty.
	for _, want := range []string{`"t":"scene"`, `"full":false`, `"tabs":[]`, `"panes":[]`, `"focusedPane":null`} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("wire = %s, missing %s", raw, want)
		}
	}

	var back muxfx.ServerToFrontend
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	applied := muxfx.ApplyDelta(&scene, back.Delta, muxfx.Viewport{})
	if len(applied.Tabs) != 0 || len(applied.Panes) != 0 || applied.FocusedPane != "" {
		t.Errorf("applied = %+v", applied)
	}
}

func TestProtocolMessagesMatchTheTypeScriptShape(t *testing.T) {
	t.Parallel()

	tests := []struct {
		msg  muxfx.ServerToFrontend
		want string
	}{
		{muxfx.ServerToFrontend{T: muxfx.MessageExit}, `{"t":"exit","code":0}`},
	}

	for _, tc := range tests {
		raw, err := json.Marshal(tc.msg)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}

		if string(raw) != tc.want {
			t.Errorf("wire = %s, want %s", raw, tc.want)
		}
	}

	var in muxfx.FrontendToServer
	if err := json.Unmarshal([]byte(`{"t":"action","action":{"type":"gotoTab","index":0}}`), &in); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if in.Action == nil || in.Action.Type != muxfx.ActionGotoTab || in.Action.Index == nil || *in.Action.Index != 0 {
		t.Errorf("action = %+v", in.Action)
	}
}

func TestSanitizeRemote(t *testing.T) {
	t.Parallel()

	t.Run("spawn fields are stripped from newTab and newPane", func(t *testing.T) {
		t.Parallel()

		for _, typ := range []muxfx.ActionType{muxfx.ActionNewTab, muxfx.ActionNewPane} {
			action := muxfx.Action{
				Type: typ, Command: "/bin/rm", Args: []string{"-rf", "/"}, Cwd: "/",
				Kind: muxfx.PaneKindTerminal, Title: "t", Meta: map[string]string{"k": "v"}, Direction: "horizontal",
			}

			got := muxfx.SanitizeRemoteAction(&action)
			if got.Command != "" || got.Args != nil || got.Cwd != "" {
				t.Errorf("%s kept spawn fields: %+v", typ, got)
			}

			if got.Kind != action.Kind || got.Title != "t" || got.Meta["k"] != "v" {
				t.Errorf("%s lost allowed fields: %+v", typ, got)
			}

			if (typ == muxfx.ActionNewPane) != (got.Direction == "horizontal") {
				t.Errorf("%s direction = %q", typ, got.Direction)
			}
		}
	})

	t.Run("other actions pass through", func(t *testing.T) {
		t.Parallel()

		action := muxfx.Action{Type: muxfx.ActionWriteInput, Data: "x"}
		if got := muxfx.SanitizeRemoteAction(&action); got.Data != "x" || got.Type != muxfx.ActionWriteInput {
			t.Errorf("got %+v", got)
		}
	})

	t.Run("user input messages pass through unchanged", func(t *testing.T) {
		t.Parallel()

		// They write to a pane as writeToPane does and name no process, so
		// there is nothing to strip.
		for _, msg := range []muxfx.FrontendToServer{
			{T: muxfx.MessageKey, Pane: "pane-1", Key: &muxfx.KeyInput{Key: "a", Code: "KeyA", Text: "a"}},
			{T: muxfx.MessagePaste, Pane: "pane-1", Paste: &muxfx.PasteInput{Text: "x\x1b[201~"}},
			{T: muxfx.MessageMouse, Mouse: &muxfx.MouseInput{Kind: muxfx.MouseKindWheel, Wheel: muxfx.WheelUp}},
			{T: muxfx.MessageFocus, Focus: &muxfx.FocusInput{Focused: true}},
		} {
			got := muxfx.SanitizeRemoteMessage(&msg)
			if !reflect.DeepEqual(got, msg) {
				t.Errorf("SanitizeRemoteMessage(%+v) = %+v", msg, got)
			}
		}
	})

	t.Run("viewports are bounded", func(t *testing.T) {
		t.Parallel()

		limit := muxfx.Viewport{Cols: muxfx.MaxRemoteViewportCols, Rows: muxfx.MaxRemoteViewportRows}

		cases := []struct {
			name string
			in   muxfx.Viewport
			want muxfx.Viewport
		}{
			{"within the limit", muxfx.Viewport{Cols: 200, Rows: 60}, muxfx.Viewport{Cols: 200, Rows: 60}},
			{"at the limit", limit, limit},
			{"too wide", muxfx.Viewport{Cols: 1 << 30, Rows: 60}, muxfx.Viewport{Cols: limit.Cols, Rows: 60}},
			{"too tall", muxfx.Viewport{Cols: 80, Rows: 1 << 30}, muxfx.Viewport{Cols: 80, Rows: limit.Rows}},
			{"negative", muxfx.Viewport{Cols: -5, Rows: -1}, muxfx.Viewport{}},
		}

		for _, tc := range cases {
			for _, typ := range []muxfx.MessageType{muxfx.MessageAttach, muxfx.MessageResize} {
				in := tc.in
				msg := muxfx.FrontendToServer{T: typ, Viewport: &in}

				got := muxfx.SanitizeRemoteMessage(&msg)
				if *got.Viewport != tc.want || in != tc.in {
					t.Errorf("%s %s: viewport = %+v (input now %+v), want %+v", tc.name, typ, *got.Viewport, in, tc.want)
				}
			}

			action := muxfx.Action{Type: muxfx.ActionResizeViewport, Cols: tc.in.Cols, Rows: tc.in.Rows}
			if got := muxfx.SanitizeRemoteAction(&action); got.Cols != tc.want.Cols || got.Rows != tc.want.Rows {
				t.Errorf("%s resizeViewport = %dx%d, want %+v", tc.name, got.Cols, got.Rows, tc.want)
			}
		}
	})

	t.Run("the transport wrapper keeps the flow control it wraps", func(t *testing.T) {
		t.Parallel()

		serverSide, _ := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()

		plain, ok := muxfx.SanitizeRemoteTransport(serverSide).(muxfx.FlowControl)
		if !ok || !plain.Writable() {
			t.Fatal("a wrapped transport without flow control is not always writable")
		}

		plain.OnWritable(func() {})

		flow := &flowTransport{Transport: serverSide}

		wrapped, ok := muxfx.SanitizeRemoteTransport(flow).(muxfx.FlowControl)
		if !ok || wrapped.Writable() {
			t.Fatal("the wrapper does not report the wrapped transport as blocked")
		}

		called := false

		wrapped.OnWritable(func() { called = true })
		flow.setWritable(true)

		if !wrapped.Writable() || !called {
			t.Errorf("writable = %v, callback called = %v, want both", wrapped.Writable(), called)
		}
	})

	t.Run("the transport wrapper filters every inbound message", func(t *testing.T) {
		t.Parallel()

		serverSide, clientSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
		wrapped := muxfx.SanitizeRemoteTransport(serverSide)

		var got []muxfx.FrontendToServer

		wrapped.OnMessage(func(msg muxfx.FrontendToServer) { got = append(got, msg) })
		clientSide.Send(muxfx.FrontendToServer{T: muxfx.MessageAction, Action: &muxfx.Action{Type: muxfx.ActionNewTab, Command: "sh"}})

		if len(got) != 1 || got[0].Action.Command != "" {
			t.Errorf("received %+v", got)
		}

		var out []muxfx.ServerToFrontend

		clientSide.OnMessage(func(msg muxfx.ServerToFrontend) { out = append(out, msg) })
		wrapped.Send(muxfx.ServerToFrontend{T: muxfx.MessageExit})

		if len(out) != 1 {
			t.Errorf("outbound messages = %d, want 1", len(out))
		}
	})
}
