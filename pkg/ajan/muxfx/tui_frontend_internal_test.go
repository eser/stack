// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"io"
	"strconv"
	"testing"
)

func TestTuiFrontendBoundsHiddenScreens(t *testing.T) {
	t.Parallel()

	_, frontendSide := NewInProcessPair[ServerToFrontend, FrontendToServer]()
	f := NewTuiFrontend(&TuiFrontendOptions{Transport: frontendSide, Keymap: DefaultKeymap(), Output: io.Discard})
	defer f.scheduler.Stop()

	state := NewInitialState(Viewport{Cols: 40, Rows: 10})
	state = Reduce(&state, &Action{Type: ActionNewTab}).State
	scene := DeriveScene(&state, DefaultChrome())

	f.Handle(ServerToFrontend{T: MessageScene, Full: true, Delta: DiffScene(nil, &scene)})

	screen := func(id PaneID) {
		f.Handle(ServerToFrontend{T: MessageScreen, Pane: id, Screen: &ScreenUpdate{Full: true, Cols: 4, Rows: 2}})
	}

	screen("pane-1")

	for i := range maxHiddenScreens + 8 {
		screen(PaneID("hidden-" + strconv.Itoa(i)))
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	if got := len(f.screens); got != 1+maxHiddenScreens {
		t.Errorf("screens = %d, want %d", got, 1+maxHiddenScreens)
	}

	for _, id := range []PaneID{"pane-1", PaneID("hidden-" + strconv.Itoa(maxHiddenScreens+7))} {
		if _, ok := f.screens[id]; !ok {
			t.Errorf("the screen of %s was dropped", id)
		}
	}

	if _, ok := f.screens["hidden-0"]; ok {
		t.Error("the stalest hidden screen was kept")
	}
}
