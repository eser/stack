// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

// =============================================================================
// CheckCircularDeps
// =============================================================================

// buildDepGraph maps each package name to its intra-workspace dependencies.
func buildDepGraph(packages []WorkspacePackage) map[string][]string {
	names := make(map[string]bool, len(packages))
	for _, p := range packages {
		names[p.Name] = true
	}

	graph := make(map[string][]string, len(packages))

	for _, pkg := range packages {
		seen := make(map[string]bool)
		var deps []string

		addDep := func(name string) {
			if names[name] && !seen[name] {
				seen[name] = true
				deps = append(deps, name)
			}
		}

		// package.json dependencies → intra-workspace deps use workspace:* spec.
		for depName := range pkg.Config.Dependencies {
			addDep(depName)
		}

		for depName := range pkg.Config.DevDependencies {
			addDep(depName)
		}

		// deno.json imports → keys are the import specifiers / package names.
		for importKey := range pkg.Config.Imports {
			addDep(importKey)
		}

		graph[pkg.Name] = deps
	}

	return graph
}

// detectCycles runs DFS on graph and returns all found cycles.
func detectCycles(graph map[string][]string) [][]string {
	var cycles [][]string
	visited := make(map[string]bool)
	inStack := make(map[string]bool)
	path := make([]string, 0, len(graph))

	var dfs func(node string)
	dfs = func(node string) {
		visited[node] = true
		inStack[node] = true
		path = append(path, node)

		for _, neighbor := range graph[node] {
			if !visited[neighbor] {
				dfs(neighbor)
			} else if inStack[neighbor] {
				start := 0
				for i, n := range path {
					if n == neighbor {
						start = i
						break
					}
				}
				cycle := make([]string, len(path)-start+1)
				copy(cycle, path[start:])
				cycle[len(cycle)-1] = neighbor
				cycles = append(cycles, cycle)
			}
		}

		path = path[:len(path)-1]
		inStack[node] = false
	}

	for node := range graph {
		if !visited[node] {
			dfs(node)
		}
	}

	return cycles
}

// CheckCircularDeps detects circular dependencies between workspace packages.
func CheckCircularDeps(root string) (CircularDepsResult, error) {
	packages, err := DiscoverWorkspacePackages(root)
	if err != nil {
		return CircularDepsResult{}, err //nolint:exhaustruct
	}

	graph := buildDepGraph(packages)
	cycles := detectCycles(graph)

	return CircularDepsResult{
		HasCycles:       len(cycles) > 0,
		Cycles:          cycles,
		PackagesChecked: len(packages),
	}, nil
}

// =============================================================================
// CheckExportNames
// =============================================================================

var exportKebabRx = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// toKebabCase converts a string to kebab-case.
func toKebabCase(s string) string {
	// camelCase → kebab-case
	s = regexp.MustCompile(`([a-z])([A-Z])`).ReplaceAllString(s, `$1-$2`)
	// underscores / spaces → hyphens
	s = regexp.MustCompile(`[_\s]+`).ReplaceAllString(s, "-")
	return strings.ToLower(s)
}

// isKebabCasePath checks that every path segment (after stripping ext) is kebab-case.
func isKebabCasePath(s string, ignoreWords []string) bool {
	for _, seg := range strings.Split(s, "/") {
		seg = strings.TrimPrefix(seg, ".")
		if seg == "" {
			continue
		}

		if ext := filepath.Ext(seg); ext != "" {
			seg = strings.TrimSuffix(seg, ext)
		}

		if seg == "" {
			continue
		}

		ignored := false
		for _, w := range ignoreWords {
			if w == seg {
				ignored = true
				break
			}
		}

		if !ignored && !exportKebabRx.MatchString(seg) {
			return false
		}
	}

	return true
}

// CheckExportNames validates that deno.json export paths use kebab-case.
func CheckExportNames(root string, ignoreWords []string) (ExportNamesResult, error) {
	packages, err := DiscoverWorkspacePackages(root)
	if err != nil {
		return ExportNamesResult{}, err //nolint:exhaustruct
	}

	var violations []ExportNameViolation

	for _, pkg := range packages {
		exports := pkg.Config.Exports
		if exports == nil {
			continue
		}

		check := func(exportPath string) {
			if !isKebabCasePath(exportPath, ignoreWords) {
				violations = append(violations, ExportNameViolation{
					PackageName: pkg.Name,
					ExportPath:  exportPath,
					Suggestion:  toKebabCase(exportPath),
				})
			}
		}

		switch v := exports.(type) {
		case string:
			check(v)
		case map[string]interface{}:
			for key, val := range v {
				check(key)
				if s, ok := val.(string); ok {
					check(s)
				}
			}
		}
	}

	return ExportNamesResult{
		IsValid:         len(violations) == 0,
		Violations:      violations,
		PackagesChecked: len(packages),
	}, nil
}

// =============================================================================
// CheckModExports
// =============================================================================

var (
	reExportAll   = regexp.MustCompile(`export\s+\*\s+from\s+["']([^"']+)["']`)
	reExportNamed = regexp.MustCompile(`export\s+\{[^}]*\}\s+from\s+["']([^"']+)["']`)
	reExportType  = regexp.MustCompile(`export\s+type\s+\{[^}]*\}\s+from\s+["']([^"']+)["']`)
)

// extractModExports parses export paths from mod.ts content.
func extractModExports(content string) map[string]bool {
	seen := make(map[string]bool)
	for _, rx := range []*regexp.Regexp{reExportAll, reExportNamed, reExportType} {
		for _, m := range rx.FindAllStringSubmatch(content, -1) {
			if len(m) > 1 {
				seen[m[1]] = true
			}
		}
	}
	return seen
}

// normalizeTSPath strips leading "./" and ".ts" suffix for comparison.
func normalizeTSPath(p string) string {
	p = strings.TrimPrefix(p, "./")
	p = strings.TrimSuffix(p, ".ts")
	return p
}

// shouldExportFile returns true when a .ts filename should appear in mod.ts.
func shouldExportFile(name string) bool {
	if name == "mod.ts" {
		return false
	}
	if strings.HasSuffix(name, "_test.ts") || strings.HasSuffix(name, "_bench.ts") {
		return false
	}
	if strings.HasPrefix(name, "_") {
		return false
	}
	if strings.Contains(name, "/") {
		return false
	}
	return true
}

// CheckModExports validates that mod.ts exports all public .ts files in each package.
func CheckModExports(root string) (ModExportsResult, error) {
	packages, err := DiscoverWorkspacePackages(root)
	if err != nil {
		return ModExportsResult{}, err //nolint:exhaustruct
	}

	var missing []MissingExport

	for _, pkg := range packages {
		modPath := filepath.Join(pkg.Path, "mod.ts")

		modData, err := os.ReadFile(modPath) //nolint:gosec
		if err != nil {
			continue // no mod.ts — skip
		}

		exports := extractModExports(string(modData))
		normalised := make(map[string]bool, len(exports))
		for e := range exports {
			normalised[normalizeTSPath(e)] = true
		}

		// Enumerate .ts files directly in the package directory.
		entries, err := os.ReadDir(pkg.Path)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}

			name := entry.Name()
			if !strings.HasSuffix(name, ".ts") {
				continue
			}

			if !shouldExportFile(name) {
				continue
			}

			norm := normalizeTSPath(name)
			if !normalised[norm] {
				missing = append(missing, MissingExport{
					PackageName: pkg.Name,
					File:        name,
				})
			}
		}
	}

	return ModExportsResult{
		IsComplete:      len(missing) == 0,
		MissingExports:  missing,
		PackagesChecked: len(packages),
	}, nil
}

// =============================================================================
// CheckPackageConfigs
// =============================================================================

func jsonString(v interface{}) string {
	if v == nil {
		return "null"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "<error>"
	}
	return string(b)
}

// isWorkspaceSpec returns true for workspace:* specs.
func isWorkspaceSpec(spec string) bool {
	return spec == "workspace:*" || strings.HasPrefix(spec, "workspace:")
}

// convertPkgDepToDenoSpec converts a package.json dep entry to the expected deno.json import.
func convertPkgDepToDenoSpec(depName, spec string) string {
	if strings.HasPrefix(spec, "npm:@jsr/") {
		// npm:@jsr/scope__name@version → jsr:@scope/name@version
		rest := spec[9:] // strip "npm:@jsr/"
		idx := strings.Index(rest, "__")
		if idx < 0 {
			return spec
		}
		scope := rest[:idx]
		after := rest[idx+2:]
		atIdx := strings.Index(after, "@")
		var pkgName, versionSuffix string
		if atIdx < 0 {
			pkgName = after
		} else {
			pkgName = after[:atIdx]
			versionSuffix = after[atIdx:]
		}
		return "jsr:@" + scope + "/" + pkgName + versionSuffix
	}
	if strings.HasPrefix(spec, "npm:") {
		return spec
	}
	return "npm:" + depName + "@" + spec
}

// checkPkgDependencies compares package.json deps against deno.json imports.
func checkPkgDependencies(packageName string, cfg WorkspacePackageConfig) []DependencyInconsistency {
	var issues []DependencyInconsistency

	allPkgDeps := make(map[string]string)
	for k, v := range cfg.Dependencies {
		allPkgDeps[k] = v
	}
	for k, v := range cfg.DevDependencies {
		allPkgDeps[k] = v
	}

	// Check each package.json dep exists in deno.json imports.
	for depName, depSpec := range allPkgDeps {
		if isWorkspaceSpec(depSpec) {
			continue
		}

		expected := convertPkgDepToDenoSpec(depName, depSpec)
		actual, exists := cfg.Imports[depName]

		if !exists {
			issues = append(issues, DependencyInconsistency{
				PackageName:    packageName,
				DependencyName: depName,
				Issue:          "missing_in_deno",
				Expected:       expected,
			})
		} else if actual != expected {
			issues = append(issues, DependencyInconsistency{
				PackageName:    packageName,
				DependencyName: depName,
				Issue:          "version_mismatch",
				Expected:       expected,
				Actual:         actual,
			})
		}
	}

	// Check for imports in deno.json that aren't in package.json.
	for importName, importSpec := range cfg.Imports {
		if allPkgDeps[importName] != "" {
			continue
		}
		issues = append(issues, DependencyInconsistency{
			PackageName:    packageName,
			DependencyName: importName,
			Issue:          "missing_in_package",
			Actual:         importSpec,
		})
	}

	return issues
}

// CheckPackageConfigs validates that deno.json and package.json have consistent fields.
func CheckPackageConfigs(root string) (PackageConfigsResult, error) {
	packages, err := DiscoverWorkspacePackages(root)
	if err != nil {
		return PackageConfigsResult{}, err //nolint:exhaustruct
	}

	var inconsistencies []ConfigInconsistency
	var depInconsistencies []DependencyInconsistency

	for _, pkg := range packages {
		cfg := pkg.Config
		if cfg.RawDeno == nil || cfg.RawPackage == nil {
			continue
		}

		for _, field := range []string{"name", "version", "exports"} {
			denoVal := cfg.RawDeno[field]
			pkgVal := cfg.RawPackage[field]

			if denoVal == nil || pkgVal == nil {
				continue
			}

			denoStr := jsonString(denoVal)
			pkgStr := jsonString(pkgVal)

			if denoStr != pkgStr {
				inconsistencies = append(inconsistencies, ConfigInconsistency{
					PackageName:  pkg.Name,
					Field:        field,
					DenoValue:    denoStr,
					PackageValue: pkgStr,
				})
			}
		}

		depInconsistencies = append(depInconsistencies, checkPkgDependencies(pkg.Name, cfg)...)
	}

	hasIssues := len(inconsistencies) > 0 || len(depInconsistencies) > 0

	return PackageConfigsResult{
		IsConsistent:              !hasIssues,
		Inconsistencies:           inconsistencies,
		DependencyInconsistencies: depInconsistencies,
		PackagesChecked:           len(packages),
	}, nil
}

// =============================================================================
// CheckDocs
// =============================================================================

var (
	jsdocRx  = regexp.MustCompile(`(?s)/\*\*(.*?)\*/`)
	exportRx = regexp.MustCompile(`export\s+(?:const|function|class|type|interface)\s+(\w+)`)
)

// jsDocEntry pairs an exported symbol with its preceding JSDoc comment.
type jsDocEntry struct {
	jsdoc      string
	symbolName string
	line       int
}

// extractJSDocEntries finds exported symbols and their preceding JSDoc in content.
func extractJSDocEntries(content string) []jsDocEntry {
	var entries []jsDocEntry

	for _, exportMatch := range exportRx.FindAllStringIndex(content, -1) {
		exportStart := exportMatch[0]
		symbolMatch := exportRx.FindStringSubmatch(content[exportStart:])
		if symbolMatch == nil {
			continue
		}
		symbolName := symbolMatch[1]
		lineNum := 1 + strings.Count(content[:exportStart], "\n")

		// Look for the last JSDoc comment before this export.
		var jsdoc string
		for _, jsdocMatch := range jsdocRx.FindAllStringIndex(content[:exportStart], -1) {
			jsdocEnd := jsdocMatch[1]
			between := content[jsdocEnd:exportStart]
			if strings.TrimSpace(between) == "" {
				// Immediately precedes the export.
				inner := jsdocRx.FindStringSubmatch(content[jsdocMatch[0]:jsdocMatch[1]])
				if inner != nil {
					jsdoc = inner[1]
				}
			}
		}

		entries = append(entries, jsDocEntry{jsdoc: jsdoc, symbolName: symbolName, line: lineNum})
	}

	return entries
}

// CheckDocs validates JSDoc presence on exported symbols in all workspace packages.
func CheckDocs(root string, requireExamples bool) (DocsResult, error) {
	packages, err := DiscoverWorkspacePackages(root)
	if err != nil {
		return DocsResult{}, err //nolint:exhaustruct
	}

	var issues []DocIssue
	filesChecked := 0
	symbolsChecked := 0

	for _, pkg := range packages {
		entries, err := os.ReadDir(pkg.Path)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}

			name := entry.Name()
			if !strings.HasSuffix(name, ".ts") || strings.HasSuffix(name, "_test.ts") {
				continue
			}

			filePath := filepath.Join(pkg.Path, name)
			data, err := os.ReadFile(filePath) //nolint:gosec
			if err != nil {
				continue
			}

			if !utf8.Valid(data) {
				continue
			}

			filesChecked++
			content := string(data)

			for _, e := range extractJSDocEntries(content) {
				symbolsChecked++

				if e.jsdoc == "" {
					issues = append(issues, DocIssue{
						File:   filePath,
						Symbol: e.symbolName,
						Issue:  "missing-description",
						Line:   e.line,
					})
					continue
				}

				// Check that the description line isn't empty or starts with @.
				descLine := strings.TrimSpace(strings.Split(strings.TrimSpace(e.jsdoc), "\n")[0])
				descLine = strings.TrimPrefix(descLine, "*")
				descLine = strings.TrimSpace(descLine)
				if descLine == "" || strings.HasPrefix(descLine, "@") {
					issues = append(issues, DocIssue{
						File:   filePath,
						Symbol: e.symbolName,
						Issue:  "empty-description",
						Line:   e.line,
					})
				}

				if requireExamples && !strings.Contains(e.jsdoc, "@example") {
					issues = append(issues, DocIssue{
						File:   filePath,
						Symbol: e.symbolName,
						Issue:  "missing-example",
						Line:   e.line,
					})
				}
			}
		}
	}

	return DocsResult{
		IsValid:        len(issues) == 0,
		Issues:         issues,
		FilesChecked:   filesChecked,
		SymbolsChecked: symbolsChecked,
	}, nil
}
