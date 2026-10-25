// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"os"
	"time"
)

// The environment noskills-server and the FFI bridge give the lifecycle
// commands. They pass their own git and shell runners: this package starts
// no process itself, and the WASM build of the bridge has none to give.

// identityVariables are the variables the user identity reads.
func identityVariables() []string {
	return []string{"HOME", "USERPROFILE", "XDG_CONFIG_HOME"}
}

// ServiceLifecycleEnv is a LifecycleEnv for a service that runs the
// lifecycle for a project at root, with no agent-tool variables, so a
// service started inside a coding tool still answers in the human form. git
// and shell may be nil: the user is then UnknownUser unless user.json names
// one, and a verification command fails to run.
func ServiceLifecycleEnv(root string, git GitRunner, shell ShellRunner) *LifecycleEnv {
	return &LifecycleEnv{
		Root: root,
		Cwd:  root,
		LookupEnv: func(key string) (string, bool) {
			if !containsString(identityVariables(), key) {
				return "", false
			}

			return os.LookupEnv(key)
		},
		Now:      time.Now,
		RunGit:   git,
		RunShell: shell,
		Warn:     nil,
		Notice:   nil,
	}
}
