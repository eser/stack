// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func envOf(values map[string]string) noskillsfx.LookupEnvFunc {
	return func(key string) (string, bool) {
		value, ok := values[key]

		return value, ok
	}
}

func TestUserConfigDir(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"xdg", map[string]string{"XDG_CONFIG_HOME": "/x", "HOME": "/h"}, "/x/eser/noskills"},
		{"empty xdg", map[string]string{"XDG_CONFIG_HOME": "", "HOME": "/h"}, "/h/.config/eser/noskills"},
		{"userprofile", map[string]string{"USERPROFILE": `C:\Users\a`}, `C:\Users\a/.config/eser/noskills`},
		{"empty home", map[string]string{"HOME": "", "USERPROFILE": `C:\Users\a`}, `C:\Users\a/.config/eser/noskills`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got, err := noskillsfx.UserConfigDir(envOf(tc.env)); err != nil || got != tc.want {
				t.Errorf("UserConfigDir = %q, %v; want %q", got, err, tc.want)
			}
		})
	}
}

// With no home, the path used to be a literal "~" under the working
// directory.
func TestUserConfigDirWithoutAHome(t *testing.T) {
	t.Parallel()

	for _, env := range []map[string]string{{}, {"HOME": "", "USERPROFILE": "", "XDG_CONFIG_HOME": ""}} {
		if got, err := noskillsfx.UserConfigDir(envOf(env)); !errors.Is(err, noskillsfx.ErrNoConfigDir) {
			t.Errorf("UserConfigDir(%v) = %q, %v; want ErrNoConfigDir", env, got, err)
		}

		if _, ok := noskillsfx.CurrentUser(envOf(env)); ok {
			t.Errorf("CurrentUser(%v) found a user", env)
		}

		if _, err := noskillsfx.SetCurrentUser(envOf(env), noskillsfx.User{Name: "Ada", Email: ""}); !errors.Is(err, noskillsfx.ErrNoConfigDir) {
			t.Errorf("SetCurrentUser(%v) = %v; want ErrNoConfigDir", env, err)
		}

		if _, err := noskillsfx.ClearCurrentUser(envOf(env)); !errors.Is(err, noskillsfx.ErrNoConfigDir) {
			t.Errorf("ClearCurrentUser(%v) = %v; want ErrNoConfigDir", env, err)
		}
	}
}

// A user.json that existed with a wider mode is narrowed to 0600.
func TestSetCurrentUserNarrowsAnExistingFile(t *testing.T) {
	t.Parallel()

	home := t.TempDir()
	env := envOf(map[string]string{"HOME": home})
	file := filepath.Join(home, ".config", "eser", "noskills", "user.json")

	if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(file, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := os.Chmod(file, 0o644); err != nil { //nolint:gosec // G302: the wider mode under test
		t.Fatal(err)
	}

	if _, err := noskillsfx.SetCurrentUser(env, noskillsfx.User{Name: "Ada", Email: ""}); err != nil {
		t.Fatal(err)
	}

	if info, err := os.Stat(file); err != nil || info.Mode().Perm() != 0o600 {
		t.Errorf("user.json mode = %v, %v; want 0600", info.Mode(), err)
	}
}

// fakeGit answers git config with the values given; a missing key exits 1.
func fakeGit(values map[string]string) noskillsfx.GitRunner {
	return func(_ context.Context, _ string, args []string, _ string) (string, bool, error) {
		value, ok := values[args[len(args)-1]]
		if !ok {
			return "", false, nil
		}

		return value + "\n", true, nil
	}
}

func TestResolveUserWith(t *testing.T) {
	t.Parallel()

	home := t.TempDir()
	env := envOf(map[string]string{"HOME": home})
	ctx := context.Background()
	grace := fakeGit(map[string]string{"user.name": "  Grace Hopper ", "user.email": "grace@example.com"})

	if got := noskillsfx.ResolveUserWith(ctx, env, nil, home); got != noskillsfx.UnknownUser() {
		t.Errorf("no identity: %+v", got)
	}

	if got := noskillsfx.ResolveUserWith(ctx, env, grace, home); got != (noskillsfx.User{Name: "Grace Hopper", Email: "grace@example.com"}) {
		t.Errorf("git identity: %+v", got)
	}

	noEmail := fakeGit(map[string]string{"user.name": "Grace"})
	if got := noskillsfx.ResolveUserWith(ctx, env, noEmail, home); got != noskillsfx.UnknownUser() {
		t.Errorf("a git name without an email: %+v", got)
	}

	path, err := noskillsfx.SetCurrentUser(env, noskillsfx.User{Name: "Ada", Email: ""})
	if err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.FromSlash(path)) //nolint:gosec // G304: the test's temp home
	if err != nil || string(data) != "{\n  \"name\": \"Ada\",\n  \"email\": \"\"\n}\n" {
		t.Errorf("user.json = %q, %v", data, err)
	}

	if info, err := os.Stat(filepath.FromSlash(path)); err != nil || info.Mode().Perm() != 0o600 {
		t.Errorf("user.json mode = %v, %v; want 0600", info.Mode(), err)
	}

	if got := noskillsfx.ResolveUserWith(ctx, env, grace, home); got != (noskillsfx.User{Name: "Ada", Email: ""}) {
		t.Errorf("configured identity: %+v", got)
	}

	if removed, err := noskillsfx.ClearCurrentUser(env); !removed || err != nil {
		t.Errorf("ClearCurrentUser = %v, %v", removed, err)
	}

	if removed, err := noskillsfx.ClearCurrentUser(env); removed || err != nil {
		t.Errorf("ClearCurrentUser again = %v, %v", removed, err)
	}
}

func TestFormatUser(t *testing.T) {
	t.Parallel()

	if got := noskillsfx.FormatUser(noskillsfx.User{Name: "Ada", Email: "ada@example.com"}); got != "Ada <ada@example.com>" {
		t.Errorf("FormatUser = %q", got)
	}

	if got := noskillsfx.FormatUser(noskillsfx.User{Name: "Ada", Email: ""}); got != "Ada" {
		t.Errorf("FormatUser = %q", got)
	}
}
