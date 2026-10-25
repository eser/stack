// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// The Go ports of validate-self-imports.ts, validate-error-coverage.ts and
// validate-server-loc.ts in pkg/@eserstack/codebase. They report the same
// findings with the same messages; the TypeScript parity test in that package
// runs both on fixtures and on the repository.

var (
	selfImportPackageDir = regexp.MustCompile(`(?:^|/)pkg/@eserstack/([^/]+)/`) //nolint:gochecknoglobals
	selfImportSpecifier  = regexp.MustCompile(                                  //nolint:gochecknoglobals
		"^\\s*(?:import\\b|export\\b|\\})[^\"'`]*?\\bfrom\\s*[\"']([^\"']+)[\"']|^\\s*import\\s*[\"']([^\"']+)[\"']|\\bimport\\(\\s*[\"']([^\"']+)[\"']\\s*\\)",
	)
)

// ValidateSelfImports reports a package under pkg/@eserstack/<name>/ that
// imports itself by its published name (@eserstack/<name> or a subpath),
// which JSR cannot resolve while that version is still being published. Lines
// that start a comment are skipped.
func ValidateSelfImports(path string, content []byte) []ValidatorIssue {
	if !slices.Contains(codeConventionsExtensions, strings.ToLower(filepath.Ext(path))) {
		return nil
	}

	packageMatch := selfImportPackageDir.FindStringSubmatch(filepath.ToSlash(path))
	if packageMatch == nil {
		return nil
	}

	ownName := "@eserstack/" + packageMatch[1]

	var issues []ValidatorIssue

	for i, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimLeft(line, " \t\r\v\f")
		if strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "*") || strings.HasPrefix(trimmed, "/*") {
			continue
		}

		m := selfImportSpecifier.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		specifier := m[1]
		if specifier == "" {
			specifier = m[2]
		}

		if specifier == "" {
			specifier = m[3]
		}

		if specifier != ownName && !strings.HasPrefix(specifier, ownName+"/") {
			continue
		}

		issues = append(issues, ValidatorIssue{
			Severity: "error",
			File:     path,
			Line:     i + 1,
			Message: fmt.Sprintf(
				"package imports itself as %q — use a relative path; JSR cannot resolve jsr:%s while that version is still being published",
				specifier, ownName,
			),
			Fixed: false,
		})
	}

	return issues
}

// ErrorCoverageViolation is an error-struct entry with empty required fields.
type ErrorCoverageViolation struct {
	Name    string
	Missing []string
}

// ErrorCoverageResult is what CheckErrorCoverage found.
type ErrorCoverageResult struct {
	Violations []ErrorCoverageViolation
	Checked    int
}

// DefaultErrorObjects and DefaultRequiredFields are the TypeScript defaults.
var (
	DefaultErrorObjects   = []string{"NSError"}              //nolint:gochecknoglobals
	DefaultRequiredFields = []string{"Code", "Cause", "Fix"} //nolint:gochecknoglobals
)

// CheckErrorCoverage finds every `Name: &Type{...}` entry in content, for the
// error types in errorObjects, and reports the entries whose body lacks a
// non-empty `Field: "..."` line for any of requiredFields.
func CheckErrorCoverage(content []byte, errorObjects, requiredFields []string) ErrorCoverageResult {
	if len(errorObjects) == 0 {
		errorObjects = DefaultErrorObjects
	}

	if len(requiredFields) == 0 {
		requiredFields = DefaultRequiredFields
	}

	quoted := make([]string, len(errorObjects))
	for i, name := range errorObjects {
		quoted[i] = regexp.QuoteMeta(name)
	}

	block := regexp.MustCompile(`(?s)(\w+):\s*&(?:` + strings.Join(quoted, "|") + `)\{([^}]+)\}`)

	fields := make([]*regexp.Regexp, len(requiredFields))
	for i, field := range requiredFields {
		fields[i] = regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(field) + `:\s*"([^"]*)"`)
	}

	var result ErrorCoverageResult

	for _, m := range block.FindAllSubmatch(content, -1) {
		result.Checked++

		var missing []string

		for i, field := range requiredFields {
			fm := fields[i].FindSubmatch(m[2])
			if fm == nil || len(bytes.TrimSpace(fm[1])) == 0 {
				missing = append(missing, field)
			}
		}

		if len(missing) > 0 {
			result.Violations = append(result.Violations, ErrorCoverageViolation{Name: string(m[1]), Missing: missing})
		}
	}

	return result
}

// ValidateErrorCoverage runs CheckErrorCoverage on the file whose path ends in
// file (a path relative to the walked root) and reports each violation as
// "<name>: missing [<fields>]".
func ValidateErrorCoverage(file string, errorObjects, requiredFields []string) ValidatorFunc {
	want := "/" + strings.TrimPrefix(filepath.ToSlash(filepath.Clean(file)), "/")

	return func(path string, content []byte) []ValidatorIssue {
		if !strings.HasSuffix("/"+filepath.ToSlash(filepath.Clean(path)), want) {
			return nil
		}

		result := CheckErrorCoverage(content, errorObjects, requiredFields)
		issues := make([]ValidatorIssue, 0, len(result.Violations))

		for _, v := range result.Violations {
			issues = append(issues, ValidatorIssue{
				Severity: "error",
				File:     file,
				Message:  fmt.Sprintf("%s: missing [%s]", v.Name, strings.Join(v.Missing, ", ")),
				Fixed:    false,
			})
		}

		return issues
	}
}

// ServerLocOptions configures the line-ceiling check.
type ServerLocOptions struct {
	Directory     string // relative to the root
	ExcludeSuffix string // default "_test.go"
	Extension     string // default "go", with or without the dot
	MaxLines      int    // default 500
}

func (o ServerLocOptions) withDefaults() ServerLocOptions {
	if o.MaxLines <= 0 {
		o.MaxLines = 500
	}

	if o.ExcludeSuffix == "" {
		o.ExcludeSuffix = "_test.go"
	}

	if o.Extension == "" {
		o.Extension = "go"
	}

	o.Extension = "." + strings.TrimPrefix(o.Extension, ".")

	return o
}

// ServerLocViolation is a file over the line ceiling.
type ServerLocViolation struct {
	Path  string
	Lines int
}

// countLines counts lines as the TypeScript validator does:
// content.split("\n").length, so a final newline adds one.
func countLines(content []byte) int {
	return bytes.Count(content, []byte("\n")) + 1
}

// CheckServerLoc walks root/Directory and reports every file with the
// extension, not ending in ExcludeSuffix, that has more than MaxLines lines.
// It returns the violations and the number of files checked.
func CheckServerLoc(root string, opts ServerLocOptions) ([]ServerLocViolation, int, error) {
	opts = opts.withDefaults()
	dir := filepath.Join(root, opts.Directory)

	var (
		violations []ServerLocViolation
		checked    int
	)

	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if entry.IsDir() || filepath.Ext(path) != opts.Extension || strings.HasSuffix(path, opts.ExcludeSuffix) {
			return nil
		}

		content, err := os.ReadFile(path) //nolint:gosec // G304: a path from walking the configured directory
		if err != nil {
			return err
		}

		checked++

		if lines := countLines(content); lines > opts.MaxLines {
			violations = append(violations, ServerLocViolation{Path: path, Lines: lines})
		}

		return nil
	})
	if err != nil {
		return nil, 0, fmt.Errorf("server-loc: %w", err)
	}

	return violations, checked, nil
}

// ValidateServerLoc is CheckServerLoc as a per-file validator: it reports
// "<n> lines (limit <max>)" for each matching file under the directory.
func ValidateServerLoc(opts ServerLocOptions) ValidatorFunc {
	opts = opts.withDefaults()
	dir := "/" + strings.Trim(filepath.ToSlash(filepath.Clean(opts.Directory)), "/") + "/"

	return func(path string, content []byte) []ValidatorIssue {
		slashed := "/" + strings.TrimPrefix(filepath.ToSlash(filepath.Clean(path)), "/")
		if !strings.Contains(slashed, dir) || filepath.Ext(path) != opts.Extension || strings.HasSuffix(path, opts.ExcludeSuffix) {
			return nil
		}

		lines := countLines(content)
		if lines <= opts.MaxLines {
			return nil
		}

		return []ValidatorIssue{{
			Severity: "error",
			File:     path,
			Message:  fmt.Sprintf("%d lines (limit %d)", lines, opts.MaxLines),
			Fixed:    false,
		}}
	}
}

var (
	// ErrMissingOption is returned when a validator's required option is unset.
	ErrMissingOption = errors.New("missing option")
	// ErrInvalidOption is returned when a validator option has the wrong type.
	ErrInvalidOption = errors.New("invalid option")
)

// stringList reads an option that is a list of strings.
func stringList(name string, raw any) ([]string, error) {
	if raw == nil {
		return nil, nil
	}

	switch list := raw.(type) {
	case []string:
		return list, nil
	case []any:
		out := make([]string, 0, len(list))

		for _, item := range list {
			s, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("%w: %s must be a list of strings, got %T", ErrInvalidOption, name, item)
			}

			out = append(out, s)
		}

		return out, nil
	default:
		return nil, fmt.Errorf("%w: %s must be a list of strings, got %T", ErrInvalidOption, name, raw)
	}
}

// ParseErrorCoverageOptions builds ValidateErrorCoverage from its step
// options: file (required), errorObjects and requiredFields.
func ParseErrorCoverageOptions(opts map[string]any) (ValidatorFunc, error) {
	file, _ := opts["file"].(string)
	if file == "" {
		return nil, fmt.Errorf("%w: validate-error-coverage requires a `file` parameter", ErrMissingOption)
	}

	errorObjects, err := stringList("errorObjects", opts["errorObjects"])
	if err != nil {
		return nil, err
	}

	requiredFields, err := stringList("requiredFields", opts["requiredFields"])
	if err != nil {
		return nil, err
	}

	return ValidateErrorCoverage(file, errorObjects, requiredFields), nil
}

// ParseServerLocOptions builds ValidateServerLoc from its step options:
// directory (required), maxLines, excludeSuffix and extension.
func ParseServerLocOptions(opts map[string]any) (ValidatorFunc, error) {
	directory, _ := opts["directory"].(string)
	if directory == "" {
		return nil, fmt.Errorf("%w: validate-server-loc requires a `directory` parameter", ErrMissingOption)
	}

	parsed := ServerLocOptions{Directory: directory} //nolint:exhaustruct
	parsed.ExcludeSuffix, _ = opts["excludeSuffix"].(string)
	parsed.Extension, _ = opts["extension"].(string)

	switch maxLines := opts["maxLines"].(type) {
	case nil:
	case int:
		parsed.MaxLines = maxLines
	case float64:
		parsed.MaxLines = int(maxLines)
	default:
		return nil, fmt.Errorf("%w: maxLines must be a number, got %T", ErrInvalidOption, maxLines)
	}

	return ValidateServerLoc(parsed), nil
}
