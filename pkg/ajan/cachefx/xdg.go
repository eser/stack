// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cachefx

import (
	"os"
	"path/filepath"
	"runtime"
)

// Host is what the base directory resolution reads from the machine: the
// operating system as a GOOS value ("darwin", "windows", "linux" and so on),
// the user's home directory and the environment.
//
// The WASM build runs as GOOS wasip1 without the host's home or environment,
// so the bridge takes these facts from its caller instead of CurrentHost.
type Host struct {
	// Getenv reads an environment variable; nil reads nothing.
	Getenv func(key string) string
	// OS is a GOOS value.
	OS string
	// Home is the user's home directory.
	Home string
}

// CurrentHost returns the Host of this process. An unknown home directory
// is left empty.
func CurrentHost() Host {
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}

	return Host{Getenv: os.Getenv, OS: runtime.GOOS, Home: home}
}

func (h Host) env(key string) string {
	if h.Getenv == nil {
		return ""
	}

	return h.Getenv(key)
}

// baseDir applies the platform rules shared by the three base directories:
// macOS uses a fixed directory under ~/Library, Windows a variable or a
// directory under ~/AppData, and every other system its XDG variable or a
// directory under the home directory.
func (h Host) baseDir(xdgVar string, windowsVar string, darwin, windows, other []string) string {
	switch h.OS {
	case "darwin":
		return filepath.Join(append([]string{h.Home}, darwin...)...)
	case "windows":
		if v := h.env(windowsVar); v != "" {
			return v
		}

		return filepath.Join(append([]string{h.Home}, windows...)...)
	default:
		if v := h.env(xdgVar); v != "" {
			return v
		}

		return filepath.Join(append([]string{h.Home}, other...)...)
	}
}

// CacheHome returns the base cache directory.
//
// Linux/BSD: $XDG_CACHE_HOME, or ~/.cache
// macOS:     ~/Library/Caches
// Windows:   %LOCALAPPDATA%, or ~/AppData/Local
func (h Host) CacheHome() string {
	return h.baseDir(
		"XDG_CACHE_HOME",
		"LOCALAPPDATA",
		[]string{"Library", "Caches"},
		[]string{"AppData", "Local"},
		[]string{".cache"},
	)
}

// DataHome returns the base data directory.
//
// Linux/BSD: $XDG_DATA_HOME, or ~/.local/share
// macOS:     ~/Library/Application Support
// Windows:   %LOCALAPPDATA%, or ~/AppData/Local
func (h Host) DataHome() string {
	return h.baseDir(
		"XDG_DATA_HOME",
		"LOCALAPPDATA",
		[]string{"Library", "Application Support"},
		[]string{"AppData", "Local"},
		[]string{".local", "share"},
	)
}

// ConfigHome returns the base config directory.
//
// Linux/BSD: $XDG_CONFIG_HOME, or ~/.config
// macOS:     ~/Library/Preferences
// Windows:   %APPDATA%, or ~/AppData/Roaming
func (h Host) ConfigHome() string {
	return h.baseDir(
		"XDG_CONFIG_HOME",
		"APPDATA",
		[]string{"Library", "Preferences"},
		[]string{"AppData", "Roaming"},
		[]string{".config"},
	)
}

// XdgCacheHome returns the base cache directory of this process's host; see
// Host.CacheHome.
func XdgCacheHome() string { return CurrentHost().CacheHome() }

// XdgDataHome returns the base data directory of this process's host; see
// Host.DataHome.
func XdgDataHome() string { return CurrentHost().DataHome() }

// XdgConfigHome returns the base config directory of this process's host; see
// Host.ConfigHome.
func XdgConfigHome() string { return CurrentHost().ConfigHome() }
