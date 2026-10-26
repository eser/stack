// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"unicode/utf8"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"gopkg.in/yaml.v3"
)

// The validate-* file tools check what the TypeScript tools of the same
// names in pkg/@eserstack/codebase check, so moving the gate to Go
// (TASK-248) neither lets a violation through nor fails a tree the
// TypeScript gate passes:
//
//   - each tool walks the extensions of its TypeScript tool and skips the
//     paths of its DEFAULT_EXCLUDES (file-tools-shared.ts);
//   - a file with a NUL byte in its first 8 KiB is binary, and the content
//     checks and fixes skip it;
//   - validate-line-endings flags any CR, validate-merge-conflict uses the
//     TypeScript marker patterns, validate-yaml parses every document,
//     validate-submodules reads the root .gitmodules only, validate-filenames
//     has no built-in excludes, and validate-server-loc and
//     validate-error-coverage fail when their directory or file is missing.

// tsDefaultExcludes are the DEFAULT_EXCLUDES of the TypeScript walk.
var tsDefaultExcludes = []string{"node_modules", ".git/", "/dist/", "etc/coverage", "etc/temp", ".output/"} //nolint:gochecknoglobals // a fixed list

// jsExtensions are JS_FILE_EXTENSIONS of @eserstack/standards/patterns.
var jsExtensions = []string{".tsx", ".jsx", ".ts", ".js", ".mts", ".mjs", ".cts", ".cjs"} //nolint:gochecknoglobals // a fixed list

// binarySniffBytes is how much of a file the binary check reads, as in the
// TypeScript isBinaryBytes.
const binarySniffBytes = 8192

func isBinary(content []byte) bool {
	return bytes.IndexByte(content[:min(len(content), binarySniffBytes)], 0) >= 0
}

// textOnly skips binary files.
func textOnly(vf codebasefx.ValidatorFunc) codebasefx.ValidatorFunc {
	return func(path string, content []byte) []codebasefx.ValidatorIssue {
		if isBinary(content) {
			return nil
		}

		return vf(path, content)
	}
}

// textOnlyFix skips binary files.
func textOnlyFix(fx codebasefx.FixerFunc) codebasefx.FixerFunc {
	return func(path string, content []byte) ([]byte, bool) {
		if isBinary(content) {
			return nil, false
		}

		return fx(path, content)
	}
}

func textFactory(vf codebasefx.ValidatorFunc) validatorFactory {
	return staticFactory(textOnly(vf))
}

func issue(path, message string) []codebasefx.ValidatorIssue {
	return []codebasefx.ValidatorIssue{{Severity: "error", File: path, Message: message}} //nolint:exhaustruct
}

// validateNoCR flags a file with a CRLF or a lone CR line ending.
func validateNoCR(path string, content []byte) []codebasefx.ValidatorIssue {
	if bytes.IndexByte(content, '\r') >= 0 {
		return issue(path, "file contains CRLF or CR line endings")
	}

	return nil
}

// mergeMarkers are the conflict marker patterns of validate-merge-conflict.ts.
var mergeMarkers = []*regexp.Regexp{ //nolint:gochecknoglobals // compiled once
	regexp.MustCompile(`^<{7}\s`),
	regexp.MustCompile(`^={7}$`),
	regexp.MustCompile(`^>{7}\s`),
}

func validateMergeMarkers(path string, content []byte) []codebasefx.ValidatorIssue {
	var issues []codebasefx.ValidatorIssue

	for i, line := range bytes.Split(content, []byte("\n")) {
		for _, marker := range mergeMarkers {
			if marker.Match(line) {
				issues = append(issues, codebasefx.ValidatorIssue{ //nolint:exhaustruct
					Severity: "error",
					File:     path,
					Line:     i + 1,
					Message:  "merge conflict marker: " + string(line[:min(len(line), 20)]),
				})

				break
			}
		}
	}

	return issues
}

// yamlFactory parses every document of a YAML file; allowMultipleDocuments
// (true unless set to false) permits more than one.
func yamlFactory(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	allowMultiple := true
	if raw, ok := opts["allowMultipleDocuments"]; ok {
		value, isBool := raw.(bool)
		if !isBool {
			return nil, fmt.Errorf("%w: allowMultipleDocuments must be true or false, got %v", codebasefx.ErrInvalidOption, raw)
		}

		allowMultiple = value
	}

	return textOnly(func(path string, content []byte) []codebasefx.ValidatorIssue {
		if !utf8.Valid(content) {
			return nil
		}

		decoder := yaml.NewDecoder(bytes.NewReader(content))
		documents := 0

		for {
			var node yaml.Node

			err := decoder.Decode(&node)
			if errors.Is(err, io.EOF) {
				break
			}

			if err != nil {
				return issue(path, "invalid YAML: "+err.Error())
			}

			documents++
		}

		if documents > 1 && !allowMultiple {
			return issue(path, fmt.Sprintf("file holds %d YAML documents; set allowMultipleDocuments: true to allow them", documents))
		}

		return nil
	}), nil
}

// submodulesFactory checks the .gitmodules at the root only, as the
// TypeScript tool does; a vendored tree may keep its own.
func submodulesFactory(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	root, err := filepath.Abs(optStr(opts, "root", optStr(opts, "cwd", ".")))
	if err != nil {
		return nil, fmt.Errorf("resolve root: %w", err)
	}

	rootModules := filepath.ToSlash(filepath.Join(root, ".gitmodules"))
	check := codebasefx.ValidateSubmodules()

	return func(path string, content []byte) []codebasefx.ValidatorIssue {
		if filepath.ToSlash(path) != rootModules {
			return nil
		}

		return check(path, content)
	}, nil
}

// filenamesFactory applies the rules with the globalExcludes option only; the
// TypeScript workflow tool has no built-in excludes.
func filenamesFactory(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	rules, err := codebasefx.ParseFilenameRules(opts["rules"])
	if err != nil {
		return nil, err //nolint:wrapcheck // names the rule
	}

	excludes, err := stringOption(opts["globalExcludes"])
	if err != nil {
		return nil, fmt.Errorf("globalExcludes: %w", err)
	}

	if excludes == nil {
		excludes = []string{}
	}

	return codebasefx.ValidateFilenames(rules, excludes), nil
}

func largeFilesFactory(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	maxKb, err := codebasefx.ParseMaxKb(opts["maxKb"])
	if err != nil {
		return nil, err //nolint:wrapcheck // names the option
	}

	return codebasefx.ValidateLargeFile(maxKb * 1024), nil
}

// requirePath fails a step whose option names a path under the root that
// does not exist.
func requirePath(option string) func(root string, opts map[string]any) []codebasefx.ValidatorIssue {
	return func(root string, opts map[string]any) []codebasefx.ValidatorIssue {
		rel, _ := opts[option].(string)
		if rel == "" {
			return nil
		}

		path := rel
		if !filepath.IsAbs(path) {
			path = filepath.Join(root, rel)
		}

		if _, err := os.Stat(path); err != nil {
			return issue(path, fmt.Sprintf("the %s option names %s, which cannot be read: %v; fix the option or restore the path", option, rel, err))
		}

		return nil
	}
}

// manifestFileTools are the validate-* tools that validate file by file.
func manifestFileTools() []*validatorTool {
	tools := []*validatorTool{
		{name: "validate-eof", desc: "ensure files end with exactly one newline", factory: textFactory(codebasefx.ValidateEOF), fixer: textOnlyFix(codebasefx.FixEOF)},
		{name: "validate-trailing-whitespace", desc: "remove trailing whitespace from lines", factory: textFactory(codebasefx.ValidateTrailingWhitespace), fixer: textOnlyFix(codebasefx.FixTrailingWhitespace)},
		{name: "validate-bom", desc: "remove UTF-8 byte order marks", factory: textFactory(codebasefx.ValidateBOM), fixer: textOnlyFix(codebasefx.FixBOM)},
		{name: "validate-line-endings", desc: "normalize line endings to LF", factory: textFactory(validateNoCR), fixer: textOnlyFix(codebasefx.FixLineEndings)},
		{name: "validate-large-files", desc: "detect files over the size limit (maxKb)", factory: largeFilesFactory},
		{name: "validate-case-conflict", desc: "detect paths that differ only by case", factory: func(map[string]any) (codebasefx.ValidatorFunc, error) { return codebasefx.ValidateCaseConflict(), nil }},
		{name: "validate-merge-conflict", desc: "detect merge conflict markers", factory: textFactory(validateMergeMarkers)},
		{name: "validate-json", desc: "validate JSON and JSONC syntax", factory: textFactory(codebasefx.ValidateJSON), extensions: []string{".json", ".jsonc"}},
		{name: "validate-toml", desc: "validate TOML syntax", factory: textFactory(codebasefx.ValidateTOML), extensions: []string{".toml"}},
		{name: "validate-yaml", desc: "validate YAML syntax (allowMultipleDocuments)", factory: yamlFactory, extensions: []string{".yml", ".yaml"}},
		{name: "validate-symlinks", desc: "detect broken symbolic links", factory: func(map[string]any) (codebasefx.ValidatorFunc, error) { return codebasefx.ValidateSymlinks(), nil }},
		{name: "validate-shebangs", desc: "validate shebang lines (no checks yet)", factory: staticFactory(codebasefx.ValidateShebangs)},
		{name: "validate-secrets", desc: "detect credentials and private keys", factory: textFactory(codebasefx.ValidateSecrets)},
		{name: "validate-filenames", desc: "enforce the filename conventions of the rules", factory: filenamesFactory},
		{name: "validate-submodules", desc: "detect git submodules", factory: submodulesFactory},
		{name: "validate-licenses", desc: "check the copyright header of JS and TS files", factory: textFactory(codebasefx.ValidateLicenseHeader), fixer: textOnlyFix(codebasefx.FixLicenseHeader), extensions: jsExtensions},
		{name: "validate-runtime-js-apis", desc: "detect runtime globals used instead of @eserstack/standards/cross-runtime", factory: staticFactory(codebasefx.ValidateRuntimeJSAPIs)},
		{name: "validate-self-imports", desc: "detect a package importing itself by its published name", factory: staticFactory(codebasefx.ValidateSelfImports)},
		{name: "validate-code-conventions", desc: "detect non-namespace imports, `||` defaults and `export *` beyond the recorded baseline", factory: codeConventionsFactory},
		{name: "validate-naming-and-todos", desc: "enforce camelCase names and task-tagged TODO comments", factory: namingFactory},
		{name: "validate-server-loc", desc: "fail when a non-test file of a directory exceeds the line ceiling", factory: codebasefx.ParseServerLocOptions, precheck: requirePath("directory")},
		{name: "validate-error-coverage", desc: "verify that error-struct entries fill the required fields", factory: codebasefx.ParseErrorCoverageOptions, precheck: requirePath("file")},
	}

	for _, tool := range tools {
		tool.excludes = tsDefaultExcludes
	}

	return tools
}

func namingFactory(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	allow, err := codebasefx.ParseAllowNames(opts["allowNames"])
	if err != nil {
		return nil, err //nolint:wrapcheck // names the option
	}

	return codebasefx.ValidateNamingAndTodos(allow), nil
}
