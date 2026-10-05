// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
)

// readJSONFile reads and JSON-parses a file into a generic map.
func readJSONFile(path string) (map[string]interface{}, error) {
	data, err := os.ReadFile(path) //nolint:gosec
	if err != nil {
		return nil, err
	}

	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}

	return m, nil
}

// stringsFromInterface coerces an interface{} slice into a []string.
func stringsFromInterface(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}

	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}

	return out
}

// stringMapFromInterface coerces an interface{} map into map[string]string.
func stringMapFromInterface(v interface{}) map[string]string {
	m, ok := v.(map[string]interface{})
	if !ok {
		return nil
	}

	out := make(map[string]string, len(m))
	for k, val := range m {
		if s, ok := val.(string); ok {
			out[k] = s
		}
	}

	return out
}

// parseWorkspacePackageConfig merges deno.json and package.json into a single config.
func parseWorkspacePackageConfig(denoRaw, pkgRaw map[string]interface{}) WorkspacePackageConfig {
	cfg := WorkspacePackageConfig{
		RawDeno:    denoRaw,
		RawPackage: pkgRaw,
	}

	if denoRaw != nil {
		cfg.Exports = denoRaw["exports"]
		cfg.Imports = stringMapFromInterface(denoRaw["imports"])
	}

	if pkgRaw != nil {
		if cfg.Exports == nil {
			cfg.Exports = pkgRaw["exports"]
		}

		cfg.Dependencies = stringMapFromInterface(pkgRaw["dependencies"])
		cfg.DevDependencies = stringMapFromInterface(pkgRaw["devDependencies"])
	}

	return cfg
}

// packageName returns the name field from deno.json, falling back to package.json.
func packageName(denoRaw, pkgRaw map[string]interface{}) string {
	if denoRaw != nil {
		if v, ok := denoRaw["name"].(string); ok && v != "" {
			return v
		}
	}

	if pkgRaw != nil {
		if v, ok := pkgRaw["name"].(string); ok {
			return v
		}
	}

	return ""
}

// workspaceSources lists the root files that can declare workspace members and
// the field each one uses: package.json `workspaces` (npm, Yarn, Bun and Deno)
// and deno.json `workspace` (Deno only).
var workspaceSources = []struct {
	file  string
	field string
}{
	{file: "package.json", field: "workspaces"},
	{file: "deno.json", field: "workspace"},
}

// readOptionalJSONFile reads a JSON file that may be absent: a missing file
// returns nil without an error, any other read or parse failure is an error.
func readOptionalJSONFile(path string) (map[string]interface{}, error) {
	m, err := readJSONFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	return m, nil
}

// workspacePatternsFromField reads a workspace field. It accepts the array form
// and the object form with a `packages` array that Yarn also writes.
func workspacePatternsFromField(v interface{}) []string {
	if obj, ok := v.(map[string]interface{}); ok {
		return stringsFromInterface(obj["packages"])
	}

	return stringsFromInterface(v)
}

// workspacePatterns collects the member patterns declared in the root
// package.json and deno.json under absRoot.
func workspacePatterns(absRoot string) ([]string, error) {
	var patterns []string

	for _, src := range workspaceSources {
		raw, err := readOptionalJSONFile(filepath.Join(absRoot, src.file))
		if err != nil {
			return nil, err
		}

		patterns = append(patterns, workspacePatternsFromField(raw[src.field])...)
	}

	return patterns, nil
}

// hasGlobMeta reports whether a path segment holds a glob metacharacter.
func hasGlobMeta(segment string) bool {
	return strings.ContainsAny(segment, "*?[")
}

// matchSegments matches slash-separated path segments against pattern
// segments, where "**" matches zero or more whole segments and every other
// segment follows path.Match.
func matchSegments(pattern, segments []string) (bool, error) {
	if len(pattern) == 0 {
		return len(segments) == 0, nil
	}

	if pattern[0] == "**" {
		for i := 0; i <= len(segments); i++ {
			ok, err := matchSegments(pattern[1:], segments[i:])
			if err != nil || ok {
				return ok, err
			}
		}

		return false, nil
	}

	if len(segments) == 0 {
		return false, nil
	}

	ok, err := path.Match(pattern[0], segments[0])
	if err != nil || !ok {
		return false, err
	}

	return matchSegments(pattern[1:], segments[1:])
}

// expandWorkspacePattern returns the directories under absRoot that match one
// slash-separated member pattern. It walks only below the pattern's static
// prefix and never descends into node_modules or .git.
func expandWorkspacePattern(absRoot, pattern string) ([]string, error) {
	segments := strings.Split(path.Clean(pattern), "/")

	staticLen := 0
	for staticLen < len(segments) && !hasGlobMeta(segments[staticLen]) {
		staticLen++
	}

	base := filepath.Join(absRoot, filepath.FromSlash(path.Join(segments[:staticLen]...)))

	if staticLen == len(segments) {
		info, err := os.Stat(base)
		if errors.Is(err, fs.ErrNotExist) || (err == nil && !info.IsDir()) {
			return nil, nil
		}

		if err != nil {
			return nil, fmt.Errorf("stat workspace member %q: %w", pattern, err)
		}

		return []string{base}, nil
	}

	globSegments := segments[staticLen:]
	// Without "**" a match sits at a fixed depth, so the walk stops there
	// instead of descending through every package's tree.
	maxDepth := len(globSegments)
	if slices.Contains(globSegments, "**") {
		maxDepth = -1
	}

	// Validate the pattern once, so a malformed one fails even when the walk
	// finds nothing to match it against.
	for _, segment := range globSegments {
		if _, err := path.Match(segment, ""); err != nil {
			return nil, fmt.Errorf("workspace pattern %q: %w", pattern, err)
		}
	}

	var matches []string

	err := filepath.WalkDir(base, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if current == base && errors.Is(walkErr, fs.ErrNotExist) {
				return filepath.SkipAll
			}

			return walkErr
		}

		if !entry.IsDir() || current == base {
			return nil
		}

		if entry.Name() == "node_modules" || entry.Name() == ".git" {
			return filepath.SkipDir
		}

		rel, err := filepath.Rel(base, current)
		if err != nil {
			return err
		}

		relSegments := strings.Split(filepath.ToSlash(rel), "/")

		ok, err := matchSegments(globSegments, relSegments)
		if err != nil {
			return err
		}

		if ok {
			matches = append(matches, current)
		}

		if maxDepth >= 0 && len(relSegments) >= maxDepth {
			return filepath.SkipDir
		}

		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("expand workspace pattern %q: %w", pattern, err)
	}

	return matches, nil
}

// expandWorkspacePatterns resolves member patterns against absRoot and returns
// the matching directories sorted and without duplicates. A pattern with a
// leading "!" removes the directories it matches, whatever its position.
func expandWorkspacePatterns(absRoot string, patterns []string) ([]string, error) {
	included := map[string]bool{}
	excluded := map[string]bool{}

	for _, pattern := range patterns {
		target := included

		if rest, ok := strings.CutPrefix(pattern, "!"); ok {
			target = excluded
			pattern = rest
		}

		dirs, err := expandWorkspacePattern(absRoot, pattern)
		if err != nil {
			return nil, err
		}

		for _, dir := range dirs {
			target[dir] = true
		}
	}

	members := make([]string, 0, len(included))

	for dir := range included {
		if !excluded[dir] {
			members = append(members, dir)
		}
	}

	slices.Sort(members)

	return members, nil
}

// DiscoverWorkspacePackages reads the workspace member patterns from the root
// package.json `workspaces` field and the root deno.json `workspace` field,
// expands their globs, and returns a WorkspacePackage for each member
// directory that has a named deno.json or package.json. It returns an error
// wrapping ErrNoWorkspaceMembers when no member is found, so a validator never
// passes after checking nothing.
func DiscoverWorkspacePackages(root string) ([]WorkspacePackage, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve workspace root %q: %w", root, err)
	}

	patterns, err := workspacePatterns(absRoot)
	if err != nil {
		return nil, err
	}

	memberPaths, err := expandWorkspacePatterns(absRoot, patterns)
	if err != nil {
		return nil, err
	}

	packages := make([]WorkspacePackage, 0, len(memberPaths))

	for _, memberPath := range memberPaths {
		denoRaw, err := readOptionalJSONFile(filepath.Join(memberPath, "deno.json"))
		if err != nil {
			return nil, err
		}

		pkgRaw, err := readOptionalJSONFile(filepath.Join(memberPath, "package.json"))
		if err != nil {
			return nil, err
		}

		name := packageName(denoRaw, pkgRaw)
		if name == "" {
			continue
		}

		packages = append(packages, WorkspacePackage{
			Name:   name,
			Path:   memberPath,
			Config: parseWorkspacePackageConfig(denoRaw, pkgRaw),
		})
	}

	if len(packages) == 0 {
		return nil, fmt.Errorf(
			"discover workspace packages in %q: patterns %q matched no directory with a named "+
				"package.json or deno.json; list member globs in the root package.json workspaces: %w",
			absRoot, patterns, ErrNoWorkspaceMembers,
		)
	}

	return packages, nil
}
