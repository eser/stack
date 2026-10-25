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

// changelogSamples are sections with the shapes a markdown formatter rewrites.
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
		"\n- **cli:** add a very long feature description that keeps going and going well past the eighty column limit of the formatter\n",
		"\n- **docs:** link to [the guide](https://example.com/a/very/long/path/that/does/not/fit/on/one/line/at/all) and more words after it\n",
		"_stars_ and _underscores_",
		"- **a,b:** keep **bold** and `*code*` as they are",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("formatted section should contain %q:\n%s", want, got)
		}
	}

	if lines, want := strings.Count(got, "\n"), strings.Count(changelogSamples[0], "\n"); lines != want {
		t.Errorf("formatted section has %d lines, want %d: list items stay on one line:\n%s", lines, want, got)
	}
}

// TestFormatChangelogSectionMatchesOxfmt checks the formatter against oxfmt
// itself, which the TypeScript release and the format gate run on
// CHANGELOG.md, with the repository's .oxfmtrc.json.
func TestFormatChangelogSectionMatchesOxfmt(t *testing.T) {
	t.Parallel()

	repo, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}

	oxfmt := filepath.Join(repo, "node_modules", ".bin", "oxfmt")
	if _, err := os.Stat(oxfmt); err != nil {
		t.Skip("oxfmt is not installed; run pnpm install for the formatter comparison")
	}

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed; oxfmt needs it")
	}

	for i, section := range changelogSamples {
		dir := t.TempDir()
		path := filepath.Join(dir, "CHANGELOG.md")
		document := "# Changelog\n\n" + section + "\n"

		if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
			t.Fatal(err)
		}

		cmd := exec.Command(oxfmt, "--config", filepath.Join(repo, ".oxfmtrc.json"), path) //nolint:gosec,noctx
		cmd.Dir = dir

		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("oxfmt: %v: %s", err, out)
		}

		formatted, err := os.ReadFile(path) //nolint:gosec // the test's own file
		if err != nil {
			t.Fatal(err)
		}

		if got := "# Changelog\n\n" + codebasefx.FormatChangelogSection(section) + "\n"; got != string(formatted) {
			t.Errorf("sample %d:\n--- oxfmt\n%s\n--- Go\n%s", i, formatted, got)
		}
	}
}
