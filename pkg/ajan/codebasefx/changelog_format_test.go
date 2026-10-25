// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// changelogSamples are sections with the shapes deno fmt rewrites.
var changelogSamples = []string{ //nolint:gochecknoglobals
	"## 4.5.3 - 2026-10-24\n\n### Added\n\n" +
		"- **cli:** add a very long feature description that keeps going and going well past the eighty column limit of the formatter\n" +
		"- **noskills:** support `noskills spec <name> next --answer=\"a b c\"` with spaces inside the code span that is long enough to wrap\n" +
		"- **docs:** link to [the guide](https://example.com/a/very/long/path/that/does/not/fit/on/one/line/at/all) and more words after it\n" +
		"- plain entry with snake_case_name and *stars* and _underscores_ and a trailing period.\n" +
		"- short one\n\n### Fixed\n\n" +
		"- **x:** aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee ffff `code span with several words inside it` tail\n" +
		"- **x:** a line that has exactly enough words to end near the limit of eighty col\n" +
		"- **x:** a line that has exactly enough words to end near the limit of eight c\n" +
		"- word followed by a very-long-hyphenated-word-that-is-long-enough-to-need-a-wrap-somewhere-near-the-end\n" +
		"- **a,b:** keep **bold** and `*code*` as they are",
	"## 4.5.4 - 2026-10-25\n\n_Maintenance release._",
}

func TestFormatChangelogSection(t *testing.T) {
	t.Parallel()

	got := codebasefx.FormatChangelogSection(changelogSamples[0])

	for _, want := range []string{
		"- **cli:** add a very long feature description that keeps going and going well\n  past the eighty column limit of the formatter\n",
		"- **docs:** link to\n  [the guide](https://example.com/a/very/long/path/that/does/not/fit/on/one/line/at/all)\n  and more words after it\n",
		"_stars_ and _underscores_",
		"- **a,b:** keep **bold** and `*code*` as they are",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("formatted section should contain %q:\n%s", want, got)
		}
	}

	for _, line := range strings.Split(got, "\n") {
		if len([]rune(line)) > 80 && !strings.Contains(line, "](") && !strings.Contains(line, "very-long-hyphenated") {
			t.Errorf("line over 80 columns: %q", line)
		}
	}
}

// TestFormatChangelogSectionMatchesDenoFmt checks the formatter against deno
// fmt itself, which the TypeScript release runs on CHANGELOG.md.
func TestFormatChangelogSectionMatchesDenoFmt(t *testing.T) {
	t.Parallel()

	deno, err := exec.LookPath("deno")
	if err != nil {
		t.Skip("deno is not installed")
	}

	for i, section := range changelogSamples {
		dir := t.TempDir()
		path := filepath.Join(dir, "CHANGELOG.md")
		document := "# Changelog\n\n" + section + "\n"

		if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
			t.Fatal(err)
		}

		if out, err := exec.Command(deno, "fmt", "--quiet", path).CombinedOutput(); err != nil { //nolint:gosec,noctx
			t.Fatalf("deno fmt: %v: %s", err, out)
		}

		formatted, err := os.ReadFile(path) //nolint:gosec // the test's own file
		if err != nil {
			t.Fatal(err)
		}

		if got := "# Changelog\n\n" + codebasefx.FormatChangelogSection(section) + "\n"; got != string(formatted) {
			t.Errorf("sample %d:\n--- deno fmt\n%s\n--- Go\n%s", i, formatted, got)
		}
	}
}
