// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// The user identity of state/identity.ts: who answers, approves and
// creates specs. It is per machine, in <config>/eser/noskills/user.json,
// never in the project. LifecycleEnv.ResolveUser and `noskills config`
// both read and write it through these functions.

// User is who answers, approves and creates specs.
type User struct {
	Name  string
	Email string
}

// UnknownUser is the identity when none is configured.
func UnknownUser() User {
	return User{Name: "Unknown User", Email: ""}
}

// FormatUser is formatUser: "Name <email>", or the name alone when there
// is no email.
func FormatUser(user User) string {
	if user.Email != "" {
		return user.Name + " <" + user.Email + ">"
	}

	return user.Name
}

// LookupEnvFunc reads an environment variable.
type LookupEnvFunc func(key string) (string, bool)

// gitIdentityTimeout bounds the two git config reads.
const gitIdentityTimeout = 10 * time.Second

// userFilePerm keeps the name and email readable by their owner only.
const userFilePerm = 0o600

// ErrNoConfigDir is returned when no variable names a home or config
// directory; a literal "~" would be a folder under the working directory.
var ErrNoConfigDir = errors.New("cannot find the noskills config directory: set HOME, USERPROFILE or XDG_CONFIG_HOME")

// UserConfigDir is getConfigDir: XDG_CONFIG_HOME/eser/noskills when the
// variable is set and not empty, else HOME (or USERPROFILE) followed by
// /.config/eser/noskills. An empty value counts as unset, and
// ErrNoConfigDir is returned when none is set.
func UserConfigDir(lookupEnv LookupEnvFunc) (string, error) {
	get := func(key string) string {
		if lookupEnv == nil {
			return ""
		}

		value, _ := lookupEnv(key)

		return value
	}

	if xdg := get("XDG_CONFIG_HOME"); xdg != "" {
		return xdg + "/eser/noskills", nil
	}

	home := get("HOME")
	if home == "" {
		home = get("USERPROFILE")
	}

	if home == "" {
		return "", ErrNoConfigDir
	}

	return home + "/.config/eser/noskills", nil
}

// UserFilePath is getUserFilePath: user.json in UserConfigDir.
func UserFilePath(lookupEnv LookupEnvFunc) (string, error) {
	dir, err := UserConfigDir(lookupEnv)
	if err != nil {
		return "", err
	}

	return dir + "/user.json", nil
}

// CurrentUser is getCurrentUser: the identity user.json holds, and false
// when there is no config directory, or the file is missing, does not
// parse, or names no one.
func CurrentUser(lookupEnv LookupEnvFunc) (User, bool) {
	path, err := UserFilePath(lookupEnv)
	if err != nil {
		return User{}, false
	}

	data, err := os.ReadFile(filepath.FromSlash(path))
	if err != nil {
		return User{}, false
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		return User{}, false
	}

	o, ok := parsed.(*JSObject)
	if !ok {
		return User{}, false
	}

	name, ok := o.strOK("name")
	if !ok || name == "" {
		return User{}, false
	}

	email, _ := o.strOK("email")

	return User{Name: name, Email: email}, true
}

// SetCurrentUser is setCurrentUser: it writes user.json, creating its
// directory, and returns the file's path. The file is readable by its
// owner only, a user.json that existed with a wider mode included.
func SetCurrentUser(lookupEnv LookupEnvFunc, user User) (string, error) {
	path, err := UserFilePath(lookupEnv)
	if err != nil {
		return "", err
	}

	native := filepath.FromSlash(path)

	if err := os.MkdirAll(filepath.Dir(native), 0o700); err != nil {
		return path, fmt.Errorf("create the noskills config directory for %s: %w", path, err)
	}

	content := jsonStringifyIndent(JSObjectOf("name", user.Name, "email", user.Email)) + "\n"

	if err := os.WriteFile(native, []byte(content), userFilePerm); err != nil {
		return path, fmt.Errorf("write the user identity %s: %w", path, err)
	}

	// WriteFile applies the mode only when it creates the file.
	if err := os.Chmod(native, userFilePerm); err != nil {
		return path, fmt.Errorf("restrict the user identity %s to its owner: %w", path, err)
	}

	return path, nil
}

// ClearCurrentUser is clearCurrentUser: it removes user.json and reports
// whether there was one to remove.
func ClearCurrentUser(lookupEnv LookupEnvFunc) (bool, error) {
	path, err := UserFilePath(lookupEnv)
	if err != nil {
		return false, err
	}

	err = os.Remove(filepath.FromSlash(path))

	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, os.ErrNotExist):
		return false, nil
	default:
		return false, fmt.Errorf("remove the user identity %s: %w", path, err)
	}
}

// DetectGitUser is detectGitUser: git's user.name and user.email in dir,
// and false when git cannot run, either key is unset, or the name is
// empty. A nil runGit finds no user.
func DetectGitUser(ctx context.Context, runGit GitRunner, dir string) (User, bool) {
	if runGit == nil {
		return User{}, false
	}

	ctx, cancel := context.WithTimeout(ctx, gitIdentityTimeout)
	defer cancel()

	name, nameOK, nameErr := runGit(ctx, "git", []string{"config", "user.name"}, dir)
	if nameErr != nil || !nameOK {
		return User{}, false
	}

	email, emailOK, emailErr := runGit(ctx, "git", []string{"config", "user.email"}, dir)
	if emailErr != nil || !emailOK || jsTrim(name) == "" {
		return User{}, false
	}

	return User{Name: jsTrim(name), Email: jsTrim(email)}, true
}

// ResolveUserWith is resolveUser: the user.json identity, else git's,
// else UnknownUser.
func ResolveUserWith(ctx context.Context, lookupEnv LookupEnvFunc, runGit GitRunner, dir string) User {
	if user, ok := CurrentUser(lookupEnv); ok {
		return user
	}

	if user, ok := DetectGitUser(ctx, runGit, dir); ok {
		return user
	}

	return UnknownUser()
}
