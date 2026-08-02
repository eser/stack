// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// --- ValidateCommitMsg ---

func TestValidateCommitMsg(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		message string
		opts    codebasefx.CommitMsgOptions
		valid   bool
	}{
		{"valid feat", "feat: add login page", codebasefx.CommitMsgOptions{}, true},
		{"valid fix with scope", "fix(auth): handle token expiry", codebasefx.CommitMsgOptions{}, true},
		{"valid breaking", "feat!: remove legacy API", codebasefx.CommitMsgOptions{}, true},
		{"valid scoped breaking", "refactor(core)!: rename package", codebasefx.CommitMsgOptions{}, true},
		{"empty message", "", codebasefx.CommitMsgOptions{}, false},
		{"no colon", "feat add stuff", codebasefx.CommitMsgOptions{}, false},
		{"unknown type", "hax: inject db", codebasefx.CommitMsgOptions{}, false},
		{"force scope missing", "feat: no scope", codebasefx.CommitMsgOptions{ForceScope: true}, false},
		{"force scope present", "feat(ui): with scope", codebasefx.CommitMsgOptions{ForceScope: true}, true},
		{"multiple scopes denied", "feat(a,b): stuff", codebasefx.CommitMsgOptions{AllowMultipleScopes: false}, false},
		{"multiple scopes allowed", "feat(a,b): stuff", codebasefx.CommitMsgOptions{AllowMultipleScopes: true}, true},
		{"asterisk denied", "*", codebasefx.CommitMsgOptions{AllowAsterisk: false}, false},
		{"asterisk allowed", "*", codebasefx.CommitMsgOptions{AllowAsterisk: true}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := codebasefx.ValidateCommitMsg(tt.message, tt.opts)

			if result.Valid != tt.valid {
				t.Errorf("ValidateCommitMsg(%q) valid=%v want=%v, issues=%v",
					tt.message, result.Valid, tt.valid, result.Issues)
			}
		})
	}
}

// --- ParseConventionalCommit ---

func TestParseConventionalCommit(t *testing.T) {
	t.Parallel()

	tests := []struct {
		subject      string
		wantType     string
		wantScope    string
		wantBreaking bool
		wantMsg      string
		wantOk       bool
	}{
		{"feat: add dashboard", "feat", "", false, "add dashboard", true},
		{"fix(auth): handle 401", "fix", "auth", false, "handle 401", true},
		{"feat!: drop Go 1.20", "feat", "", true, "drop Go 1.20", true},
		{"chore(deps)!: upgrade deps", "chore", "deps", true, "upgrade deps", true},
		{"not conventional", "", "", false, "", false},
		{"Merge branch 'main'", "", "", false, "", false},
	}

	for _, tt := range tests {
		t.Run(tt.subject, func(t *testing.T) {
			t.Parallel()
			cc, ok := codebasefx.ParseConventionalCommit(tt.subject, "abc1234")

			if ok != tt.wantOk {
				t.Fatalf("ParseConventionalCommit(%q) ok=%v want=%v", tt.subject, ok, tt.wantOk)
			}

			if !ok {
				return
			}

			if cc.Type != tt.wantType {
				t.Errorf("Type=%q want=%q", cc.Type, tt.wantType)
			}

			if cc.Scope != tt.wantScope {
				t.Errorf("Scope=%q want=%q", cc.Scope, tt.wantScope)
			}

			if cc.Breaking != tt.wantBreaking {
				t.Errorf("Breaking=%v want=%v", cc.Breaking, tt.wantBreaking)
			}

			if cc.Message != tt.wantMsg {
				t.Errorf("Message=%q want=%q", cc.Message, tt.wantMsg)
			}
		})
	}
}

// --- StripTakeSuffix ---

func TestStripTakeSuffix(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  string
	}{
		{"fix: login bug (take II)", "fix: login bug"},
		{"feat: add cache (take 2)", "feat: add cache"},
		{"chore: clean up", "chore: clean up"},
		{"fix: bug (take III)", "fix: bug"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			t.Parallel()
			got := codebasefx.StripTakeSuffix(tt.input)

			if got != tt.want {
				t.Errorf("StripTakeSuffix(%q)=%q want=%q", tt.input, got, tt.want)
			}
		})
	}
}

// --- DeduplicateCommits ---

func TestDeduplicateCommits(t *testing.T) {
	t.Parallel()

	input := []codebasefx.ConventionalCommit{
		{Type: "fix", Message: "login bug"},
		{Type: "fix", Message: "login bug"},            // exact duplicate
		{Type: "feat", Message: "add cache (take II)"}, // after strip == "add cache"
		{Type: "feat", Message: "add cache"},           // duplicate after strip
		{Type: "fix", Message: "other bug"},
	}

	got := codebasefx.DeduplicateCommits(input)

	if len(got) != 3 {
		t.Errorf("DeduplicateCommits: got %d entries, want 3; entries: %v", len(got), got)
	}
}

// --- BumpVersion ---

func TestBumpVersion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		current  string
		cmd      codebasefx.VersionCommand
		explicit string
		want     string
		wantErr  bool
	}{
		{"v1.2.3", codebasefx.VersionCommandPatch, "", "v1.2.4", false},
		{"v1.2.3", codebasefx.VersionCommandMinor, "", "v1.3.0", false},
		{"v1.2.3", codebasefx.VersionCommandMajor, "", "v2.0.0", false},
		{"v1.2.3", codebasefx.VersionCommandSync, "", "v1.2.3", false},
		{"v1.2.3", codebasefx.VersionCommandExplicit, "v3.0.0", "v3.0.0", false},
		{"v1.2.3", codebasefx.VersionCommandExplicit, "3.0.0", "v3.0.0", false}, // no v prefix
		{"1.2.3", codebasefx.VersionCommandPatch, "", "v1.2.4", false},          // no v prefix input
		{"bad", codebasefx.VersionCommandPatch, "", "", true},
		{"v1.2.3", codebasefx.VersionCommandExplicit, "bad", "", true},
	}

	for _, tt := range tests {
		t.Run(string(tt.cmd)+"_"+tt.current, func(t *testing.T) {
			t.Parallel()
			got, err := codebasefx.BumpVersion(tt.current, tt.cmd, tt.explicit)

			if (err != nil) != tt.wantErr {
				t.Fatalf("BumpVersion err=%v wantErr=%v", err, tt.wantErr)
			}

			if !tt.wantErr && got != tt.want {
				t.Errorf("BumpVersion=%q want=%q", got, tt.want)
			}
		})
	}
}

// --- CompareVersions ---

func TestCompareVersions(t *testing.T) {
	t.Parallel()

	if codebasefx.CompareVersions("v1.2.3", "v1.2.4") >= 0 {
		t.Error("v1.2.3 should be less than v1.2.4")
	}

	if codebasefx.CompareVersions("v2.0.0", "v1.9.9") <= 0 {
		t.Error("v2.0.0 should be greater than v1.9.9")
	}

	if codebasefx.CompareVersions("v1.2.3", "v1.2.3") != 0 {
		t.Error("v1.2.3 should equal v1.2.3")
	}
}

// --- file validators ---

func TestValidateEOF(t *testing.T) {
	t.Parallel()

	issues := codebasefx.ValidateEOF("f.go", []byte("hello\n"))
	if len(issues) != 0 {
		t.Errorf("expected no issues, got %v", issues)
	}

	issues = codebasefx.ValidateEOF("f.go", []byte("hello"))
	if len(issues) != 1 {
		t.Errorf("expected 1 issue for missing newline, got %d", len(issues))
	}

	issues = codebasefx.ValidateEOF("f.go", []byte("hello\n\n"))
	if len(issues) != 1 {
		t.Errorf("expected 1 issue for extra newline, got %d", len(issues))
	}
}

func TestValidateBOM(t *testing.T) {
	t.Parallel()

	issues := codebasefx.ValidateBOM("f.ts", []byte{0xEF, 0xBB, 0xBF, 'h', 'i'})
	if len(issues) != 1 {
		t.Errorf("expected 1 BOM issue, got %d", len(issues))
	}

	issues = codebasefx.ValidateBOM("f.ts", []byte("hello\n"))
	if len(issues) != 0 {
		t.Errorf("expected no issues, got %v", issues)
	}
}

func TestValidateMergeConflicts(t *testing.T) {
	t.Parallel()

	content := "line1\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\nline2\n"
	issues := codebasefx.ValidateMergeConflicts("f.go", []byte(content))

	if len(issues) < 2 {
		t.Errorf("expected >=2 merge conflict issues, got %d", len(issues))
	}
}

func TestValidateTrailingWhitespace(t *testing.T) {
	t.Parallel()

	issues := codebasefx.ValidateTrailingWhitespace("f.go", []byte("ok\ntrailing   \nclean\n"))
	if len(issues) != 1 {
		t.Errorf("expected 1 trailing whitespace issue, got %d", len(issues))
	}
}

func TestValidateLineEndings(t *testing.T) {
	t.Parallel()

	mixed := "unix\n" + "windows\r\n" + "unix2\n"
	issues := codebasefx.ValidateLineEndings("f.txt", []byte(mixed))

	if len(issues) != 1 {
		t.Errorf("expected 1 mixed line endings issue, got %d", len(issues))
	}

	issues = codebasefx.ValidateLineEndings("f.txt", []byte("a\nb\nc\n"))
	if len(issues) != 0 {
		t.Errorf("expected no issues for pure LF, got %v", issues)
	}
}

func TestValidateSecrets(t *testing.T) {
	t.Parallel()

	awsKey := "AKIAIOSFODNN7EXAMPLE" //nolint:gosec
	content := "config = '" + awsKey + "'\n"
	issues := codebasefx.ValidateSecrets("config.json", []byte(content))

	if len(issues) == 0 {
		t.Error("expected secret detection issue for AWS key")
	}

	clean := "name = 'my-service'\n"
	issues = codebasefx.ValidateSecrets("config.json", []byte(clean))

	if len(issues) != 0 {
		t.Errorf("expected no issues for clean content, got %v", issues)
	}
}

// --- InsertIntoChangelog ---

func TestInsertIntoChangelog(t *testing.T) {
	t.Parallel()

	existing := "# Changelog\n\n## [1.0.0] - 2025-01-01\n\n### Added\n- old feature\n"
	newSection := "## [1.1.0] - 2025-06-01\n\n### Added\n- new feature\n"

	result := codebasefx.InsertIntoChangelog(existing, newSection, "1.1.0")

	if !strings.Contains(result, "## [1.1.0]") {
		t.Error("new section not found in result")
	}

	if !strings.Contains(result, "## [1.0.0]") {
		t.Error("old section was removed unexpectedly")
	}

	// New section should appear before old
	newIdx := strings.Index(result, "## [1.1.0]")
	oldIdx := strings.Index(result, "## [1.0.0]")

	if newIdx > oldIdx {
		t.Error("new section should appear before old section")
	}
}

// --- GroupBySection ---

func TestGroupBySection(t *testing.T) {
	t.Parallel()

	commits := []codebasefx.ConventionalCommit{
		{Type: "feat", Message: "add login"},
		{Type: "fix", Message: "fix crash"},
		{Type: "chore", Message: "update deps"},
		{Type: "feat", Message: "remove old API", Breaking: true},
	}

	grouped := codebasefx.GroupBySection(commits)

	if len(grouped[codebasefx.SectionAdded]) != 1 {
		t.Errorf("Added: got %d want 1", len(grouped[codebasefx.SectionAdded]))
	}

	if len(grouped[codebasefx.SectionFixed]) != 1 {
		t.Errorf("Fixed: got %d want 1", len(grouped[codebasefx.SectionFixed]))
	}

	if len(grouped[codebasefx.SectionChanged]) != 1 {
		t.Errorf("Changed: got %d want 1", len(grouped[codebasefx.SectionChanged]))
	}

	if len(grouped[codebasefx.SectionRemoved]) != 1 {
		t.Errorf("Removed (breaking): got %d want 1", len(grouped[codebasefx.SectionRemoved]))
	}
}
