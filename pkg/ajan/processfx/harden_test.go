//go:build !windows && !wasip1

package processfx_test

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/processfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHardenCommandKillsGrandchildren pins the behaviour exec.CommandContext
// does NOT give you.
//
// Cancelling a context kills the direct child only. A grandchild -- every
// `sh -c "... &"`, every tool that re-execs -- survives, keeps the inherited
// stdout write end open, and leaves the parent blocked reading a pipe that will
// never close. The symptom is a hang with no error, which is why the correct
// handling was worth centralising rather than re-deriving per call site.
//
// The test detects the leak the same way the bug bites: it reads the child's
// stdout to EOF. EOF arrives only when every process holding that write end is
// gone, so a surviving grandchild shows up as a timeout.
func TestHardenCommandKillsGrandchildren(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())

	// The grandchild outlives the shell and holds stdout open.
	cmd := exec.CommandContext(ctx, "sh", "-c", "sleep 60 & echo started; wait")
	processfx.HardenCommand(cmd)

	stdout, err := cmd.StdoutPipe()
	require.NoError(t, err)
	require.NoError(t, cmd.Start())

	buf := make([]byte, len("started\n"))
	_, err = stdout.Read(buf)
	require.NoError(t, err)
	require.Contains(t, string(buf), "started")

	cancel()

	drained := make(chan error, 1)

	go func() {
		_, copyErr := stdout.Read(make([]byte, 64))
		drained <- copyErr
	}()

	select {
	case <-drained:
		// EOF or a read error: the write end is closed, so the whole group is
		// gone. That is the pass condition.
	case <-time.After(10 * time.Second):
		t.Fatal(
			"stdout never closed after cancel: a grandchild survived and is " +
				"still holding the inherited write end",
		)
	}

	_ = cmd.Wait()
}

// TestHardenCommandKeepsAChosenWaitDelay pins which fields are defaults and
// which are corrections.
//
// WaitDelay is a default: a caller who picked a deadline keeps it. Cancel is
// NOT -- exec.CommandContext always installs one that kills the direct child
// only, and that default is precisely the defect being fixed, so it must be
// replaced unconditionally. An earlier draft of HardenCommand guarded the
// assignment with `if cmd.Cancel == nil`, which made it a silent no-op for
// every context-built command; the grandchild test above caught it.
func TestHardenCommandKeepsAChosenWaitDelay(t *testing.T) {
	t.Parallel()

	cmd := exec.CommandContext(t.Context(), "true")
	cmd.WaitDelay = time.Minute

	processfx.HardenCommand(cmd)

	assert.Equal(t, time.Minute, cmd.WaitDelay)
	require.NotNil(t, cmd.Cancel)
}

// TestHardenCommandTolerAtesNil keeps the primitive safe to call defensively.
func TestHardenCommandToleratesNil(t *testing.T) {
	t.Parallel()

	assert.NotPanics(t, func() { processfx.HardenCommand(nil) })
}

// TestExecCancelsCleanly checks the package's own Exec path, now that Run
// hardens the command it builds.
func TestExecCancelsCleanly(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(t.Context(), 250*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, err := processfx.Exec(ctx, "sleep 30 & wait", processfx.ExecOptions{}) //nolint:exhaustruct

	require.Error(t, err)
	assert.Less(
		t,
		time.Since(start),
		15*time.Second,
		"Exec did not return promptly after its context expired",
	)
	assert.True(
		t,
		strings.Contains(err.Error(), "context") ||
			strings.Contains(err.Error(), "signal") ||
			strings.Contains(err.Error(), "killed"),
		"unexpected error: %v",
		err,
	)
}
