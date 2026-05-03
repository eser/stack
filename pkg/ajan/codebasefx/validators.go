// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"bytes"
	"encoding/json"
	"fmt"
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

// secretPatterns are compiled regexes for common credential leaks.
var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),                                              // AWS access key
	regexp.MustCompile(`-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`),          // PEM private key
	regexp.MustCompile(`(?i)(password|secret|api_key|token)\s*[=:]\s*["']?[^\s"']{8,}`), // generic assignment
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

	var issues []ValidatorIssue
	text := string(content)
	lines := strings.Split(text, "\n")

	for _, pat := range secretPatterns {
		matches := pat.FindAllStringIndex(text, -1)

		for _, match := range matches {
			// Find which line this match is on
			lineNum := 1 + strings.Count(text[:match[0]], "\n")
			snippet := strings.TrimSpace(lines[lineNum-1])

			if len(snippet) > 60 {
				snippet = snippet[:60] + "..."
			}

			issues = append(issues, ValidatorIssue{
				Severity: "error",
				File:     path,
				Line:     lineNum,
				Message:  "possible secret detected: " + snippet,
			})
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
	if strings.Contains(path, "/docs/") ||
		strings.Contains(path, "/etc/templates/") ||
		strings.HasSuffix(path, "manifest.gen.ts") {
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

// ValidateFilenames returns a ValidatorFunc that enforces filename conventions.
// rules maps directory substrings to "kebab-case" or "snake_case"; nil uses the default.
// globalExcludes is the list of path patterns to skip; nil uses the built-in defaults.
func ValidateFilenames(rules []FilenameRule, globalExcludes []string) ValidatorFunc {
	excludes := globalExcludes
	if len(excludes) == 0 {
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

// ---------------------------------------------------------------------------
// ValidateRuntimeJSAPIs
// ---------------------------------------------------------------------------

type runtimeAPIPattern struct {
	pattern     *regexp.Regexp
	replacement string
}

// denoAPIPatterns mirrors the DENO_PATTERNS list in validate-runtime-js-apis.ts.
var denoAPIPatterns = []runtimeAPIPattern{
	{regexp.MustCompile(`\bDeno\.cwd\(\)`), "runtime.process.cwd()"},
	{regexp.MustCompile(`\bDeno\.env\.get\b`), "runtime.env.get()"},
	{regexp.MustCompile(`\bDeno\.env\.set\b`), "runtime.env.set()"},
	{regexp.MustCompile(`\bDeno\.env\.delete\b`), "runtime.env.delete()"},
	{regexp.MustCompile(`\bDeno\.env\.has\b`), "runtime.env.has()"},
	{regexp.MustCompile(`\bDeno\.env\.toObject\b`), "runtime.env.toObject()"},
	{regexp.MustCompile(`\bDeno\.readTextFile\b`), "runtime.fs.readTextFile()"},
	{regexp.MustCompile(`\bDeno\.readFile\b`), "runtime.fs.readFile()"},
	{regexp.MustCompile(`\bDeno\.writeTextFile\b`), "runtime.fs.writeTextFile()"},
	{regexp.MustCompile(`\bDeno\.writeFile\b`), "runtime.fs.writeFile()"},
	{regexp.MustCompile(`\bDeno\.mkdir\b`), "runtime.fs.mkdir()"},
	{regexp.MustCompile(`\bDeno\.remove\b`), "runtime.fs.remove()"},
	{regexp.MustCompile(`\bDeno\.stat\b`), "runtime.fs.stat()"},
	{regexp.MustCompile(`\bDeno\.lstat\b`), "runtime.fs.lstat()"},
	{regexp.MustCompile(`\bDeno\.readDir\b`), "runtime.fs.readDir()"},
	{regexp.MustCompile(`\bDeno\.copyFile\b`), "runtime.fs.copyFile()"},
	{regexp.MustCompile(`\bDeno\.rename\b`), "runtime.fs.rename()"},
	{regexp.MustCompile(`\bDeno\.open\b`), "runtime.fs (or @eserstack/streams)"},
	{regexp.MustCompile(`\bDeno\.exit\b`), "runtime.process.exit()"},
	{regexp.MustCompile(`\bnew Deno\.Command\b`), "runtime.exec.spawn() (or @eserstack/shell/exec)"},
	{regexp.MustCompile(`\bDeno\.args\b`), "runtime.process.args"},
}

// isInLineComment returns true when the match at matchIdx is inside a // comment.
func isInLineComment(line string, matchIdx int) bool {
	before := line[:matchIdx]
	return strings.Contains(before, "//")
}

// isInJSString returns true when matchIdx falls inside a JS string/template literal.
// This is a best-effort single-pass check that handles ' " ` delimiters.
func isInJSString(line string, matchIdx int) bool {
	var inSingle, inDouble, inTemplate bool
	for i := 0; i < matchIdx; i++ {
		prev := ""
		if i > 0 {
			prev = line[i-1 : i]
		}
		if prev == "\\" {
			continue
		}
		ch := line[i : i+1]
		switch {
		case ch == "'" && !inDouble && !inTemplate:
			inSingle = !inSingle
		case ch == "\"" && !inSingle && !inTemplate:
			inDouble = !inDouble
		case ch == "`" && !inSingle && !inDouble:
			inTemplate = !inTemplate
		}
	}
	return inSingle || inDouble || inTemplate
}

// ValidateRuntimeJSAPIs detects direct usage of Deno-specific APIs in JS/TS source files.
func ValidateRuntimeJSAPIs(path string, content []byte) []ValidatorIssue {
	if !utf8.Valid(content) {
		return nil // skip binary files
	}

	var issues []ValidatorIssue
	lines := strings.Split(string(content), "\n")

	for i, line := range lines {
		for _, p := range denoAPIPatterns {
			loc := p.pattern.FindStringIndex(line)
			if loc == nil {
				continue
			}
			if isInLineComment(line, loc[0]) {
				continue
			}
			if isInJSString(line, loc[0]) {
				continue
			}

			match := line[loc[0]:loc[1]]
			issues = append(issues, ValidatorIssue{
				Severity: "error",
				File:     path,
				Line:     i + 1,
				Message: fmt.Sprintf(
					"direct Deno API usage: %s — use @eserstack/standards/cross-runtime (%s)",
					match, p.replacement,
				),
			})
		}
	}

	return issues
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
func RunValidators(files []FileEntry, validators []ValidatorFunc) []ValidatorResult {
	results := make([]ValidatorResult, len(validators))
	for i, v := range validators {
		_ = v
		results[i] = ValidatorResult{Passed: true}
	}

	for _, f := range files {
		// ReadFile follows symlinks; broken symlinks produce nil content.
		// We do NOT skip on error so that validators like ValidateSymlinks
		// can be called for every file in the list.
		content, _ := os.ReadFile(f.Path) //nolint:gosec

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

// min returns the smaller of two ints.
func min(a, b int) int {
	if a < b {
		return a
	}

	return b
}
