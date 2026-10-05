// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package processfx

import (
	"bytes"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// TestWatchSignalsReturnsOnClosedChannel covers the closed-channel exit of the
// signal watcher. A receive from a closed channel yields a nil os.Signal; the
// watcher must return without logging it and without ending the process,
// since no signal arrived. It is an internal test because only
// signalWatcherDone shows that the watcher has returned.
func TestWatchSignalsReturnsOnClosedChannel(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer

	p := New(t.Context(), logfx.NewLogger(logfx.WithWriter(&logs)))

	close(p.Signal)

	select {
	case <-p.signalWatcherDone:
	case <-time.After(5 * time.Second):
		t.Fatal("the signal watcher did not return after its channel was closed")
	}

	if err := p.Ctx.Err(); err != nil {
		t.Errorf("closing the signal channel ended Ctx: %v", err)
	}

	if logs.Len() != 0 {
		t.Errorf("the watcher logged for a closed channel: %s", logs.String())
	}

	p.Cancel()
	p.Wait()
}
