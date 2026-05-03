// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// semverPattern matches vX.Y.Z or X.Y.Z with an optional pre-release suffix.
var semverPattern = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)(.*)$`)

// ParseSemver parses a semver string into its components.
// The leading "v" is stripped if present.
// Returns major, minor, patch, and the pre-release/build suffix.
func ParseSemver(version string) (major, minor, patch int, suffix string, err error) {
	version = strings.TrimSpace(version)
	m := semverPattern.FindStringSubmatch(version)

	if m == nil {
		return 0, 0, 0, "", fmt.Errorf("ParseSemver %q: %w", version, ErrInvalidVersion)
	}

	major, _ = strconv.Atoi(m[1])
	minor, _ = strconv.Atoi(m[2])
	patch, _ = strconv.Atoi(m[3])
	suffix = m[4]

	return major, minor, patch, suffix, nil
}

// FormatSemver formats version components as "vX.Y.Z".
// suffix is appended verbatim (e.g. "-rc.1").
func FormatSemver(major, minor, patch int, suffix string) string {
	return fmt.Sprintf("v%d.%d.%d%s", major, minor, patch, suffix)
}

// BumpVersion applies cmd to the current semver string and returns the new version.
// For VersionCommandExplicit, explicit must be a valid semver string.
// For VersionCommandSync, the version is returned unchanged (sync is caller-driven).
func BumpVersion(current string, cmd VersionCommand, explicit string) (string, error) {
	switch cmd {
	case VersionCommandExplicit:
		// validate that explicit is a parseable semver
		if _, _, _, _, err := ParseSemver(explicit); err != nil {
			return "", fmt.Errorf("BumpVersion explicit: %w", err)
		}

		v := strings.TrimSpace(explicit)
		if !strings.HasPrefix(v, "v") {
			v = "v" + v
		}

		return v, nil

	case VersionCommandSync:
		// Sync means "already set elsewhere" — return current unchanged.
		return current, nil

	case VersionCommandPatch, VersionCommandMinor, VersionCommandMajor:
		major, minor, patch, _, err := ParseSemver(current)
		if err != nil {
			return "", fmt.Errorf("BumpVersion: %w", err)
		}

		switch cmd {
		case VersionCommandPatch:
			patch++
		case VersionCommandMinor:
			minor++
			patch = 0
		case VersionCommandMajor:
			major++
			minor = 0
			patch = 0
		}

		// Drop pre-release suffix on bump.
		return FormatSemver(major, minor, patch, ""), nil

	default:
		return "", fmt.Errorf("BumpVersion: %w: %q", ErrUnknownCommand, cmd)
	}
}

// CompareVersions compares two semver strings lexicographically by numeric segments.
// Returns -1, 0, or 1.
func CompareVersions(a, b string) int {
	aMaj, aMin, aPat, _, errA := ParseSemver(a)
	bMaj, bMin, bPat, _, errB := ParseSemver(b)

	if errA != nil || errB != nil {
		return strings.Compare(a, b)
	}

	if aMaj != bMaj {
		return cmp(aMaj, bMaj)
	}

	if aMin != bMin {
		return cmp(aMin, bMin)
	}

	return cmp(aPat, bPat)
}

func cmp(a, b int) int {
	if a < b {
		return -1
	}

	if a > b {
		return 1
	}

	return 0
}
