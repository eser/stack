// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// config is commands/config.ts: the user identity in
// <config>/eser/noskills/user.json, which LifecycleEnv.ResolveUser reads.
func (l *lifecycleRun) config(ctx context.Context, args []string) (int, error) {
	prefix := l.prefixOf(l.projectRoot())

	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}

	switch sub {
	case "set-user":
		return l.configSetUser(ctx, prefix, args[1:])
	case "get-user":
		l.configGetUser(prefix)

		return clifx.ExitOK, nil
	case "clear-user":
		return l.configClearUser()
	}

	writeln(l.e.stdout, "Usage: "+prefix+" config <set-user | get-user | clear-user>")

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) configSetUser(ctx context.Context, prefix string, args []string) (int, error) {
	out := l.e.stdout

	var name, email *string

	fromGit := false

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--name="):
			value := strings.TrimPrefix(arg, "--name=")
			name = &value
		case strings.HasPrefix(arg, "--email="):
			value := strings.TrimPrefix(arg, "--email=")
			email = &value
		case arg == "--from-git":
			fromGit = true
		}
	}

	if fromGit {
		user, ok := noskillsfx.DetectGitUser(ctx, l.e.runGit, l.e.cwd)
		if !ok {
			writeln(out, red("Could not read git user config."))

			return clifx.ExitFailure, nil
		}

		name, email = &user.Name, &user.Email
	}

	if name == nil || *name == "" {
		writeln(out, red("Please provide a name: "),
			bold(prefix+` config set-user --name="Your Name" --email="you@example.com"`))

		return clifx.ExitFailure, nil
	}

	user := noskillsfx.User{Name: *name, Email: ""}
	if email != nil {
		user.Email = *email
	}

	path, err := noskillsfx.SetCurrentUser(l.e.lookupEnv, user)
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	writeln(out, green("User set: "), bold(noskillsfx.FormatUser(user)))
	writeln(out, dim("  Stored in: "+path))

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) configGetUser(prefix string) {
	out := l.e.stdout

	user, ok := noskillsfx.CurrentUser(l.e.lookupEnv)
	if !ok {
		writeln(out, dim("No user configured."))
		writeln(out, dim("Set one with: "+prefix+` config set-user --name="Your Name"`))

		return
	}

	// CurrentUser found the file, so its path resolves.
	path, _ := noskillsfx.UserFilePath(l.e.lookupEnv)

	writeln(out, bold("User: "), noskillsfx.FormatUser(user))
	writeln(out, dim("  File: "+path))
}

func (l *lifecycleRun) configClearUser() (int, error) {
	removed, err := noskillsfx.ClearCurrentUser(l.e.lookupEnv)
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	if removed {
		writeln(l.e.stdout, green("User identity cleared."))
	} else {
		writeln(l.e.stdout, dim("No user configured."))
	}

	return clifx.ExitOK, nil
}
