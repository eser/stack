// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"slices"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The dashboard's multiplexer is the Go form of the TypeScript MuxHost
// (terminal/mux-host.ts): one muxfx server for every tab, pane and PTY of
// the dashboard, the noskills session each tab is bound to, and the spec a
// tab may be bound to. The browser attaches one WebSocket that carries the
// whole multiplexer (dashboard_ws.go).

const (
	// dashboardMuxCols and dashboardMuxRows seed the viewport until the
	// browser reports its size.
	dashboardMuxCols = 120
	dashboardMuxRows = 40

	// dashboardSessionTool is the tool a dashboard tab's session records.
	dashboardSessionTool = "web"

	// dashboardFreeTabTitle names a tab bound to no spec.
	dashboardFreeTabTitle = "free"

	// dashboardTabWait bounds how long createTab waits for the server to
	// list the tab it dispatched.
	dashboardTabWait = 5 * time.Second
)

// ErrDashboardTabNotListed is returned when the server does not list a new
// tab in time, such as when its pane exited at once.
var ErrDashboardTabNotListed = errors.New("the new tab was not listed by the multiplexer")

// dashboardAgentCandidates are the coding agent binaries a tab runs, tried
// in order on PATH, as the claude-code adapter of @eserstack/agents tries
// them.
func dashboardAgentCandidates() []string {
	return []string{"claude", "claude-code"}
}

// lookupAgentCommand returns the first agent binary on PATH, or "claude"
// when none is, so the pane shows the failure to start it.
func lookupAgentCommand() string {
	for _, candidate := range dashboardAgentCandidates() {
		if path, err := exec.LookPath(candidate); err == nil {
			return path
		}
	}

	return dashboardAgentCandidates()[0]
}

// dashboardTab is a tab and the noskills session bound to it.
type dashboardTab struct {
	ID        string  `json:"id"`
	SpecName  *string `json:"specName"`
	SessionID string  `json:"-"`
}

// dashboardMux owns the dashboard's muxfx server and the tab bindings.
type dashboardMux struct {
	root         string
	logger       *logfx.Logger
	server       *muxfx.Server
	hub          *muxHub
	agentCommand func() string

	// mu guards tabs and command. It is never held while calling a server
	// method that applies actions, because the server calls back into
	// reconcile from OnPaneExit.
	mu      sync.Mutex
	tabs    []dashboardTab
	command string
}

// newDashboardMux builds the multiplexer for the project at root. newHost
// nil uses pseudo-terminals; agentCommand nil looks the agent up on PATH.
func newDashboardMux(
	root string,
	newHost func(cb muxfx.PtyHostCallbacks) muxfx.PtyHost,
	agentCommand func() string,
	logger *logfx.Logger,
) *dashboardMux {
	if agentCommand == nil {
		agentCommand = lookupAgentCommand
	}

	m := &dashboardMux{ //nolint:exhaustruct
		root:         root,
		logger:       logger,
		hub:          newMuxHub(),
		agentCommand: agentCommand,
	}

	// The browser draws its own tab bar and chrome in HTML, so the viewport
	// reserves nothing; panes fill the grid the browser reports.
	m.server = muxfx.NewServer(&muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: dashboardMuxCols, Rows: dashboardMuxRows}),
		ResolveSpawn: func(pane *muxfx.Pane, _ muxfx.Geom) muxfx.SpawnSpec {
			return agentSpawnSpec(pane, root, "")
		},
		Chrome:  &muxfx.Chrome{}, //nolint:exhaustruct // no reserved rows or columns
		NewHost: newHost,
		// The dashboard outlives any single tab; closing the last one leaves
		// an empty multiplexer the browser repopulates with "+".
		KeepEmptySession: true,
		// A pane that exits on its own closes its tab; reconcile so the
		// tab's session file is deleted at once.
		OnPaneExit: func(muxfx.PaneID) { m.reconcile() },
		OnError: func(err error) {
			logger.Warn("noskills web: pane input or resize failed", "err", err)
		},
	})

	// One transport stays connected for the server's lifetime and forwards
	// to whichever socket is attached. Everything a socket sends passes the
	// sanitizer, so a frame cannot pick the command, arguments or directory
	// of a new pane.
	m.server.Connect(m.hub.transport)

	return m
}

// attachSocket makes socket the one the multiplexer talks to, closing the
// previous one. Reconnecting the hub resets the server's last scene, so the
// next scene the socket gets is a full one.
func (m *dashboardMux) attachSocket(socket muxSocket) {
	m.hub.attach(socket)
	m.server.Connect(m.hub.transport)
}

// detachSocket stops delivery to socket when it is still the attached one.
// The panes keep running for the next socket.
func (m *dashboardMux) detachSocket(socket muxSocket) {
	m.hub.detach(socket)
}

// deliver passes a frame a socket sent to the server, through the sanitizer.
func (m *dashboardMux) deliver(msg *muxfx.FrontendToServer) {
	m.hub.deliver(msg)
}

// resolveCommand is the agent binary, looked up once.
func (m *dashboardMux) resolveCommand() string {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.command == "" {
		m.command = m.agentCommand()
	}

	return m.command
}

// newSession records the noskills session of a new tab: free mode, or
// bound to specName with the spec's current phase when it has one.
func (m *dashboardMux) newSession(specName *string, now time.Time) (string, error) {
	sessionID, err := noskillsfx.GenerateSessionID()
	if err != nil {
		return "", err
	}

	session := noskillsfx.Session{
		ID: sessionID, Spec: nil, Mode: noskillsfx.SessionModeFree, Phase: nil, Pid: 0,
		StartedAt: noskillsfx.ISOTime(now), LastActiveAt: noskillsfx.ISOTime(now), Tool: dashboardSessionTool,
		ProjectRoot: "",
	}

	if specName != nil {
		session.Spec = specName
		session.Mode = noskillsfx.SessionModeSpec

		if state, err := noskillsfx.ResolveState(m.root, *specName, noskillsfx.DefaultCommandPrefix, nil); err == nil {
			if phase, ok := state.Get("phase"); ok {
				if text, isText := phase.(string); isText {
					session.Phase = &text
				}
			}
		}
	}

	if err := noskillsfx.CreateSession(m.root, &session); err != nil {
		return "", fmt.Errorf("create the session of a dashboard tab: %w", err)
	}

	return sessionID, nil
}

// createTab opens a tab running the coding agent, bound to specName when it
// is not nil, and returns it once the server lists it.
func (m *dashboardMux) createTab(ctx context.Context, specName *string) (dashboardTab, error) {
	sessionID, err := m.newSession(specName, time.Now())
	if err != nil {
		return dashboardTab{}, err
	}

	title := dashboardFreeTabTitle
	if specName != nil {
		title = *specName
	}

	changed := m.hub.changed()

	m.server.Dispatch(&muxfx.Action{ //nolint:exhaustruct
		Type:    muxfx.ActionNewTab,
		Command: m.resolveCommand(),
		Cwd:     m.root,
		Title:   title,
		Meta:    map[string]string{"sessionId": sessionID},
	})

	tabID, err := m.waitForTab(ctx, sessionID, changed)
	if err != nil {
		noskillsfx.DeleteSession(m.root, sessionID)

		return dashboardTab{}, err
	}

	tab := dashboardTab{ID: tabID, SpecName: specName, SessionID: sessionID}

	m.mu.Lock()
	m.tabs = append(m.tabs, tab)
	m.mu.Unlock()

	return tab, nil
}

// waitForTab returns the id of the tab whose pane carries sessionID. The
// server applies an action at once unless another goroutine is applying
// one, so the tab is usually listed already; otherwise the scene the server
// sends after applying it wakes the wait.
func (m *dashboardMux) waitForTab(ctx context.Context, sessionID string, changed <-chan struct{}) (string, error) {
	timer := time.NewTimer(dashboardTabWait)
	defer timer.Stop()

	for {
		state := m.server.State()

		for _, tab := range state.Tabs {
			if pane, ok := state.Panes[tab.FocusedPane]; ok && pane.Meta["sessionId"] == sessionID {
				return string(tab.ID), nil
			}
		}

		select {
		case <-changed:
			changed = m.hub.changed()
		case <-timer.C:
			return "", ErrDashboardTabNotListed
		case <-ctx.Done():
			return "", fmt.Errorf("wait for the new tab: %w", ctx.Err())
		}
	}
}

// closeTab closes a tab by id without moving the active tab. An unknown id
// does nothing.
func (m *dashboardMux) closeTab(tabID string) {
	index := slices.IndexFunc(m.server.State().Tabs, func(tab muxfx.Tab) bool { return string(tab.ID) == tabID })
	if index < 0 {
		return
	}

	m.server.Dispatch(&muxfx.Action{Type: muxfx.ActionCloseTab, Index: muxfx.IntPtr(index)}) //nolint:exhaustruct
	m.reconcile()
}

// reconcile drops the bindings of tabs the server no longer has and deletes
// their sessions.
func (m *dashboardMux) reconcile() {
	live := map[string]bool{}
	for _, tab := range m.server.State().Tabs {
		live[string(tab.ID)] = true
	}

	m.mu.Lock()

	var gone []string

	m.tabs = slices.DeleteFunc(m.tabs, func(tab dashboardTab) bool {
		if live[tab.ID] {
			return false
		}

		gone = append(gone, tab.SessionID)

		return true
	})
	m.mu.Unlock()

	for _, sessionID := range gone {
		noskillsfx.DeleteSession(m.root, sessionID)
	}
}

// listTabs is the open tabs, oldest first.
func (m *dashboardMux) listTabs() []dashboardTab {
	m.reconcile()

	m.mu.Lock()
	defer m.mu.Unlock()

	return append([]dashboardTab{}, m.tabs...)
}

// notifySpec types text into the focused pane of the tab bound to specName,
// and reports whether there was one. The pane is read from the live tab,
// since a split may have replaced the pane the tab started with.
func (m *dashboardMux) notifySpec(specName, text string) bool {
	tabs := m.listTabs()

	index := slices.IndexFunc(tabs, func(tab dashboardTab) bool { return tab.SpecName != nil && *tab.SpecName == specName })
	if index < 0 {
		return false
	}

	for _, tab := range m.server.State().Tabs {
		if string(tab.ID) == tabs[index].ID {
			m.server.Dispatch(&muxfx.Action{Type: muxfx.ActionWriteToPane, Pane: tab.FocusedPane, Data: text}) //nolint:exhaustruct

			return true
		}
	}

	return false
}

// killAll stops every pane, closes the attached socket and deletes the
// sessions of every tab. ctx bounds the wait for the panes.
func (m *dashboardMux) killAll(ctx context.Context) error {
	m.mu.Lock()
	tabs := m.tabs
	m.tabs = nil
	m.mu.Unlock()

	err := m.server.Dispose(ctx)

	for _, tab := range tabs {
		noskillsfx.DeleteSession(m.root, tab.SessionID)
	}

	if err != nil {
		return fmt.Errorf("close the dashboard tabs: %w", err)
	}

	return nil
}
