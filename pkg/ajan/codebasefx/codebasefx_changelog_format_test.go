// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Changelog format tests: heading shape, dedup matching, and version selection.

package codebasefx_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

// assertVersionHeading checks that the first line of section is exactly
// "## <version> - <YYYY-MM-DD>". before and after must bracket the moment the
// section was generated: a run straddling UTC midnight would otherwise fail on
// the clock rather than on the code.
func assertVersionHeading(t *testing.T, section, version string, before, after time.Time) {
	t.Helper()

	heading, _, _ := strings.Cut(section, "\n")

	for _, when := range []time.Time{before, after} {
		if heading == "## "+version+" - "+when.UTC().Format("2006-01-02") {
			return
		}
	}

	t.Errorf(
		"heading = %q, want %q",
		heading,
		"## "+version+" - "+before.UTC().Format("2006-01-02"),
	)
}

// countVersionHeadings counts "## " headings, which is how a section that was
// duplicated instead of replaced shows up. "### Added" does not count.
func countVersionHeadings(content string) int {
	count := 0

	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "## ") {
			count++
		}
	}

	return count
}

// addCommit stages everything under dir and commits it. The identity env vars
// mirror makeGitRepo so the commit does not depend on the developer's global
// git config.
func addCommit(t *testing.T, dir, subject string) {
	t.Helper()

	for _, args := range [][]string{{"add", "."}, {"commit", "-m", subject}} {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@example.com",
		)

		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
}

// ─── GenerateChangelogSection: heading format ─────────────────────────────────

func TestGenerateChangelogSection_HeadingFormat(t *testing.T) {
	t.Parallel()

	commits := []codebasefx.ConventionalCommit{
		{Type: "feat", Message: "add login"},
	}

	cases := []struct {
		name    string
		version string
	}{
		{"bare version", "1.1.0"},
		{"v-prefixed version", "v1.1.0"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			before := time.Now()
			section := codebasefx.GenerateChangelogSection(tc.version, commits)
			after := time.Now()

			// A v-prefixed input must still yield the bare heading: the
			// release-notes parser matches the heading against a `vX.Y.Z` tag
			// after stripping the prefix from the tag, not from the heading.
			assertVersionHeading(t, section, "1.1.0", before, after)

			if strings.Contains(section, "[") {
				t.Errorf("heading must not be bracketed, got:\n%s", section)
			}

			// `deno fmt` inserts a blank line after a heading; emitting it here
			// keeps the formatter a no-op on the generated CHANGELOG.md.
			if !strings.Contains(section, "### Added\n\n- add login") {
				t.Errorf("want blank line between '### Added' and its first bullet, got:\n%s", section)
			}
		})
	}
}

// ─── InsertIntoChangelog: dedup heading forms ─────────────────────────────────

func TestInsertIntoChangelog_DedupFormats(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		existing     string
		version      string
		newSection   string
		wantReplaced bool
		wantHeadings int
	}{
		{
			name:         "bare heading without date",
			existing:     "# Changelog\n\n## 1.1.0\n\n### Added\n\n- old entry\n",
			version:      "1.1.0",
			newSection:   "## 1.1.0 - 2026-06-01\n\n### Added\n\n- new entry\n",
			wantReplaced: true,
			wantHeadings: 1,
		},
		{
			name:         "bare heading with date",
			existing:     "# Changelog\n\n## 1.1.0 - 2020-01-01\n\n### Added\n\n- old entry\n",
			version:      "1.1.0",
			newSection:   "## 1.1.0 - 2026-06-01\n\n### Added\n\n- new entry\n",
			wantReplaced: true,
			wantHeadings: 1,
		},
		{
			name:         "legacy bracketed heading",
			existing:     "# Changelog\n\n## [1.1.0] - 2020-01-01\n\n### Added\n\n- old entry\n",
			version:      "1.1.0",
			newSection:   "## 1.1.0 - 2026-06-01\n\n### Added\n\n- new entry\n",
			wantReplaced: true,
			wantHeadings: 1,
		},
		{
			name:         "legacy bracketed v-prefixed heading",
			existing:     "# Changelog\n\n## [v1.1.0] - 2020-01-01\n\n### Added\n\n- old entry\n",
			version:      "1.1.0",
			newSection:   "## 1.1.0 - 2026-06-01\n\n### Added\n\n- new entry\n",
			wantReplaced: true,
			wantHeadings: 1,
		},
		{
			// 4.3.0 is a prefix of 4.3.01; matching on the prefix alone would
			// silently eat an unrelated release's section.
			name:         "longer version is not a prefix match",
			existing:     "# Changelog\n\n## 4.3.01 - 2020-01-01\n\n### Added\n\n- old entry\n",
			version:      "4.3.0",
			newSection:   "## 4.3.0 - 2026-06-01\n\n### Added\n\n- new entry\n",
			wantReplaced: false,
			wantHeadings: 2,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			result := codebasefx.InsertIntoChangelog(tc.existing, tc.newSection, tc.version)

			if !strings.Contains(result, "- new entry") {
				t.Errorf("new section missing from result:\n%s", result)
			}

			hasOld := strings.Contains(result, "- old entry")

			if tc.wantReplaced && hasOld {
				t.Errorf("expected %q section to be replaced, old body survived:\n%s", tc.version, result)
			}

			if !tc.wantReplaced && !hasOld {
				t.Errorf("expected %q section to be left alone, old body was dropped:\n%s", tc.version, result)
			}

			if got := countVersionHeadings(result); got != tc.wantHeadings {
				t.Errorf("version headings = %d, want %d, in:\n%s", got, tc.wantHeadings, result)
			}
		})
	}
}

// ─── GenerateChangelog: version selection ─────────────────────────────────────

func TestGenerateChangelog_VersionSelection(t *testing.T) {
	t.Parallel()

	// makeGitRepo tags "feat: initial commit" as v1.0.0; the range the
	// generator reads is v1.0.0..HEAD, so the entry has to come after the tag.
	dir := makeGitRepo(t)

	if err := os.WriteFile(filepath.Join(dir, "feature.txt"), []byte("x\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	addCommit(t, dir, "feat: add feature")

	cases := []struct {
		name        string
		version     string
		wantVersion string
	}{
		{"explicit version", "2.5.0", "2.5.0"},
		{"v-prefixed version is normalized", "v2.5.0", "2.5.0"},
		{"empty version falls back to next patch", "", "1.0.1"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			before := time.Now()

			result, err := codebasefx.GenerateChangelog(
				context.Background(),
				codebasefx.GenerateChangelogOptions{
					Root:    dir,
					Version: tc.version,
					DryRun:  true,
				},
			)
			if err != nil {
				t.Fatalf("GenerateChangelog: %v", err)
			}

			after := time.Now()

			if result.Version != tc.wantVersion {
				t.Errorf("result.Version = %q, want %q", result.Version, tc.wantVersion)
			}

			assertVersionHeading(t, result.Content, tc.wantVersion, before, after)

			// Proves the heading came with a real commit range behind it, not
			// an empty section that would make the heading check hollow.
			if !strings.Contains(result.Content, "- add feature") {
				t.Errorf("expected the post-tag feat commit in the section, got:\n%s", result.Content)
			}

			if !result.DryRun {
				t.Error("result.DryRun = false, want true")
			}

			if _, err := os.Stat(filepath.Join(dir, "CHANGELOG.md")); !os.IsNotExist(err) {
				t.Errorf("DryRun must not write CHANGELOG.md (stat err = %v)", err)
			}
		})
	}
}
