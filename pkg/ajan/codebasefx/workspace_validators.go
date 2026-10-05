// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"encoding/json"
	"fmt"
	"io/fs"
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
	cycles := [][]string{}
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

	violations := []ExportNameViolation{}

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

// Module files are checked by extension; a test or bench file
// (`x.test.ts`, `x_bench.tsx`, ...) is never a public module.
var (
	moduleFileRx    = regexp.MustCompile(`\.[cm]?[jt]sx?$`)
	testOrBenchRx   = regexp.MustCompile(`[._](?:test|bench)\.[cm]?[jt]sx?$`)
	relativeSpecRxs = []*regexp.Regexp{
		// import ... from "./x.ts", export ... from "./x.ts", import "./x.ts"
		// and import("./x.ts").
		regexp.MustCompile(`(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}/[^"']+)["']`),
		// new URL("./worker.ts", import.meta.url) for workers and assets.
		regexp.MustCompile(`new\s+URL\(\s*["'](\.{1,2}/[^"']+)["']`),
		// /// <reference types="./x.d.ts" /> and // @ts-self-types="./x.d.ts".
		regexp.MustCompile(`(?:path|types)=["'](\.{1,2}/[^"']+)["']`),
	}
	// A module that runs as a program is an entry point of its own.
	programEntryMarker = "import.meta.main"
	// Sloppy imports may leave the extension out; these are tried in order.
	implicitExtensions = []string{"", ".ts", ".tsx", ".js", ".mjs"}
)

// isModuleFile reports whether name is a JS or TS module that is not a test
// or bench file.
func isModuleFile(name string) bool {
	return moduleFileRx.MatchString(name) && !testOrBenchRx.MatchString(name)
}

// exportTargets returns the file paths of an exports, bin or main field, in
// its string form or its map form (subpath to path, or subpath to a map of
// conditions to paths).
func exportTargets(v interface{}) []string {
	switch t := v.(type) {
	case string:
		return []string{t}
	case map[string]interface{}:
		var out []string
		for _, val := range t {
			out = append(out, exportTargets(val)...)
		}

		return out
	default:
		return nil
	}
}

// packageModules reads every non-test module under pkgDir, keyed by absolute
// path. It skips node_modules, build output (dist) and hidden directories.
func packageModules(pkgDir string) (map[string]string, error) {
	modules := make(map[string]string)

	err := filepath.WalkDir(pkgDir, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		name := entry.Name()

		if entry.IsDir() {
			if current != pkgDir && (name == "node_modules" || name == "dist" || strings.HasPrefix(name, ".")) {
				return filepath.SkipDir
			}

			return nil
		}

		if !isModuleFile(name) {
			return nil
		}

		data, err := os.ReadFile(current) //nolint:gosec // walking the package's own directory
		if err != nil {
			return err
		}

		modules[current] = string(data)

		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read modules of %s: %w", pkgDir, err)
	}

	return modules, nil
}

// packageEntryPoints returns the absolute paths of a package's entry modules:
// mod.ts, every target of the exports map in deno.json and package.json, the
// package.json bin, main and module targets, and every module that runs as a
// program.
func packageEntryPoints(pkg *WorkspacePackage, modules map[string]string) []string {
	targets := []string{"./mod.ts"}

	if pkg.Config.RawDeno != nil {
		targets = append(targets, exportTargets(pkg.Config.RawDeno["exports"])...)
	}

	if pkg.Config.RawPackage != nil {
		for _, field := range []string{"exports", "bin", "main", "module"} {
			targets = append(targets, exportTargets(pkg.Config.RawPackage[field])...)
		}
	}

	entries := make([]string, 0, len(targets))
	for _, target := range targets {
		entries = append(entries, filepath.Join(pkg.Path, filepath.FromSlash(target)))
	}

	for modulePath, content := range modules {
		if strings.Contains(content, programEntryMarker) {
			entries = append(entries, modulePath)
		}
	}

	return entries
}

// relativeSpecifiers returns the relative module specifiers that content
// imports, re-exports, references or loads as a worker.
func relativeSpecifiers(content string) []string {
	var specs []string

	for _, rx := range relativeSpecRxs {
		for _, m := range rx.FindAllStringSubmatch(content, -1) {
			specs = append(specs, m[1])
		}
	}

	return specs
}

// resolveSpecifier returns the module a relative specifier in from points to,
// trying the implicit extensions in order; it falls back to the bare path.
func resolveSpecifier(from, spec string, modules map[string]string) string {
	target := filepath.Join(filepath.Dir(from), filepath.FromSlash(spec))

	for _, ext := range implicitExtensions {
		if _, ok := modules[target+ext]; ok {
			return target + ext
		}
	}

	return target
}

// reachableModules follows relative imports from the entry points through the
// package's modules and returns every path they reach.
func reachableModules(entries []string, modules map[string]string) map[string]bool {
	reached := make(map[string]bool)
	queue := make([]string, 0, len(entries))

	for _, entry := range entries {
		if !reached[entry] {
			reached[entry] = true
			queue = append(queue, entry)
		}
	}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		for _, spec := range relativeSpecifiers(modules[current]) {
			target := resolveSpecifier(current, spec, modules)
			if !reached[target] {
				reached[target] = true
				queue = append(queue, target)
			}
		}
	}

	return reached
}

// CheckModExports reports the top-level modules of each package that nothing
// reaches. A module is reached when an entry point imports or re-exports it,
// directly or through other modules; the entry points are mod.ts, the exports
// map, the package.json bin, main and module fields, and every module that
// runs as a program (`import.meta.main`). Imports from tests do not count, and
// test, bench and `_`-prefixed files are not checked. An unreached module is
// missing from the exports or is dead code.
func CheckModExports(root string) (ModExportsResult, error) {
	packages, err := DiscoverWorkspacePackages(root)
	if err != nil {
		return ModExportsResult{}, err //nolint:exhaustruct
	}

	missing := []MissingExport{}

	for _, pkg := range packages {
		entries, err := os.ReadDir(pkg.Path)
		if err != nil {
			return ModExportsResult{}, fmt.Errorf("list package %s: %w", pkg.Name, err) //nolint:exhaustruct
		}

		modules, err := packageModules(pkg.Path)
		if err != nil {
			return ModExportsResult{}, fmt.Errorf("package %s: %w", pkg.Name, err) //nolint:exhaustruct
		}

		reached := reachableModules(packageEntryPoints(&pkg, modules), modules)

		for _, entry := range entries {
			name := entry.Name()

			if entry.IsDir() || strings.HasPrefix(name, "_") || !isModuleFile(name) {
				continue
			}

			if !reached[filepath.Join(pkg.Path, name)] {
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
// A deno.json without an `imports` map leaves dependency resolution to
// package.json, so there is nothing to keep in step and no issue is reported.
func checkPkgDependencies(packageName string, cfg WorkspacePackageConfig) []DependencyInconsistency {
	if _, declared := cfg.RawDeno["imports"]; !declared {
		return nil
	}

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

	inconsistencies := []ConfigInconsistency{}
	depInconsistencies := []DependencyInconsistency{}

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
//
// One pass over each regex. The previous version re-ran the JSDoc regex over
// the whole prefix for EVERY export and recounted newlines from the start of
// the file each time — quadratic in the number of exports, which is exactly
// the shape of a public mod.ts. Both match lists are in document order, so a
// single cursor over the JSDoc list and an incremental line count suffice.
func extractJSDocEntries(content string) []jsDocEntry {
	exports := exportRx.FindAllStringSubmatchIndex(content, -1)
	if len(exports) == 0 {
		return nil
	}

	jsdocs := jsdocRx.FindAllStringSubmatchIndex(content, -1)
	entries := make([]jsDocEntry, 0, len(exports))

	line := 1
	scanned := 0
	next := 0 // first JSDoc that ends after the current export

	for _, m := range exports {
		exportStart := m[0]
		line += strings.Count(content[scanned:exportStart], "\n")
		scanned = exportStart

		for next < len(jsdocs) && jsdocs[next][1] <= exportStart {
			next++
		}

		// The last JSDoc that ends before the export counts only when nothing
		// but whitespace separates them; an earlier one always has that later
		// comment in between, so no other candidate needs checking.
		var jsdoc string

		if next > 0 {
			last := jsdocs[next-1]
			if strings.TrimSpace(content[last[1]:exportStart]) == "" {
				jsdoc = content[last[2]:last[3]]
			}
		}

		entries = append(entries, jsDocEntry{
			jsdoc:      jsdoc,
			symbolName: content[m[2]:m[3]],
			line:       line,
		})
	}

	return entries
}

// CheckDocs validates JSDoc presence on exported symbols in all workspace packages.
func CheckDocs(root string, requireExamples bool) (DocsResult, error) {
	packages, err := DiscoverWorkspacePackages(root)
	if err != nil {
		return DocsResult{}, err //nolint:exhaustruct
	}

	issues := []DocIssue{}
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
			if !strings.HasSuffix(name, ".ts") || testOrBenchRx.MatchString(name) {
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
