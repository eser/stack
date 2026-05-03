// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cachefx

import (
	"os"
	"path/filepath"
	"runtime"
)

// XdgCacheHome returns the XDG-compliant base cache directory for the current OS.
//
// Linux/BSD: $XDG_CACHE_HOME, or ~/.cache
// macOS:     ~/Library/Caches
// Windows:   %LOCALAPPDATA%, or ~/AppData/Local
func XdgCacheHome() string {
	if v := os.Getenv("XDG_CACHE_HOME"); v != "" {
		return v
	}

	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Caches")
	case "windows":
		if v := os.Getenv("LOCALAPPDATA"); v != "" {
			return v
		}

		return filepath.Join(home, "AppData", "Local")
	default:
		return filepath.Join(home, ".cache")
	}
}

// XdgDataHome returns the XDG-compliant base data directory.
//
// Linux/BSD: $XDG_DATA_HOME, or ~/.local/share
// macOS:     ~/Library/Application Support
// Windows:   %LOCALAPPDATA%, or ~/AppData/Local
func XdgDataHome() string {
	if v := os.Getenv("XDG_DATA_HOME"); v != "" {
		return v
	}

	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support")
	case "windows":
		if v := os.Getenv("LOCALAPPDATA"); v != "" {
			return v
		}

		return filepath.Join(home, "AppData", "Local")
	default:
		return filepath.Join(home, ".local", "share")
	}
}

// XdgConfigHome returns the XDG-compliant base config directory.
//
// Linux/BSD: $XDG_CONFIG_HOME, or ~/.config
// macOS:     ~/Library/Preferences
// Windows:   %APPDATA%, or ~/AppData/Roaming
func XdgConfigHome() string {
	if v := os.Getenv("XDG_CONFIG_HOME"); v != "" {
		return v
	}

	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Preferences")
	case "windows":
		if v := os.Getenv("APPDATA"); v != "" {
			return v
		}

		return filepath.Join(home, "AppData", "Roaming")
	default:
		return filepath.Join(home, ".config")
	}
}
