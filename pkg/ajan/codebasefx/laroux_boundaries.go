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

// DefaultLarouxImporterAllowlist holds today's importers of the deprecated
// laroux packages, relative to the root.
const DefaultLarouxImporterAllowlist = ".eser/baselines/laroux-deprecated-importers.json"

const (
	eserstackScope    = "@eserstack/"
	eserstackPkgDir   = "pkg/" + eserstackScope
	larouxBinNpmName  = "laroux" // the npm name of @eserstack/laroux-bin (decision-47)
	larouxPkg         = eserstackScope + "laroux"
	larouxBinPkg      = eserstackScope + "laroux-bin"
	larouxBundlerPkg  = eserstackScope + "laroux-bundler"
	larouxReactPkg    = eserstackScope + "laroux-react"
	larouxServerPkg   = eserstackScope + "laroux-server"
	bundlerPkg        = eserstackScope + "bundler"
	larouxRuntimePath = eserstackPkgDir + "laroux-server/runtime/"
)

// LarouxImporterAllowlist lists, per deprecated package, the files that may
// still import it. It only shrinks: an entry whose file no longer imports the
// package fails the check until it is removed.
type LarouxImporterAllowlist map[string][]string

// ReadLarouxImporterAllowlist reads the allowlist file. A missing file is an
// empty allowlist; a broken file or a key that is not a deprecated package is
// an error.
func ReadLarouxImporterAllowlist(file string) (LarouxImporterAllowlist, error) {
	content, err := os.ReadFile(file) //nolint:gosec // G304: a path from the repository's manifest
	if errors.Is(err, fs.ErrNotExist) {
		return LarouxImporterAllowlist{}, nil
	}

	if err != nil {
		return nil, fmt.Errorf("read the laroux importer allowlist: %w", err)
	}

	var allowlist LarouxImporterAllowlist
	if err := json.Unmarshal(content, &allowlist); err != nil {
		return nil, fmt.Errorf("parse the laroux importer allowlist %s: %w", file, err)
	}

	for name := range allowlist {
		if name != larouxBundlerPkg && name != larouxReactPkg {
			return nil, fmt.Errorf("%w: the laroux importer allowlist %s has the key %q; only %s and %s can be allowlisted",
				ErrInvalidOption, file, name, larouxBundlerPkg, larouxReactPkg)
		}
	}

	return allowlist, nil
}

// LarouxBoundariesResult is what CheckLarouxBoundaries found.
type LarouxBoundariesResult struct {
	Issues       []ValidatorIssue
	FilesChecked int
}

// CheckLarouxBoundaries applies the import rules of decision-46 and decision-53
// to the JavaScript and TypeScript files among files:
//
//   - laroux-server/runtime/ never imports the tool's cli/ or dev/ code, nor
//     cli.ts and commands/, where that code lives until it moves there;
//   - @eserstack/bundler never imports React or a laroux package;
//   - @eserstack/laroux never imports @eserstack/bundler or laroux-server;
//   - nothing imports @tanstack/*;
//   - nothing imports @eserstack/laroux-bundler or @eserstack/laroux-react
//     unless the allowlist lists the file for that package, and an allowlist
//     entry whose file does not import the package is an issue too.
//
// Issue paths are relative to root. Only direct imports count; a package's
// imports of itself are not the business of the last rule.
func CheckLarouxBoundaries(root string, allowlist LarouxImporterAllowlist, files []FileEntry) (LarouxBoundariesResult, error) {
	var result LarouxBoundariesResult

	importing := make(map[larouxImporter]bool)

	for _, file := range files {
		if file.IsSymlink || !slices.Contains(codeConventionsExtensions, strings.ToLower(filepath.Ext(file.Path))) {
			continue
		}

		content, err := os.ReadFile(file.Path) //nolint:gosec // G304: a file the caller's walk listed
		if err != nil {
			return LarouxBoundariesResult{}, fmt.Errorf("read %s: %w", file.Path, err)
		}

		result.FilesChecked++

		rel := relativeSlashPath(root, file.Path)

		for _, imp := range extractTSImports(content) {
			target := resolveLarouxImport(rel, imp.Specifier)
			if message := larouxBoundaryViolation(rel, target); message != "" {
				result.Issues = append(result.Issues, larouxIssue(rel, imp.Line, fmt.Sprintf("imports %q: %s", imp.Specifier, message)))
			}

			if !isDeprecatedLarouxImport(rel, target) {
				continue
			}

			importing[larouxImporter{pkg: target.pkg, file: rel}] = true

			if !slices.Contains(allowlist[target.pkg], rel) {
				result.Issues = append(result.Issues, larouxIssue(rel, imp.Line, fmt.Sprintf(
					"imports %q: %s is deprecated, import @eserstack/laroux or @eserstack/bundler instead (decision-46); its allowlist only shrinks",
					imp.Specifier, target.pkg,
				)))
			}
		}
	}

	result.Issues = append(result.Issues, staleLarouxEntries(allowlist, importing)...)

	return result, nil
}

func larouxIssue(file string, line int, message string) ValidatorIssue {
	return ValidatorIssue{Severity: "error", File: file, Line: line, Message: message, Fixed: false}
}

// staleLarouxEntries reports the allowlist entries that no file backs, in a
// fixed order.
func staleLarouxEntries(allowlist LarouxImporterAllowlist, importing map[larouxImporter]bool) []ValidatorIssue {
	var issues []ValidatorIssue

	for _, name := range []string{larouxBundlerPkg, larouxReactPkg} {
		for _, file := range allowlist[name] {
			if !importing[larouxImporter{pkg: name, file: file}] {
				issues = append(issues, larouxIssue(file, 0, fmt.Sprintf(
					"stale allowlist entry: this file is listed for %s but does not import it; remove the entry from the allowlist",
					name,
				)))
			}
		}
	}

	return issues
}

// larouxImporter is a file that imports a deprecated package.
type larouxImporter struct {
	pkg  string
	file string
}

// larouxImportTarget is where an import points: a package name (for a relative
// import, the package of the directory it lands in) and the path inside it.
// Both are empty when a relative import lands outside the packages.
type larouxImportTarget struct {
	pkg string
	sub string
}

// resolveLarouxImport places specifier, imported by the file at importer (a
// slash path relative to the root), in a package.
func resolveLarouxImport(importer, specifier string) larouxImportTarget {
	spec := specifier
	if cut := strings.IndexAny(spec, "?#"); cut >= 0 {
		spec = spec[:cut]
	}

	if strings.HasPrefix(spec, ".") {
		resolved := path.Join(path.Dir(importer), spec)

		rest, ok := strings.CutPrefix(resolved, eserstackPkgDir)
		if !ok {
			return larouxImportTarget{}
		}

		name, sub, _ := strings.Cut(rest, "/")

		return larouxImportTarget{pkg: eserstackScope + name, sub: sub}
	}

	pkg, sub := splitBareSpecifier(strings.TrimPrefix(strings.TrimPrefix(spec, "npm:"), "jsr:"))

	return larouxImportTarget{pkg: pkg, sub: sub}
}

// splitBareSpecifier splits a bare specifier into its package name, without a
// version, and the path after it.
func splitBareSpecifier(spec string) (string, string) {
	first, rest, _ := strings.Cut(spec, "/")
	if !strings.HasPrefix(spec, "@") {
		name, _, _ := strings.Cut(first, "@")

		return name, rest
	}

	second, tail, _ := strings.Cut(rest, "/")
	name, _, _ := strings.Cut(second, "@")

	return first + "/" + name, tail
}

// larouxBoundaryViolation returns why the file at importer must not import
// target, or "" when it may. The deprecated packages are handled apart, as
// they have an allowlist.
func larouxBoundaryViolation(importer string, target larouxImportTarget) string {
	switch {
	case strings.HasPrefix(target.pkg, "@tanstack/"):
		return "TanStack packages left the plan (decision-53)"
	case strings.HasPrefix(importer, larouxRuntimePath) && target.pkg == larouxServerPkg && isLarouxToolPath(target.sub):
		return "laroux-server/runtime/ goes into dist/server/index.js and never imports cli/ or dev/ code (decision-46)"
	case isInPackage(importer, bundlerPkg) && isReactOrLaroux(target.pkg):
		return "@eserstack/bundler stays free of React and laroux packages (decision-46)"
	case isInPackage(importer, larouxPkg) && isLarouxToolPackage(target.pkg):
		return "@eserstack/laroux holds what app code imports and never imports the tool or the bundler (decision-46)"
	default:
		return ""
	}
}

// isDeprecatedLarouxImport reports whether target is a deprecated package other
// than the importer's own.
func isDeprecatedLarouxImport(importer string, target larouxImportTarget) bool {
	return (target.pkg == larouxBundlerPkg || target.pkg == larouxReactPkg) && !isInPackage(importer, target.pkg)
}

// isInPackage reports whether the root-relative path file is in the package.
func isInPackage(file, pkg string) bool {
	return strings.HasPrefix(file, eserstackPkgDir+strings.TrimPrefix(pkg, eserstackScope)+"/")
}

// isLarouxToolPath reports whether sub, a path inside laroux-server or one of
// its export sub-paths, is CLI or dev code: cli/, dev/, cli.ts or commands/.
func isLarouxToolPath(sub string) bool {
	first, _, _ := strings.Cut(sub, "/")
	first = strings.TrimSuffix(first, path.Ext(first))

	return first == "cli" || first == "dev" || first == "commands"
}

func isReactOrLaroux(pkg string) bool {
	return pkg == "react" || strings.HasPrefix(pkg, "react-") ||
		pkg == larouxBinNpmName || pkg == larouxPkg || strings.HasPrefix(pkg, larouxPkg+"-")
}

func isLarouxToolPackage(pkg string) bool {
	return pkg == bundlerPkg || pkg == larouxServerPkg || pkg == larouxBinPkg || pkg == larouxBinNpmName
}
