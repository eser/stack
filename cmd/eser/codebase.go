// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/codebasefx"
	"golang.org/x/term"
)

// The release commands of `eser codebase` (M3-T8). They tag and push only
// when the owner runs them: every one that changes a remote asks first, or
// takes --yes.

func (e *env) releaseEnv() *codebasefx.ReleaseEnv {
	return &codebasefx.ReleaseEnv{Root: e.cwd} //nolint:exhaustruct
}

func (e *env) prompter() *clifx.Prompter {
	accessible := true
	if file, ok := e.stdin.(*os.File); ok && term.IsTerminal(int(file.Fd())) { //nolint:gosec // G115: a file descriptor fits an int
		accessible = false
	}

	return &clifx.Prompter{In: e.stdin, Out: e.stdout, Env: os.Environ(), Accessible: accessible} //nolint:exhaustruct
}

// confirm asks a yes or no question unless yes is set.
func confirm(c *clifx.Context, e *env, yes bool, question string) error {
	if yes {
		return nil
	}

	ok, err := e.prompter().Confirm(c, &clifx.ConfirmOptions{Title: question}) //nolint:exhaustruct
	if err != nil {
		return fmt.Errorf("confirm: %w", err)
	}

	if !ok {
		return &clifx.ExitError{Code: clifx.ExitFailure, Err: codebasefx.ErrUnconfirmed}
	}

	return nil
}

// printEdits shows what a dry run would write: each file, and the lines it
// would add and remove.
func printEdits(w io.Writer, edits []codebasefx.FileEdit) {
	for _, edit := range edits {
		_, _ = fmt.Fprintf(w, "~ %s\n", edit.Path)

		before := strings.Split(string(edit.Before), "\n")
		after := strings.Split(string(edit.After), "\n")

		removed, added := lineDiff(before, after)
		for _, line := range removed {
			_, _ = fmt.Fprintf(w, "  - %s\n", line)
		}

		for _, line := range added {
			_, _ = fmt.Fprintf(w, "  + %s\n", line)
		}
	}
}

// lineDiff returns the lines only in a and only in b, around their common
// prefix and suffix.
func lineDiff(a, b []string) ([]string, []string) {
	start := 0
	for start < len(a) && start < len(b) && a[start] == b[start] {
		start++
	}

	endA, endB := len(a), len(b)
	for endA > start && endB > start && a[endA-1] == b[endB-1] {
		endA--
		endB--
	}

	return a[start:endA], b[start:endB]
}

func codebaseCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:    "codebase",
		Aliases: []string{"cb"},
		Short:   "Git hooks, validators, release and version commands",
		Subcommands: append([]*clifx.Command{
			hooksInstallCommand(e),
			hooksUninstallCommand(e),
			hooksStatusCommand(e),
			releaseCommand(e),
			rereleaseCommand(e),
			unreleaseCommand(e),
			versionsCommand(e),
			changelogCommand(e),
			ghCommand(e),
		}, validatorCommands(e)...),
	}
}

func releaseCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "release",
		Short: "Bump the version, write the changelog, commit, push, and push the tag",
		Long: "Bumps every package to the next patch, minor or major version (same keeps it), adds the " +
			"changelog section, commits, pushes the commit, then pushes the v<version> tag that starts the " +
			"release pipeline. --dry-run shows the edits and changes nothing.",
		Args: "<patch|minor|major|same>",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("dry-run", false, "show the edits and change nothing")
			fs.Bool("yes", false, "do not ask, and release with unpushed commits")
		},
		Run: func(c *clifx.Context) error {
			if len(c.Args) != 1 {
				return clifx.Usagef("give one release type: patch, minor, major or same")
			}

			env := e.releaseEnv()

			plan, err := codebasefx.PlanRelease(c, env, c.Args[0], c.Bool("yes"))
			if err != nil {
				return err //nolint:wrapcheck
			}

			_, _ = fmt.Fprintf(e.stdout, "Release %s (from %s), %d changelog entr%s\n",
				plan.Tag, plan.PreviousVersion, plan.EntryCount, map[bool]string{true: "y", false: "ies"}[plan.EntryCount == 1])

			if c.Bool("dry-run") {
				printEdits(e.stdout, plan.Edits)
				_, _ = fmt.Fprintf(e.stdout, "Would commit %q, push it, and push %s.\n", plan.CommitMessage, plan.Tag)

				return nil
			}

			if err := confirm(c, e, c.Bool("yes"), "Release "+plan.Tag+"? This pushes the commit and the tag."); err != nil {
				return err
			}

			if err := codebasefx.ExecuteRelease(c, env, plan); err != nil {
				return err //nolint:wrapcheck
			}

			_, _ = fmt.Fprintf(e.stdout, "Released %s: the tag push starts the pipeline.\n", plan.Tag)

			return nil
		},
	}
}

func rereleaseCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "rerelease",
		Short: "Delete the version's tag and push it again at HEAD",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("dry-run", false, "only check and name the tag")
			fs.Bool("yes", false, "do not ask")
		},
		Run: func(c *clifx.Context) error {
			if !c.Bool("dry-run") {
				version, _ := os.ReadFile(filepath.Join(e.cwd, "VERSION")) //nolint:gosec // G304: the workspace's VERSION file
				if err := confirm(c, e, c.Bool("yes"), "Delete and push v"+strings.TrimSpace(string(version))+" again?"); err != nil {
					return err
				}
			}

			tag, err := codebasefx.Rerelease(c, e.releaseEnv(), c.Bool("dry-run"))
			if err != nil {
				return err //nolint:wrapcheck
			}

			_, _ = fmt.Fprintf(e.stdout, "%s %s at HEAD.\n", map[bool]string{true: "Would push", false: "Pushed"}[c.Bool("dry-run")], tag)

			return nil
		},
	}
}

func unreleaseCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "unrelease",
		Short: "Delete the version's GitHub Release and tag; the commit stays",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("yes", false, "do not ask")
		},
		Run: func(c *clifx.Context) error {
			version, _ := os.ReadFile(filepath.Join(e.cwd, "VERSION")) //nolint:gosec // G304: the workspace's VERSION file
			if err := confirm(c, e, c.Bool("yes"), "Delete tag v"+strings.TrimSpace(string(version))+" (local and remote) and its GitHub Release?"); err != nil {
				return err
			}

			tag, released, err := codebasefx.Unrelease(c, e.releaseEnv(), true)
			if err != nil {
				return err //nolint:wrapcheck
			}

			note := "and its GitHub Release"
			if !released {
				note = "(no GitHub Release was deleted)"
			}

			_, _ = fmt.Fprintf(e.stdout, "Deleted %s %s.\n", tag, note)

			return nil
		},
	}
}

func versionsCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:    "versions",
		Aliases: []string{"version-bump"},
		Short:   "Show the package versions, or sync or bump them",
		Args:    "[sync|patch|minor|major|<version>]",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("dry-run", false, "show the edits and change nothing")
		},
		Run: func(c *clifx.Context) error {
			command, explicit := codebasefx.VersionCommandSync, ""
			show := len(c.Args) == 0

			if !show {
				switch c.Args[0] {
				case "sync", "patch", "minor", "major":
					command = codebasefx.VersionCommand(c.Args[0])
				default:
					command, explicit = codebasefx.VersionCommandExplicit, strings.TrimPrefix(c.Args[0], "v")
				}
			}

			plan, err := codebasefx.PlanVersions(e.cwd, command, explicit)
			if err != nil {
				return err //nolint:wrapcheck
			}

			return c.Output(plan, func(w io.Writer) error {
				for _, update := range plan.Updates {
					switch {
					case show:
						_, _ = fmt.Fprintf(w, "%-40s %s\n", update.Name, update.From)
					case update.Changed:
						_, _ = fmt.Fprintf(w, "%-40s %s -> %s\n", update.Name, update.From, update.To)
					}
				}

				if show {
					return nil
				}

				if c.Bool("dry-run") {
					printEdits(w, plan.Edits)

					return nil
				}

				return codebasefx.ApplyEdits(e.cwd, plan.Edits) //nolint:wrapcheck
			})
		},
	}
}

func changelogCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "changelog-gen",
		Short: "Add the changelog section for the commits since the last tag",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("dry-run", false, "show the section and change nothing")
		},
		Run: func(c *clifx.Context) error {
			result, err := codebasefx.GenerateChangelog(c, codebasefx.GenerateChangelogOptions{Root: e.cwd, DryRun: true}) //nolint:exhaustruct
			if err != nil {
				return err //nolint:wrapcheck
			}

			section := codebasefx.FormatChangelogSection(result.Content)
			if c.Bool("dry-run") {
				_, _ = fmt.Fprintln(e.stdout, section)

				return nil
			}

			path := filepath.Join(e.cwd, "CHANGELOG.md")

			existing, err := os.ReadFile(path) //nolint:gosec // G304: the workspace's changelog
			if errors.Is(err, os.ErrNotExist) {
				existing = []byte("# Changelog\n\nAll notable changes to this project will be documented here.\n")
			} else if err != nil {
				return fmt.Errorf("read CHANGELOG.md: %w", err)
			}

			updated := codebasefx.InsertIntoChangelog(string(existing), section, result.Version)
			if bytes.Equal([]byte(updated), existing) {
				_, _ = fmt.Fprintln(e.stdout, "CHANGELOG.md is up to date.")

				return nil
			}

			if err := os.WriteFile(path, []byte(updated), 0o644); err != nil { //nolint:gosec // G306: a repository file
				return fmt.Errorf("write CHANGELOG.md: %w", err)
			}

			_, _ = fmt.Fprintf(e.stdout, "Added %d entries to CHANGELOG.md for v%s\n", result.EntryCount, result.Version)

			return nil
		},
	}
}

func ghCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "gh",
		Short: "GitHub release notes, release tag and contributors",
		Subcommands: []*clifx.Command{
			{
				Name:  "release-tag",
				Short: "Create and push the v<VERSION> tag",
				Flags: func(fs *flag.FlagSet) {
					fs.Bool("dry-run", false, "only name the tag")
					fs.Bool("yes", false, "do not ask")
				},
				Run: func(c *clifx.Context) error {
					if !c.Bool("dry-run") {
						if err := confirm(c, e, c.Bool("yes"), "Create and push the release tag?"); err != nil {
							return err
						}
					}

					tag, err := codebasefx.PushReleaseTag(c, e.releaseEnv(), c.Bool("dry-run"))
					if err != nil {
						return err //nolint:wrapcheck
					}

					_, _ = fmt.Fprintf(e.stdout, "%s %s.\n", map[bool]string{true: "Would push", false: "Pushed"}[c.Bool("dry-run")], tag)

					return nil
				},
			},
			{
				Name:  "release-notes",
				Short: "Copy a version's CHANGELOG.md section to its GitHub Release",
				Flags: func(fs *flag.FlagSet) {
					fs.String("repo", "eser/stack", "the GitHub repository")
					fs.String("tag", "", "the release tag (default: the newest changelog section)")
					fs.Bool("create", false, "create the release when it does not exist")
					fs.String("title", "eserstack {tag}", "the title of a created release")
				},
				Run: func(c *clifx.Context) error {
					tag, action, err := codebasefx.SyncReleaseNotes(c, e.releaseEnv(), c.String("repo"), c.String("tag"), c.Bool("create"), c.String("title"))
					if err != nil {
						return err //nolint:wrapcheck
					}

					_, _ = fmt.Fprintf(e.stdout, "%s: %s\n", tag, action)

					return nil
				},
			},
			{
				Name:  "contributors",
				Short: "Update the contributor table in README.md",
				Flags: func(fs *flag.FlagSet) {
					fs.Int("columns", 8, "avatars per row")
					fs.String("readme", "README.md", "the README to update")
					fs.Bool("commit", false, "commit and push the change")
				},
				Run: func(c *clifx.Context) error {
					columns := 8
					if f := c.Flags.Lookup("columns"); f != nil {
						_, _ = fmt.Sscan(f.Value.String(), &columns)
					}

					readme := c.String("readme")
					if !filepath.IsAbs(readme) {
						readme = filepath.Join(e.cwd, readme)
					}

					count, changed, err := codebasefx.UpdateContributors(c, e.releaseEnv(), readme, columns, c.Bool("commit"))
					if err != nil {
						return err //nolint:wrapcheck
					}

					_, _ = fmt.Fprintf(e.stdout, "%d contributors; README %s.\n", count, map[bool]string{true: "updated", false: "unchanged"}[changed])

					return nil
				},
			},
		},
	}
}
