// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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

// DiscoverWorkspacePackages reads the root deno.json, discovers workspace members,
// and returns a WorkspacePackage for each member that has a name.
func DiscoverWorkspacePackages(root string) ([]WorkspacePackage, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	rootDenoPath := filepath.Join(absRoot, "deno.json")

	rootDeno, err := readJSONFile(rootDenoPath)
	if err != nil {
		return nil, fmt.Errorf("reading root deno.json: %w", err)
	}

	// Collect member paths from the workspace array.
	memberPaths := stringsFromInterface(rootDeno["workspace"])
	if len(memberPaths) == 0 {
		return nil, nil
	}

	packages := make([]WorkspacePackage, 0, len(memberPaths))

	for _, rel := range memberPaths {
		memberPath := filepath.Join(absRoot, rel)

		denoRaw, _ := readJSONFile(filepath.Join(memberPath, "deno.json"))
		pkgRaw, _ := readJSONFile(filepath.Join(memberPath, "package.json"))

		if denoRaw == nil && pkgRaw == nil {
			continue
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

	return packages, nil
}
