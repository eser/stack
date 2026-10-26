// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/BurntSushi/toml"
	"github.com/tailscale/hujson"
	"gopkg.in/yaml.v3"
)

// ValidatorFunc is a single-file validator. It returns a slice of issues (may be empty).
type ValidatorFunc func(path string, content []byte) []ValidatorIssue

// utf8BOM is the UTF-8 byte order mark.
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// mergeConflictMarkers are the three lines that bound a merge conflict.
var mergeConflictMarkers = [][]byte{
	[]byte("<<<<<<< "),
	[]byte(">>>>>>> "),
	[]byte("======= "),
	[]byte("=======\n"),
}

// secretPattern is one credential shape, named the way the issue reports it.
type secretPattern struct {
	name string
	rx   *regexp.Regexp
}

// secretPatterns mirror SECRET_PATTERNS in
// pkg/@eserstack/codebase/validate-secrets.ts, shape for shape: the Go and
// TypeScript validators must report the same findings on the same tree, or the
// gate (`eser codebase validate`, Go) and the fixer (`--fix`, TypeScript)
// disagree. The generic pattern requires a QUOTED value on purpose: an
// unquoted `token: something` is prose in half the documentation in this repo.
var secretPatterns = []secretPattern{
	{name: "AWS Access Key ID", rx: regexp.MustCompile(`AKIA[0-9A-Z]{16}`)},
	{
		name: "Private Key",
		rx:   regexp.MustCompile(`-----BEGIN\s{1,5}(RSA\s{1,5}|EC\s{1,5}|DSA\s{1,5}|OPENSSH\s{1,5})?PRIVATE KEY-----`),
	},
	{
		name: "Generic secret assignment",
		rx: regexp.MustCompile(
			`(?i)(?:secret|password|api_key|apikey|access_token|auth_token|private_key)\s{0,5}[=:]\s{0,5}["'][^"']{8,}["']`,
		),
	},
}

// secretKeywords are the literal fragments every pattern above needs, in
// lower case. A line (or a whole file) containing none of them cannot match,
// and skipping the regexes on that evidence is what makes this validator fast:
// Go's linear-time regexp engine pays a high constant per character for a
// case-insensitive alternation with an unbounded tail, while a byte scan for a
// handful of literals is nearly free.
var secretKeywords = [][]byte{
	[]byte("akia"), []byte("private key"), []byte("secret"), []byte("password"),
	[]byte("api_key"), []byte("apikey"), []byte("access_token"),
	[]byte("auth_token"), []byte("private_key"),
}

// lowerASCII returns a copy of src with ASCII letters lower-cased and every
// other byte untouched. Unlike bytes.ToLower it never changes the length, so
// an offset into the copy is the same offset into src — which is what lets
// the line loop below split the lowered copy and run the regexes on the
// original bytes at the same positions.
func lowerASCII(src []byte) []byte {
	dst := make([]byte, len(src))

	for i, c := range src {
		if 'A' <= c && c <= 'Z' {
			c += 'a' - 'A'
		}

		dst[i] = c
	}

	return dst
}

// hasSecretKeyword reports whether lower (already lower-cased) contains any
// keyword. bytes.Contains is the assembly-backed search from the standard
// library; nine of them over a file are far cheaper than one regexp pass.
func hasSecretKeyword(lower []byte) bool {
	for _, kw := range secretKeywords {
		if bytes.Contains(lower, kw) {
			return true
		}
	}

	return false
}

// ValidateEOF checks that a file ends with exactly one newline character.
func ValidateEOF(path string, content []byte) []ValidatorIssue {
	if len(content) == 0 {
		return nil
	}

	if content[len(content)-1] != '\n' {
		return []ValidatorIssue{{
			Severity: "error",
			File:     path,
			Message:  "file does not end with a newline",
		}}
	}

	// More than one trailing newline
	if len(content) >= 2 && content[len(content)-2] == '\n' {
		return []ValidatorIssue{{
			Severity: "warning",
			File:     path,
			Message:  "file ends with more than one newline",
		}}
	}

	return nil
}

// ValidateTrailingWhitespace reports lines with trailing spaces or tabs.
func ValidateTrailingWhitespace(path string, content []byte) []ValidatorIssue {
	if !utf8.Valid(content) {
		return nil // skip binary files
	}

	var issues []ValidatorIssue
	lineNum := 0

	for _, line := range bytes.Split(content, []byte("\n")) {
		lineNum++
		trimmed := bytes.TrimRight(line, " \t")

		if len(trimmed) < len(line) {
			issues = append(issues, ValidatorIssue{
				Severity: "error",
				File:     path,
				Line:     lineNum,
				Message:  "trailing whitespace",
			})
		}
	}

	return issues
}

// ValidateBOM checks for a UTF-8 byte order mark at the start of the file.
func ValidateBOM(path string, content []byte) []ValidatorIssue {
	if bytes.HasPrefix(content, utf8BOM) {
		return []ValidatorIssue{{
			Severity: "error",
			File:     path,
			Message:  "file starts with a UTF-8 BOM",
		}}
	}

	return nil
}

// ValidateMergeConflicts reports leftover merge conflict markers.
func ValidateMergeConflicts(path string, content []byte) []ValidatorIssue {
	var issues []ValidatorIssue
	lineNum := 0

	for _, line := range bytes.Split(content, []byte("\n")) {
		lineNum++

		for _, marker := range mergeConflictMarkers {
			if bytes.HasPrefix(line, marker) {
				issues = append(issues, ValidatorIssue{
					Severity: "error",
					File:     path,
					Line:     lineNum,
					Message:  "merge conflict marker: " + string(bytes.TrimSpace(line[:min(len(line), 20)])),
				})

				break
			}
		}
	}

	return issues
}

// ValidateLineEndings checks that line endings are consistent within the file.
// Mixed CRLF and LF in the same file is reported as an error.
func ValidateLineEndings(path string, content []byte) []ValidatorIssue {
	crlfCount := bytes.Count(content, []byte("\r\n"))
	lfCount := bytes.Count(content, []byte("\n")) - crlfCount

	if crlfCount > 0 && lfCount > 0 {
		return []ValidatorIssue{{
			Severity: "error",
			File:     path,
			Message:  "mixed line endings (CRLF and LF)",
		}}
	}

	return nil
}

// secretsSkipFile mirrors the TS SKIP_FILE_PATTERNS list exactly.
func secretsSkipFile(path string) bool {
	return strings.HasSuffix(path, ".lock") ||
		strings.HasSuffix(path, "package-lock.json") ||
		strings.Contains(path, ".test.") ||
		strings.HasSuffix(path, "_test.go") ||
		strings.HasSuffix(path, "_test.ts") ||
		strings.Contains(path, "testdata/") ||
		strings.HasSuffix(path, ".snap") ||
		strings.Contains(path, ".min.")
}

// ValidateSecrets scans content for common credential patterns.
func ValidateSecrets(path string, content []byte) []ValidatorIssue {
	if !utf8.Valid(content) {
		return nil
	}

	if secretsSkipFile(path) {
		return nil
	}

	// Whole-file gate first: most source files mention none of the keywords
	// and never reach the line loop. One lower-cased copy serves both the
	// file gate and every per-line check.
	lower := lowerASCII(content)
	if !hasSecretKeyword(lower) {
		return nil
	}

	var issues []ValidatorIssue

	// Line by line, with the line number coming from the loop. The previous
	// version ran every pattern over the whole file and then recomputed each
	// match's line with strings.Count over the prefix — a rescan from the start
	// of the file per finding.
	lineNum := 0

	for off := 0; off < len(content); {
		lineNum++

		end := len(content)
		next := end

		if nl := bytes.IndexByte(content[off:], '\n'); nl >= 0 {
			end = off + nl
			next = end + 1
		}

		line := content[off:end]
		lowerLine := lower[off:end]
		off = next

		if !hasSecretKeyword(lowerLine) {
			continue
		}

		for _, pat := range secretPatterns {
			if !pat.rx.Match(line) {
				continue
			}

			issues = append(issues, ValidatorIssue{
				Severity: "error",
				File:     path,
				Line:     lineNum,
				Message:  "potential " + pat.name + " detected",
			})

			break // one issue per line, like the TypeScript validator
		}
	}

	return issues
}

// ValidateLargeFile reports files that exceed the given byte size.
func ValidateLargeFile(maxBytes int64) ValidatorFunc {
	return func(path string, content []byte) []ValidatorIssue {
		size := int64(len(content))

		if size > maxBytes {
			return []ValidatorIssue{{
				Severity: "warning",
				File:     path,
				Message:  "file exceeds size limit",
			}}
		}

		return nil
	}
}

// ValidateJSON checks that a .json file contains valid JSON, or that a .jsonc
// file contains valid JSONC. Comments and trailing commas in .jsonc files are
// stripped via hujson before the final strict encoding/json parse.
func ValidateJSON(path string, content []byte) []ValidatorIssue {
	if !utf8.Valid(content) {
		return nil // skip binary files
	}

	parseInput := content

	if strings.HasSuffix(path, ".jsonc") {
		stripped, err := hujson.Standardize(bytes.Clone(content))
		if err != nil {
			return []ValidatorIssue{{
				Severity: "error",
				File:     path,
				Message:  "invalid JSONC: " + err.Error(),
			}}
		}

		parseInput = stripped
	}

	var v interface{}
	if err := json.Unmarshal(parseInput, &v); err != nil {
		return []ValidatorIssue{{
			Severity: "error",
			File:     path,
			Message:  "invalid JSON: " + err.Error(),
		}}
	}

	return nil
}

// ValidateYAML checks that the file contains valid YAML.
func ValidateYAML(path string, content []byte) []ValidatorIssue {
	if !utf8.Valid(content) {
		return nil // skip binary files
	}

	var v interface{}
	if err := yaml.Unmarshal(content, &v); err != nil {
		return []ValidatorIssue{{
			Severity: "error",
			File:     path,
			Message:  "invalid YAML: " + err.Error(),
		}}
	}

	return nil
}

// ValidateTOML checks that the file contains valid TOML.
func ValidateTOML(path string, content []byte) []ValidatorIssue {
	if !utf8.Valid(content) {
		return nil // skip binary files
	}

	var v interface{}
	if _, err := toml.Decode(string(content), &v); err != nil {
		return []ValidatorIssue{{
			Severity: "error",
			File:     path,
			Message:  "invalid TOML: " + err.Error(),
		}}
	}

	return nil
}

// licenseRx matches the expected copyright header line (year captured in group 1).
var licenseRx = regexp.MustCompile(
	`^// Copyright (\d{4})-present Eser Ozvataf and other contributors\. All rights reserved\. [0-9A-Za-z.-]+ license\.\n`,
)

const licenseBaseYear = "2023"

// ValidateLicenseHeader checks that JS/TS source files start with the project
// copyright header. Skips docs/, etc/templates/, and *.gen.ts files.
func ValidateLicenseHeader(path string, content []byte) []ValidatorIssue {
	if len(content) == 0 || !utf8.Valid(content) {
		return nil
	}

	// Skip generated / documentation paths.
	if licenseSkipped(path) {
		return nil
	}

	// Skip past a shebang line if present.
	check := content
	if bytes.HasPrefix(check, []byte("#!")) {
		if nl := bytes.IndexByte(check, '\n'); nl >= 0 {
			check = check[nl+1:]
		}
	}

	m := licenseRx.FindSubmatch(check)
	if m == nil {
		return []ValidatorIssue{{Severity: "error", File: path, Message: "missing copyright header"}}
	}

	if string(m[1]) != licenseBaseYear {
		return []ValidatorIssue{{Severity: "error", File: path, Message: "incorrect copyright year"}}
	}

	return nil
}

// ValidateCaseConflict returns a fresh per-run ValidatorFunc that detects
// files whose paths differ only by case (problematic on case-insensitive FSes).
// Call once per validation run — the returned closure owns its own seen map.
func ValidateCaseConflict() ValidatorFunc {
	seen := make(map[string]string) // lower-path → original path

	return func(path string, _ []byte) []ValidatorIssue {
		lower := strings.ToLower(path)

		if existing, ok := seen[lower]; ok {
			return []ValidatorIssue{{
				Severity: "error",
				File:     path,
				Message:  fmt.Sprintf(`case conflict with "%s"`, existing),
			}}
		}

		seen[lower] = path

		return nil
	}
}

// ValidateSymlinks returns a ValidatorFunc that flags broken symbolic links.
// It uses os.Lstat so it sees the link itself rather than following it.
// Content is intentionally ignored; broken links arrive with nil content
// because RunValidators' os.ReadFile cannot follow them.
func ValidateSymlinks() ValidatorFunc {
	return func(path string, _ []byte) []ValidatorIssue {
		info, err := os.Lstat(path)
		if err != nil || info.Mode()&os.ModeSymlink == 0 {
			return nil // not a symlink or unstatable
		}

		if _, err := os.Stat(path); err != nil {
			return []ValidatorIssue{{
				Severity: "error",
				File:     path,
				Message:  "broken symlink — target not found",
			}}
		}

		return nil
	}
}

// ValidateSubmodules returns a ValidatorFunc that fires only on .gitmodules
// files and reports each [submodule …] entry as a policy violation.
func ValidateSubmodules() ValidatorFunc {
	return func(path string, content []byte) []ValidatorIssue {
		if filepath.Base(path) != ".gitmodules" {
			return nil
		}

		count := bytes.Count(content, []byte("[submodule "))
		if count > 0 {
			return []ValidatorIssue{{
				Severity: "error",
				File:     path,
				Message:  fmt.Sprintf("found %d submodule(s) — submodules are not allowed", count),
			}}
		}

		return nil
	}
}

// ValidateShebangs is a no-op placeholder. Cross-platform exec-bit validation
// is not currently implemented; this validator always passes.
func ValidateShebangs(_ string, _ []byte) []ValidatorIssue {
	return nil
}

// ---------------------------------------------------------------------------
// ValidateFilenames
// ---------------------------------------------------------------------------

// windowsReservedNames is the set of filenames forbidden on Windows.
var windowsReservedNames = map[string]bool{
	"con": true, "prn": true, "aux": true, "nul": true,
	"com1": true, "com2": true, "com3": true, "com4": true,
	"com5": true, "com6": true, "com7": true, "com8": true, "com9": true,
	"lpt1": true, "lpt2": true, "lpt3": true, "lpt4": true,
	"lpt5": true, "lpt6": true, "lpt7": true, "lpt8": true, "lpt9": true,
}

// kebabCaseRx matches the kebab-case filename pattern (mirrors TS KEBAB_CASE).
var kebabCaseRx = regexp.MustCompile(`^[a-z0-9./\[\]@-]+$`)

// snakeCaseRx matches the snake_case filename pattern (mirrors TS SNAKE_CASE).
var snakeCaseRx = regexp.MustCompile(`^[a-z0-9_./\[\]@-]+$`)

// defaultFilenameExcludes mirrors the TS DEFAULT_EXCLUDES list.
var defaultFilenameExcludes = []string{
	".claude/", ".github/", ".git/",
	"CLAUDE.md", "AGENTS.md", "CHANGELOG.md",
	"Makefile", "Dockerfile", "LICENSE", "README.md", "VERSION",
}

// isFilenameExcluded checks whether path matches a glob-style exclude entry.
func isFilenameExcluded(path, pattern string) bool {
	if strings.Contains(pattern, "*") {
		// Simple glob: replace * with [^/]+ and test
		escaped := regexp.QuoteMeta(pattern)
		escaped = strings.ReplaceAll(escaped, `\*`, `[^/]+`)
		rx, err := regexp.Compile(escaped)
		if err != nil {
			return false
		}
		return rx.MatchString(path)
	}
	return strings.Contains(path, pattern) || strings.HasSuffix(path, pattern)
}

// defaultMaxKb is the large-file limit, in kilobytes, when no "maxKb" option
// is set.
const defaultMaxKb = 1024

// ParseMaxKb reads the large-file validator's "maxKb" option value: a whole
// number of kilobytes, zero or more, 1024 when nil. A value of another
// type is an error rather than a silent fallback to the default.
func ParseMaxKb(raw any) (int64, error) {
	var maxKb int64

	switch v := raw.(type) {
	case nil:
		return defaultMaxKb, nil
	case int:
		maxKb = int64(v)
	case int64:
		maxKb = v
	case float64:
		maxKb = int64(v)
		if float64(maxKb) != v {
			return 0, fmt.Errorf("maxKb option %v is not a whole number of kilobytes", v)
		}
	default:
		return 0, fmt.Errorf("maxKb option has type %T; expected a number of kilobytes", raw)
	}

	if maxKb < 0 {
		return 0, fmt.Errorf("maxKb option %d is negative; expected zero or more kilobytes", maxKb)
	}

	return maxKb, nil
}

// ErrInvalidFilenameRule is returned for filename rules that ValidateFilenames
// cannot apply as written.
var ErrInvalidFilenameRule = errors.New("invalid filename rule")

// ParseFilenameRules reads filename rules from an option value: a JSON string,
// or a list already decoded from JSON or YAML. A nil value means no rules. A
// value of another shape, a rule without a directory, or a convention other
// than "kebab-case" or "snake_case" is an error, so a typo fails when the
// validator is configured instead of silently falling back to kebab-case.
func ParseFilenameRules(raw any) ([]FilenameRule, error) {
	if raw == nil {
		return nil, nil
	}

	data, isString := raw.(string)
	if !isString {
		encoded, err := json.Marshal(raw)
		if err != nil {
			return nil, fmt.Errorf("%w: encode rules option: %w", ErrInvalidFilenameRule, err)
		}

		data = string(encoded)
	}

	var rules []FilenameRule
	if err := json.Unmarshal([]byte(data), &rules); err != nil {
		return nil, fmt.Errorf(
			"%w: parse rules option: %w; expected a list of {directory, convention, exclude}",
			ErrInvalidFilenameRule, err,
		)
	}

	for i, rule := range rules {
		if rule.Directory == "" {
			return nil, fmt.Errorf(
				"%w: rule %d has no directory; use a path substring such as \"pkg/\", or \"*\" for every path",
				ErrInvalidFilenameRule, i,
			)
		}

		if rule.Convention != "kebab-case" && rule.Convention != "snake_case" {
			return nil, fmt.Errorf(
				"%w: rule %d (%q) has convention %q; expected \"kebab-case\" or \"snake_case\"",
				ErrInvalidFilenameRule, i, rule.Directory, rule.Convention,
			)
		}
	}

	return rules, nil
}

// ValidateFilenames returns a ValidatorFunc that enforces filename conventions.
// rules maps directory substrings to "kebab-case" or "snake_case"; nil uses the default.
// globalExcludes is the list of path patterns to skip; nil uses the built-in
// defaults, and an empty list skips nothing.
func ValidateFilenames(rules []FilenameRule, globalExcludes []string) ValidatorFunc {
	excludes := globalExcludes
	if excludes == nil {
		excludes = defaultFilenameExcludes
	}

	return func(path string, _ []byte) []ValidatorIssue {
		// Skip globally excluded paths.
		for _, excl := range excludes {
			if isFilenameExcluded(path, excl) {
				return nil
			}
		}

		basename := filepath.Base(path)
		ext := filepath.Ext(basename)
		baseWithoutExt := strings.TrimSuffix(basename, ext)

		// Windows reserved names.
		if windowsReservedNames[strings.ToLower(baseWithoutExt)] {
			return []ValidatorIssue{{
				Severity: "error",
				File:     path,
				Message:  "Windows-reserved filename: " + basename,
			}}
		}

		// Apply the first matching rule.
		for _, rule := range rules {
			if rule.Directory != "*" && !strings.Contains(path, rule.Directory) {
				continue
			}
			// Per-rule excludes.
			excluded := false
			for _, excl := range rule.Exclude {
				if isFilenameExcluded(path, excl) {
					excluded = true
					break
				}
			}
			if excluded {
				return nil
			}

			pattern := kebabCaseRx
			if rule.Convention == "snake_case" {
				pattern = snakeCaseRx
			}
			if !pattern.MatchString(basename) {
				return []ValidatorIssue{{
					Severity: "error",
					File:     path,
					Message:  "filename must be " + rule.Convention,
				}}
			}
			return nil
		}

		// Default: kebab-case.
		if !kebabCaseRx.MatchString(basename) {
			return []ValidatorIssue{{
				Severity: "error",
				File:     path,
				Message:  "filename must be kebab-case",
			}}
		}

		return nil
	}
}

// BuiltinValidators returns the default set of language-agnostic validators.
func BuiltinValidators() []ValidatorFunc {
	return []ValidatorFunc{
		ValidateEOF,
		ValidateTrailingWhitespace,
		ValidateBOM,
		ValidateMergeConflicts,
		ValidateLineEndings,
		ValidateSecrets,
	}
}

// RunValidators runs a set of validators over a list of files, reading each
// file from disk once and passing the content to every validator.
//
// An entry without content still reaches every validator with nil content: a
// broken symlink (ValidateSymlinks reports it), a symlink to a directory, or a
// git submodule. Any other read failure (permissions, I/O) means the file was
// not validated, so each validator's result carries an error issue for it and
// fails.
func RunValidators(files []FileEntry, validators []ValidatorFunc) []ValidatorResult {
	results := make([]ValidatorResult, len(validators))
	for i := range validators {
		results[i] = ValidatorResult{Passed: true}
	}

	for _, f := range files {
		content, err := os.ReadFile(f.Path) //nolint:gosec // paths come from the caller's file walk
		if err != nil && !hasNoContent(f.Path, err) {
			for i := range validators {
				results[i].Passed = false
				results[i].Issues = append(results[i].Issues, ValidatorIssue{
					Severity: "error",
					File:     f.Path,
					Message:  fmt.Sprintf("read file: %v; the file was not validated", err),
				})
			}

			continue
		}

		for i, vf := range validators {
			issues := vf(f.Path, content)
			results[i].FilesChecked++
			results[i].Issues = append(results[i].Issues, issues...)

			if len(issues) > 0 {
				results[i].Passed = false
			}
		}
	}

	return results
}

// hasNoContent reports whether readErr means the entry has no content to read
// rather than a failed read: the path does not resolve (a broken symlink, or a
// file removed since the walk) or it resolves to a directory.
func hasNoContent(path string, readErr error) bool {
	if errors.Is(readErr, fs.ErrNotExist) {
		return true
	}

	info, err := os.Stat(path)

	return err == nil && info.IsDir()
}

// min returns the smaller of two ints.
func min(a, b int) int {
	if a < b {
		return a
	}

	return b
}
