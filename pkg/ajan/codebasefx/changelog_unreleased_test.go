// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

const (
	generatedSection = "## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n"

	migrationBody = "### Migration\n\nUpgrade with these steps.\n\n" +
		"- Run the new command:\n\n  ```bash\n  # Before\n  old-command\n  ## not a heading\n  ### not a subsection\n  ```\n"

	olderSection = "## 1.0.0 - 2026-01-01\n\n### Added\n\n- the first release (def5678)\n"
)

// insertCases are the layouts a release must produce. The same table runs
// against the TypeScript insertIntoChangelog in
// TestInsertIntoChangelogMatchesTypeScript.
var insertCases = []struct { //nolint:gochecknoglobals
	name     string
	existing string
	section  string
	version  string
	want     string
}{
	{
		name:     "moves the notes below the generated entries and keeps an empty Unreleased",
		existing: "# Changelog\n\nIntro.\n\n## Unreleased\n\n" + migrationBody + "\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\nIntro.\n\n## Unreleased\n\n" +
			"## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n" + migrationBody + "\n" + olderSection,
	},
	{
		name:     "accepts the bracketed heading and keeps it as written",
		existing: "# Changelog\n\n## [Unreleased]\n\n### Migration\n\n- a step\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## [Unreleased]\n\n" +
			"## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n### Migration\n\n- a step\n\n" + olderSection,
	},
	{
		name:     "merges a hand-written subsection into the generated one of the same name",
		existing: "# Changelog\n\n## Unreleased\n\n### Fixed\n\n- a fix by hand\n\n### Removed\n\n- the old flag\n\n### Migration\n\n- a step\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n" +
			"## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n- a fix by hand\n\n" +
			"### Removed\n\n- the old flag\n\n### Migration\n\n- a step\n\n" + olderSection,
	},
	{
		name:     "orders hand-written subsections with the generated ones",
		existing: "# Changelog\n\n## Unreleased\n\n### Migration\n\n- a step\n\n### Removed\n\n- the old flag\n\n### Added\n\n- a feature\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n" +
			"## 2.0.0 - 2026-11-07\n\n### Added\n\n- a feature\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n" +
			"### Removed\n\n- the old flag\n\n### Migration\n\n- a step\n\n" + olderSection,
	},
	{
		name:     "keeps prose written directly under Unreleased at the top of the section",
		existing: "# Changelog\n\n## Unreleased\n\nA note on the whole release.\n\n### Migration\n\n- a step\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n" +
			"## 2.0.0 - 2026-11-07\n\nA note on the whole release.\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n### Migration\n\n- a step\n\n" + olderSection,
	},
	{
		name:     "an empty Unreleased adds nothing",
		existing: "# Changelog\n\n## Unreleased\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want:     "# Changelog\n\n## Unreleased\n\n" + generatedSection + "\n" + olderSection,
	},
	{
		name:     "a subsection with no text under Unreleased is dropped",
		existing: "# Changelog\n\n## Unreleased\n\n### Migration\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want:     "# Changelog\n\n## Unreleased\n\n" + generatedSection + "\n" + olderSection,
	},
	{
		name:     "a missing Unreleased is not created",
		existing: "# Changelog\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want:     "# Changelog\n\n" + generatedSection + "\n" + olderSection,
	},
	{
		name:     "a changelog with no sections gets the new one after its intro",
		existing: "# Changelog\n\nIntro.\n",
		section:  generatedSection,
		version:  "2.0.0",
		want:     "# Changelog\n\nIntro.\n\n" + generatedSection,
	},
	{
		name:     "a re-run replaces the generated entries and keeps the moved notes",
		existing: "# Changelog\n\n## Unreleased\n\n## 2.0.0 - 2026-11-01\n\n### Fixed\n\n- **one**: stale entry (fed4321)\n- a fix by hand\n\n" + migrationBody + "\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n- a fix by hand\n\n" +
			migrationBody + "\n" + olderSection,
	},
	{
		name:     "a re-run adds notes written since the first run",
		existing: "# Changelog\n\n## Unreleased\n\n### Migration\n\n- a later step\n\n## 2.0.0 - 2026-11-01\n\n### Fixed\n\n- **one**: stale entry (fed4321)\n\n### Migration\n\n- a step\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n" +
			"## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n### Migration\n\n- a step\n- a later step\n\n" + olderSection,
	},
	{
		name:     "a re-run drops a wrapped generated entry of the older format",
		existing: "# Changelog\n\n## 2.0.0 - 2026-11-01\n\n### Fixed\n\n- **one**: stale entry that the older\n  formatter wrapped (fed4321)\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want:     "# Changelog\n\n" + generatedSection + "\n" + olderSection,
	},
	{
		name:     "a re-run keeps a hash-suffixed line of a hand-written subsection",
		existing: "# Changelog\n\n## 2.0.0 - 2026-11-01\n\n### Migration\n\n- reverts the change of (fed4321)\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n" +
			"### Migration\n\n- reverts the change of (fed4321)\n\n" + olderSection,
	},
	{
		name:     "a section released above Unreleased gets the stranded notes back",
		existing: "# Changelog\n\n## 2.0.0 - 2026-11-01\n\n### Fixed\n\n- **one**: stale entry (fed4321)\n\n## Unreleased\n\n### Migration\n\n- a step\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n" +
			"## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n### Migration\n\n- a step\n\n" + olderSection,
	},
	{
		name:     "headings inside a fence are text",
		existing: "# Changelog\n\n## Unreleased\n\n### Migration\n\n```markdown\n## Unreleased\n\n## 2.0.0\n\n### Fixed\n```\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n" +
			"## 2.0.0 - 2026-11-07\n\n### Fixed\n\n- **one**: repair the thing (abc1234)\n\n### Migration\n\n```markdown\n## Unreleased\n\n## 2.0.0\n\n### Fixed\n```\n\n" + olderSection,
	},
	{
		name:     "other second-level sections stay as they are",
		existing: "# Changelog\n\n## Unreleased\n\n## 1.5.0 - 2026-02-02\n\n- a fix (aaa1111)\n\n## Notes Released with 1.5.0\n\n### Migration\n\n- an old step\n\n" + olderSection,
		section:  generatedSection,
		version:  "2.0.0",
		want: "# Changelog\n\n## Unreleased\n\n" + generatedSection +
			"\n## 1.5.0 - 2026-02-02\n\n- a fix (aaa1111)\n\n## Notes Released with 1.5.0\n\n### Migration\n\n- an old step\n\n" + olderSection,
	},
}

func TestInsertIntoChangelogMovesUnreleased(t *testing.T) {
	t.Parallel()

	for _, tc := range insertCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := codebasefx.InsertIntoChangelog(tc.existing, tc.section, tc.version)
			if got != tc.want {
				t.Errorf("InsertIntoChangelog:\n--- got\n%s\n--- want\n%s", got, tc.want)
			}

			// A second run with the same section changes nothing, which is what
			// lets `release same` and changelog-gen report "up to date".
			if again := codebasefx.InsertIntoChangelog(got, tc.section, tc.version); again != got {
				t.Errorf("a re-run changed the file:\n--- first\n%s\n--- second\n%s", got, again)
			}
		})
	}
}

// TestInsertIntoChangelogMatchesTypeScript runs every layout through the
// exported TypeScript insertIntoChangelog, which keeps its own implementation.
func TestInsertIntoChangelogMatchesTypeScript(t *testing.T) {
	t.Parallel()

	node := nodeOrSkip(t)

	repo, err := filepath.Abs(repoRootFromCodebasefx)
	if err != nil {
		t.Fatal(err)
	}

	type input struct {
		Existing string `json:"existing"`
		Section  string `json:"section"`
		Version  string `json:"version"`
	}

	inputs := make([]input, 0, len(insertCases))
	for _, tc := range insertCases {
		inputs = append(inputs, input{Existing: tc.existing, Section: tc.section, Version: tc.version})
	}

	payload, err := json.Marshal(inputs)
	if err != nil {
		t.Fatal(err)
	}

	script := `import { insertIntoChangelog } from "./pkg/@eserstack/codebase/changelog-gen.ts";
import * as fs from "node:fs";
const inputs = JSON.parse(fs.readFileSync(0, "utf8"));
const outputs = inputs.map((i) => insertIntoChangelog(i.existing, i.section, i.version));
process.stdout.write(JSON.stringify(outputs));`

	cmd := exec.Command(node, "--input-type=module", "-e", script) //nolint:gosec,noctx
	cmd.Dir = repo
	cmd.Stdin = bytes.NewReader(payload)

	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("TypeScript insertIntoChangelog: %v", err)
	}

	var outputs []string
	if err := json.Unmarshal(out, &outputs); err != nil {
		t.Fatal(err)
	}

	for i, tc := range insertCases {
		if outputs[i] != tc.want {
			t.Errorf("%s:\n--- TypeScript\n%s\n--- Go\n%s", tc.name, outputs[i], tc.want)
		}
	}
}

// unreleasedRepo is changelogRepo with hand-written notes under Unreleased.
func unreleasedRepo(t *testing.T) string {
	t.Helper()

	root := changelogRepo(t)
	writeFiles(t, root, map[string]string{
		"CHANGELOG.md": "# Changelog\n\n## Unreleased\n\n" + migrationBody + "\n## 1.2.3 - 2026-01-01\n\n### Added\n\n- **one:** the first release\n",
	})
	git(t, root, "add", "-A")
	git(t, root, "commit", "-q", "-m", "docs: write the migration notes")

	return root
}

func plannedChangelog(t *testing.T, plan *codebasefx.ReleasePlan) string {
	t.Helper()

	for _, edit := range plan.Edits {
		if edit.Path == "CHANGELOG.md" {
			return string(edit.After)
		}
	}

	t.Fatal("the plan has no CHANGELOG.md edit")

	return ""
}

// assertReleasedNotes checks the notes moved out of Unreleased, into the
// section of version, and below its generated entries.
func assertReleasedNotes(t *testing.T, changelog, version string) {
	t.Helper()

	unreleased := strings.Index(changelog, "## Unreleased\n")
	section := strings.Index(changelog, "## "+version+" - ")
	entries := strings.Index(changelog, "### Fixed")
	migration := strings.Index(changelog, "### Migration")
	older := strings.Index(changelog, "## 1.2.3 - ")

	if unreleased < 0 || unreleased >= section || section >= entries || entries >= migration || migration >= older {
		t.Errorf("want Unreleased, the %s heading, the entries, the notes, the older section, in that order:\n%s", version, changelog)
	}

	if !strings.HasPrefix(changelog[unreleased:], "## Unreleased\n\n## "+version+" - ") {
		t.Errorf("Unreleased should be left empty:\n%s", changelog)
	}

	if got := strings.Count(changelog, "### Migration"); got != 1 {
		t.Errorf("the notes appear %d times, want once:\n%s", got, changelog)
	}
}

// TestPlanReleaseMovesUnreleased is the Go release command's path.
func TestPlanReleaseMovesUnreleased(t *testing.T) {
	t.Parallel()

	root := unreleasedRepo(t)
	before := readTree(t, root)

	plan, err := codebasefx.PlanRelease(context.Background(), &codebasefx.ReleaseEnv{Root: root}, "major", true) //nolint:exhaustruct
	if err != nil {
		t.Fatal(err)
	}

	assertReleasedNotes(t, plannedChangelog(t, plan), "2.0.0")

	// PlanRelease is what `release --dry-run` prints: planning writes nothing.
	after := readTree(t, root)
	if len(after) != len(before) {
		t.Errorf("planning changed the file list: %d files became %d", len(before), len(after))
	}

	for path, content := range before {
		if after[path] != content {
			t.Errorf("planning changed %s", path)
		}
	}
}

// TestGenerateChangelogMovesUnreleased is the bridge's path, which the
// TypeScript release takes.
func TestGenerateChangelogMovesUnreleased(t *testing.T) {
	t.Parallel()

	root := unreleasedRepo(t)
	path := filepath.Join(root, "CHANGELOG.md")

	preview, err := codebasefx.GenerateChangelog(context.Background(), codebasefx.GenerateChangelogOptions{Root: root, Version: "2.0.0", DryRun: true})
	if err != nil {
		t.Fatal(err)
	}

	if preview.Content == "" {
		t.Error("the dry run should return the generated section")
	}

	unchanged, err := os.ReadFile(path) //nolint:gosec // the test's own file
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(string(unchanged), "## Unreleased\n\n### Migration") || strings.Contains(string(unchanged), "## 2.0.0") {
		t.Errorf("a dry run must not write CHANGELOG.md:\n%s", unchanged)
	}

	if _, err := codebasefx.GenerateChangelog(context.Background(), codebasefx.GenerateChangelogOptions{Root: root, Version: "2.0.0", DryRun: false}); err != nil {
		t.Fatal(err)
	}

	written, err := os.ReadFile(path) //nolint:gosec // the test's own file
	if err != nil {
		t.Fatal(err)
	}

	assertReleasedNotes(t, string(written), "2.0.0")

	// The same version again, as `release same` does after a failed release.
	if _, err := codebasefx.GenerateChangelog(context.Background(), codebasefx.GenerateChangelogOptions{Root: root, Version: "2.0.0", DryRun: false}); err != nil {
		t.Fatal(err)
	}

	again, err := os.ReadFile(path) //nolint:gosec // the test's own file
	if err != nil {
		t.Fatal(err)
	}

	assertReleasedNotes(t, string(again), "2.0.0")

	if string(again) != string(written) {
		t.Errorf("the re-run changed the file:\n--- first\n%s\n--- second\n%s", written, again)
	}
}

// TestReleasedChangelogReachesTheReleaseNotes runs the script the release-notes
// job runs on what a release plans, so the two cannot drift apart.
func TestReleasedChangelogReachesTheReleaseNotes(t *testing.T) {
	t.Parallel()

	node := nodeOrSkip(t)

	repo, err := filepath.Abs(repoRootFromCodebasefx)
	if err != nil {
		t.Fatal(err)
	}

	root := unreleasedRepo(t)

	plan, err := codebasefx.PlanRelease(context.Background(), &codebasefx.ReleaseEnv{Root: root}, "major", true) //nolint:exhaustruct
	if err != nil {
		t.Fatal(err)
	}

	writeFiles(t, root, map[string]string{"CHANGELOG.md": plannedChangelog(t, plan)})

	outFile := filepath.Join(t.TempDir(), "notes.md")

	cmd := exec.Command(node, filepath.Join(repo, "etc/scripts/release-notes-from-changelog.ts"), "v2.0.0", outFile) //nolint:gosec,noctx
	cmd.Dir = root

	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("release-notes-from-changelog: %v: %s", err, out)
	}

	notes, err := os.ReadFile(outFile) //nolint:gosec // the test's own file
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{"## 2.0.0 - ", "### Fixed", "### Migration", "Upgrade with these steps.", "old-command"} {
		if !strings.Contains(string(notes), want) {
			t.Errorf("the release notes should contain %q:\n%s", want, notes)
		}
	}

	for _, unwanted := range []string{"## Unreleased", "## 1.2.3", "the first release"} {
		if strings.Contains(string(notes), unwanted) {
			t.Errorf("the release notes should not contain %q:\n%s", unwanted, notes)
		}
	}
}
