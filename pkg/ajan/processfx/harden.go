// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package processfx

import (
	"os/exec"
	"time"
)

// DefaultWaitDelay bounds how long a cancelled command may keep the parent
// waiting after its process group has been signalled, before the standard
// library gives up on the inherited pipes.
const DefaultWaitDelay = 5 * time.Second

// HardenCommand makes cancellation actually terminate the whole subtree.
//
// exec.CommandContext alone kills only the DIRECT child. A grandchild -- which
// is every `sh -c "... &"`, every tool that re-execs, every package manager that
// spawns a build -- survives, keeps the inherited stdout/stderr write ends open,
// and leaves the parent blocked in Wait with no process left to wait for. The
// symptom is a hang with no error, which is why this was worth centralising:
// the correct handling existed in shellfx/exec and workflowfx and nowhere else,
// while a dozen other call sites re-derived the broken version.
//
// Call it on a command built with exec.CommandContext, before Start or Run.
// Commands built without a context are unaffected by Cancel, but still get
// their own process group, so a caller that signals the group later can reach
// the whole tree.
//
// On Windows this sets no process group: terminating a tree there needs a Job
// Object, which is a larger change than this primitive. The direct child is
// still killed, which is what happened before.
func HardenCommand(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}

	setProcessGroup(cmd)

	// Deliberately unconditional. exec.CommandContext has ALREADY installed a
	// Cancel that kills the direct child only -- that default is the bug, so
	// preserving it would make this function a no-op for exactly the commands
	// it exists to fix. A caller wanting different cancellation sets Cancel
	// after this call, not before.
	cmd.Cancel = func() error { return killProcessGroup(cmd) }

	// A default, not an override: a caller who chose a deadline keeps it.
	if cmd.WaitDelay == 0 {
		cmd.WaitDelay = DefaultWaitDelay
	}
}
