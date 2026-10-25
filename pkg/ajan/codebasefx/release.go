// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/eser/stack/pkg/ajan/processfx"
)

// The Go release commands (M3-T8), ports of pkg/@eserstack/codebase
// release.ts, release-tag.ts and release-notes.ts. Pushing the v<version>
// tag is what starts the release pipeline, so every command is defined by
// what it does to that tag; the commands push and tag only when the owner
// runs them.

// ReleaseStagedPaths are the pathspecs a release commit stages: the files
// that carry the version. pkg/*/deno.json is absent on purpose: those are
// generated and gitignored, and `git add` fails on a pathspec that matches
// no tracked file. In a git pathspec `*` spans `/`, so pkg/*/package.json
// reaches the scoped packages.
var ReleaseStagedPaths = []string{"VERSION", "CHANGELOG.md", "pkg/*/package.json", "package.json"} //nolint:gochecknoglobals

var (
	ErrDirtyTree          = errors.New("working tree is dirty")
	ErrUnpushedCommits    = errors.New("there are unpushed commits")
	ErrInvalidVersionFile = errors.New("invalid or missing version in VERSION file")
	ErrUnconfirmed        = errors.New("not confirmed")
	errReleaseType        = errors.New("release type must be patch, minor, major or same")
	semverCorePattern     = regexp.MustCompile(`^\d+\.\d+\.\d+$`) //nolint:gochecknoglobals
)

// defaultChangelog is the CHANGELOG.md a release starts when there is none.
const defaultChangelog = "# Changelog\n\nAll notable changes to this project will be documented here.\n"

// ReleaseEnv is what the release commands run against.
type ReleaseEnv struct {
	Root   string
	Remote string // "origin" when empty
	// GH runs the GitHub CLI; nil runs `gh` from PATH.
	GH func(ctx context.Context, args ...string) (string, error)
}

func (e *ReleaseEnv) remote() string {
	if e.Remote == "" {
		return "origin"
	}

	return e.Remote
}

func (e *ReleaseEnv) gh(ctx context.Context, args ...string) (string, error) {
	if e.GH != nil {
		return e.GH(ctx, args...)
	}

	cmd := exec.CommandContext(ctx, "gh", args...) //nolint:gosec // G204: fixed gh subcommands
	processfx.HardenCommand(cmd)
	cmd.Dir = e.Root

	var stdout, stderr bytes.Buffer

	cmd.Stdout, cmd.Stderr = &stdout, &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("gh %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}

	return stdout.String(), nil
}

// unpushedCommits lists the commits HEAD has that its upstream lacks; none
// when the branch has no upstream, as `git log @{u}..HEAD` then fails.
func unpushedCommits(ctx context.Context, dir string) []string {
	out, err := runGit(ctx, dir, "log", "@{u}..HEAD", "--oneline")
	if err != nil || out == "" {
		return nil
	}

	return strings.Split(out, "\n")
}

func readVersionFile(root string) (string, error) {
	data, err := os.ReadFile(filepath.Join(root, "VERSION")) //nolint:gosec // G304: the workspace's VERSION file
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrInvalidVersionFile, err)
	}

	version := strings.TrimSpace(string(data))
	if !semverCorePattern.MatchString(version) {
		return "", fmt.Errorf("%w: %q", ErrInvalidVersionFile, version)
	}

	return version, nil
}

// ReleasePlan is what `release` would change and run.
type ReleasePlan struct {
	PreviousVersion string
	Version         string
	Tag             string
	Edits           []FileEdit // VERSION, the package configs and CHANGELOG.md
	CommitMessage   string
	EntryCount      int
}

// PlanRelease checks the tree and computes a release of type patch, minor,
// major or same: the version edits, the changelog section (formatted as deno
// fmt formats it), the commit message and the tag. Nothing is written.
func PlanRelease(ctx context.Context, env *ReleaseEnv, releaseType string, allowUnpushed bool) (*ReleasePlan, error) {
	clean, err := IsCleanWorkTree(ctx, env.Root)
	if err != nil {
		return nil, err
	}

	if !clean {
		return nil, fmt.Errorf("%w: commit or stash changes first", ErrDirtyTree)
	}

	if unpushed := unpushedCommits(ctx, env.Root); len(unpushed) > 0 && !allowUnpushed {
		return nil, fmt.Errorf("%w: you have %d unpushed commit(s):\n%s\n\npush first, or re-run with --yes to continue anyway",
			ErrUnpushedCommits, len(unpushed), strings.Join(unpushed, "\n"))
	}

	previous := "0.0.0"
	if data, err := os.ReadFile(filepath.Join(env.Root, "VERSION")); err == nil { //nolint:gosec // G304: the workspace's VERSION file
		previous = strings.TrimSpace(string(data))
	}

	plan := &ReleasePlan{PreviousVersion: previous, Version: previous} //nolint:exhaustruct

	switch releaseType {
	case "same":
	case "patch", "minor", "major":
		versions, err := PlanVersions(env.Root, VersionCommand(releaseType), "")
		if err != nil {
			return nil, err
		}

		plan.Version = versions.Target
		plan.Edits = versions.Edits
	default:
		return nil, fmt.Errorf("%w, got %q", errReleaseType, releaseType)
	}

	plan.Tag = "v" + plan.Version
	plan.CommitMessage = "chore(codebase): release " + plan.Tag

	edit, entries, err := planChangelog(ctx, env.Root, plan.Version)
	if err != nil {
		return nil, err
	}

	plan.EntryCount = entries
	if edit != nil {
		plan.Edits = append(plan.Edits, *edit)
	}

	return plan, nil
}

// planChangelog computes the CHANGELOG.md with the version's section.
func planChangelog(ctx context.Context, root, version string) (*FileEdit, int, error) {
	generated, err := GenerateChangelog(ctx, GenerateChangelogOptions{Root: root, Version: version, DryRun: true})
	if err != nil {
		return nil, 0, err
	}

	before, err := os.ReadFile(filepath.Join(root, "CHANGELOG.md")) //nolint:gosec // G304: the workspace's changelog
	existing := string(before)

	if errors.Is(err, os.ErrNotExist) {
		before, existing = nil, defaultChangelog
	} else if err != nil {
		return nil, 0, fmt.Errorf("read CHANGELOG.md: %w", err)
	}

	after := InsertIntoChangelog(existing, FormatChangelogSection(generated.Content), generated.Version)
	if before != nil && after == string(before) {
		return nil, generated.EntryCount, nil
	}

	return &FileEdit{Path: "CHANGELOG.md", Before: before, After: []byte(after)}, generated.EntryCount, nil
}

// ExecuteRelease writes a plan, commits the staged paths, pushes the commit,
// then creates and pushes the tag. The commit is pushed before the tag: CI
// starts on the tag, and a tag pushed first would point at history the
// remote does not have. Each push failure names the command that resumes.
func ExecuteRelease(ctx context.Context, env *ReleaseEnv, plan *ReleasePlan) error {
	if err := ApplyEdits(env.Root, plan.Edits); err != nil {
		return err
	}

	for _, path := range ReleaseStagedPaths {
		if _, err := runGit(ctx, env.Root, "add", "--", path); err != nil {
			return fmt.Errorf("git add %s failed: the pathspec matches no tracked file; check whether it is gitignored or the layout moved: %w", path, err)
		}
	}

	if _, err := runGit(ctx, env.Root, "commit", "-m", plan.CommitMessage); err != nil {
		return fmt.Errorf("release commit: %w", err)
	}

	if _, err := runGit(ctx, env.Root, "push", env.remote(), "HEAD"); err != nil {
		return fmt.Errorf("the release commit was created but the push failed; fix the push, then run: git push %s HEAD && eser codebase gh release-tag: %w",
			env.remote(), err)
	}

	if _, err := PushReleaseTag(ctx, env, false); err != nil {
		return fmt.Errorf("the commit was pushed but the tag push failed; run \"eser codebase rerelease\" to create and push %s: %w", plan.Tag, err)
	}

	return nil
}

// PushReleaseTag creates the annotated tag v<VERSION> ("Release v<VERSION>")
// at HEAD and pushes it. A dry run only reads VERSION.
func PushReleaseTag(ctx context.Context, env *ReleaseEnv, dryRun bool) (string, error) {
	version, err := readVersionFile(env.Root)
	if err != nil {
		return "", err
	}

	tag := "v" + version
	if dryRun {
		return tag, nil
	}

	if err := CreateTag(ctx, env.Root, tag, "Release "+tag); err != nil {
		return tag, err
	}

	return tag, PushTag(ctx, env.Root, env.remote(), tag)
}

// deleteTagEverywhere deletes a tag locally and on the remote, best effort.
func deleteTagEverywhere(ctx context.Context, env *ReleaseEnv, tag string) {
	_, _ = runGit(ctx, env.Root, "tag", "-d", tag)
	_, _ = runGit(ctx, env.Root, "push", env.remote(), ":refs/tags/"+tag)
}

// Rerelease deletes the current version's tag and pushes it again at HEAD,
// which runs the pipeline again for a version already committed. It needs a
// clean tree with nothing unpushed and adds no commit.
func Rerelease(ctx context.Context, env *ReleaseEnv, dryRun bool) (string, error) {
	clean, err := IsCleanWorkTree(ctx, env.Root)
	if err != nil {
		return "", err
	}

	if !clean {
		return "", fmt.Errorf("%w: commit and push first", ErrDirtyTree)
	}

	if unpushed := unpushedCommits(ctx, env.Root); len(unpushed) > 0 {
		return "", fmt.Errorf("%w: push first, then rerelease:\n%s", ErrUnpushedCommits, strings.Join(unpushed, "\n"))
	}

	version, err := readVersionFile(env.Root)
	if err != nil {
		return "", err
	}

	tag := "v" + version
	if dryRun {
		return tag, nil
	}

	deleteTagEverywhere(ctx, env, tag)

	if _, err := PushReleaseTag(ctx, env, false); err != nil {
		return tag, fmt.Errorf("%s was deleted but could not be recreated; the version now has no tag. Run \"eser codebase gh release-tag\" to push it: %w", tag, err)
	}

	return tag, nil
}

// Unrelease deletes the GitHub Release of the current version's tag, then
// the tag itself, locally and on the remote. The release is deleted first,
// so a failed tag deletion never strands a Release without its tag. The
// version-bump commit stays in history. It returns whether the GitHub
// Release was deleted.
func Unrelease(ctx context.Context, env *ReleaseEnv, confirmed bool) (string, bool, error) {
	version, err := readVersionFile(env.Root)
	if err != nil {
		return "", false, err
	}

	tag := "v" + version
	if !confirmed {
		return tag, false, fmt.Errorf("%w: this deletes tag %s (local and remote) and its GitHub Release", ErrUnconfirmed, tag)
	}

	_, ghErr := env.gh(ctx, "release", "delete", tag, "--yes")

	deleteTagEverywhere(ctx, env, tag)

	return tag, ghErr == nil, nil
}

// SyncReleaseNotes copies a version's CHANGELOG.md section to its GitHub
// Release: it edits an existing release, creates one when createIfMissing
// is set, and otherwise reports "skipped". tag "" takes the newest section.
func SyncReleaseNotes(ctx context.Context, env *ReleaseEnv, repo, tag string, createIfMissing bool, title string) (string, string, error) {
	data, err := os.ReadFile(filepath.Join(env.Root, "CHANGELOG.md")) //nolint:gosec // G304: the workspace's changelog
	if err != nil {
		return "", "", fmt.Errorf("read CHANGELOG.md: %w", err)
	}

	entries := ParseChangelogText(string(data))
	if len(entries) == 0 {
		return "", "", errors.New("no release headings found in CHANGELOG.md") //nolint:err113
	}

	target := entries[0].Tag
	if tag != "" {
		target = NormalizeTag(tag)
	}

	var entry *ChangelogEntry

	for i := range entries {
		if entries[i].Tag == target {
			entry = &entries[i]
		}
	}

	if entry == nil {
		return target, "", fmt.Errorf("no matching changelog section found for %s", target) //nolint:err113
	}

	notes, err := os.CreateTemp("", "eserstack-release-*.md")
	if err != nil {
		return target, "", fmt.Errorf("write the notes: %w", err)
	}
	defer func() { _ = os.Remove(notes.Name()) }()

	if _, err := notes.WriteString(entry.Notes); err != nil {
		return target, "", fmt.Errorf("write the notes: %w", err)
	}

	_ = notes.Close()

	if _, err := env.gh(ctx, "release", "view", target, "--repo", repo); err == nil {
		if _, err := env.gh(ctx, "release", "edit", target, "--repo", repo, "--notes-file", notes.Name()); err != nil {
			return target, "", fmt.Errorf("gh release edit %s failed: %w", target, err)
		}

		return target, "updated", nil
	}

	if !createIfMissing {
		return target, "skipped", nil
	}

	if title == "" {
		title = "eserstack {tag}"
	}

	if _, err := env.gh(ctx, "release", "create", target, "--repo", repo, "--title", strings.ReplaceAll(title, "{tag}", target), "--notes-file", notes.Name()); err != nil {
		return target, "", fmt.Errorf("gh release create %s failed: %w", target, err)
	}

	return target, "created", nil
}
