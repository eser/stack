// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/codebasefx/validatortools"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// `eser workflows` runs the workflows of .eser/manifest.yml on the Go engine,
// pkg/ajan/workflowfx (M3-T7). The manifest's step names resolve to the
// built-in tools (shell and the file tools) and to the codebasefx validators
// under their validate-* names. Its flags and output lines match the
// TypeScript `workflows run` (pkg/@eserstack/workflows/run.ts).

// gitDiffTimeout bounds the `git diff` of --changed, so a held index lock or a
// credential prompt cannot stall the run.
const gitDiffTimeout = 30 * time.Second

var errNoManifest = errors.New("no .eser/manifest.yml found")

// newWorkflowRegistry is the registry every Go workflow run uses: the
// built-in tools and the manifest's validator tools.
func newWorkflowRegistry() *workflowfx.Registry {
	registry := workflowfx.NewDefaultRegistry()
	validatortools.RegisterManifestTools(registry)

	return registry
}

// resolveDir returns dir relative to the working directory, or dir itself
// when it is absolute.
func (e *env) resolveDir(dir string) string {
	if dir == "" {
		return e.cwd
	}

	if filepath.IsAbs(dir) {
		return dir
	}

	return filepath.Join(e.cwd, dir)
}

// loadWorkflows reads the manifest of dir.
func loadWorkflows(dir string) (*workflowfx.WorkflowsConfig, error) {
	config, err := workflowfx.LoadManifest(dir)
	if errors.Is(err, workflowfx.ErrManifestNotFound) {
		return nil, fmt.Errorf("%w in %s; run eser from the repository root or pass --config", errNoManifest, dir)
	}

	if err != nil {
		return nil, err //nolint:wrapcheck // a ManifestError names the file and path itself
	}

	return config, nil
}

func workflowsCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "workflows",
		Short: "Run and list the workflows of .eser/manifest.yml",
		Subcommands: []*clifx.Command{
			workflowsRunCommand(e),
			workflowsListCommand(e),
		},
	}
}

func workflowsRunCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "run",
		Short: "Run the workflows of an event, or one workflow",
		Long: "Runs every workflow whose `on` lists the event (-e), or the workflow with the id (-w), and " +
			"prints each step as it ends. Arguments after the flags reach the tools as _args, such as the " +
			"commit message file of the commitmsg event. Exits 1 when a step fails.",
		Args: "[args...]",
		Flags: func(fs *flag.FlagSet) {
			event := fs.String("event", "", "the event to run (precommit, commitmsg, prepush, preflight)")
			fs.StringVar(event, "e", "", "same as --event")
			workflow := fs.String("workflow", "", "the id of the workflow to run")
			fs.StringVar(workflow, "w", "", "same as --workflow")
			fs.Bool("fix", false, "apply fixes: fixCommand for shell steps, file fixes for validators")
			fs.Bool("dry-run", false, "never run a fixCommand and write no file")
			fs.String("only", "", "run only the steps with this tool or step name")
			fs.String("config", ".", "the directory that holds .eser/manifest.yml")
			verbose := fs.Bool("verbose", false, "print the issues of passing steps too")
			fs.BoolVar(verbose, "v", false, "same as --verbose")
			fs.Bool("changed", false, "validate only the files `git diff --name-only HEAD` lists")
		},
		Run: func(c *clifx.Context) error {
			if c.String("event") == "" && c.String("workflow") == "" {
				return clifx.Usagef("give an event with -e or a workflow id with -w")
			}

			return runWorkflows(c, e)
		},
	}
}

// runWorkflows runs the selected workflows and prints the results.
func runWorkflows(c *clifx.Context, e *env) error {
	root := e.resolveDir(c.String("config"))

	config, err := loadWorkflows(root)
	if err != nil {
		return err
	}

	opts := &workflowfx.RunOptions{ //nolint:exhaustruct
		Root:        root,
		Fix:         c.Bool("fix"),
		DryRun:      c.Bool("dry-run"),
		Only:        c.String("only"),
		Args:        append([]string{}, c.Args...),
		Event:       c.String("event"),
		OnMutations: writeMutations,
	}

	if c.Bool("changed") {
		opts.ChangedFiles = changedFiles(c, root, e.stderr)
	}

	if !c.JSON {
		opts.OnStepEnd = stepPrinter(e.stdout, c.Bool("verbose"))
	}

	registry := newWorkflowRegistry()

	var results []*workflowfx.WorkflowResult

	if event := c.String("event"); event != "" {
		results, err = workflowfx.RunByEvent(c, event, config.Workflows, registry, opts)
	} else {
		var result *workflowfx.WorkflowResult

		result, err = workflowfx.RunWorkflowWithConfig(c, c.String("workflow"), config, registry, opts)
		if result != nil {
			results = []*workflowfx.WorkflowResult{result}
		}
	}

	if err != nil {
		return err //nolint:wrapcheck // the engine's errors name the workflow and step
	}

	return reportWorkflows(c, results)
}

// stepPrinter prints each step as it ends; verbose adds the issues of
// passing steps.
func stepPrinter(w io.Writer, verbose bool) func(name string, result workflowfx.StepResult) {
	printStep := workflowfx.ProgressPrinter(w)

	return func(name string, result workflowfx.StepResult) {
		printStep(name, result)

		if !verbose || !result.Passed {
			return
		}

		for _, issue := range result.Issues {
			_, _ = fmt.Fprintf(w, "  ✗ %s\n", issue.Message)
		}
	}
}

// reportWorkflows prints the summary line, or the results as JSON, and
// returns an exit error when a step failed.
func reportWorkflows(c *clifx.Context, results []*workflowfx.WorkflowResult) error {
	passed := true
	failedSteps, issues := 0, 0

	for _, result := range results {
		passed = passed && result.Passed

		for _, step := range result.Steps {
			if !step.Passed {
				failedSteps++
				issues += len(step.Issues)
			}
		}
	}

	err := c.Output(results, func(w io.Writer) error {
		if passed {
			_, err := fmt.Fprintln(w, "\nAll checks passed!")

			return err //nolint:wrapcheck
		}

		_, err := fmt.Fprintf(w, "\n%d check(s) failed with %d issue(s)\n", failedSteps, issues)

		return err //nolint:wrapcheck
	})
	if err != nil {
		return err //nolint:wrapcheck
	}

	if !passed {
		return &clifx.ExitError{Code: clifx.ExitFailure, Err: nil}
	}

	return nil
}

// writeMutations writes each changed file, keeping its permissions.
func writeMutations(mutations []workflowfx.WorkflowFileMutation) error {
	for _, mutation := range mutations {
		if mutation.OldContent == mutation.NewContent {
			continue
		}

		mode := os.FileMode(0o644)
		if info, err := os.Stat(mutation.Path); err == nil {
			mode = info.Mode().Perm()
		}

		if err := os.WriteFile(mutation.Path, []byte(mutation.NewContent), mode); err != nil {
			return fmt.Errorf("write fixed file %s: %w", mutation.Path, err)
		}
	}

	return nil
}

// changedFiles lists the files git reports as changed against HEAD, relative
// to root; it warns and returns nil when git cannot run.
func changedFiles(ctx context.Context, root string, stderr io.Writer) []string {
	ctx, cancel := context.WithTimeout(ctx, gitDiffTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "diff", "--name-only", "HEAD")
	cmd.Dir = root

	out, err := cmd.Output()
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "Warning: could not run git, running without file filtering.")

		return nil
	}

	var files []string

	for line := range strings.SplitSeq(string(out), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			files = append(files, line)
		}
	}

	return files
}

func workflowsListCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "list",
		Short: "List the workflows of the manifest and the registered tools",
		Flags: func(fs *flag.FlagSet) {
			fs.String("config", ".", "the directory that holds .eser/manifest.yml")
		},
		Run: func(c *clifx.Context) error {
			config, err := loadWorkflows(e.resolveDir(c.String("config")))
			if err != nil {
				return err
			}

			registry := newWorkflowRegistry()

			return c.Output(map[string]any{"workflows": config.Workflows, "tools": registry.Names()}, func(w io.Writer) error {
				_, _ = fmt.Fprintln(w, "Workflows:")

				for _, wf := range config.Workflows {
					_, _ = fmt.Fprintf(w, "  %-20s %-25s %d steps\n", wf.ID, strings.Join(wf.On, ", "), len(wf.Steps))
				}

				names := registry.Names()
				_, _ = fmt.Fprintf(w, "\nRegistered tools (%d):\n", len(names))

				for _, name := range names {
					tool, _ := registry.Get(name)
					_, _ = fmt.Fprintf(w, "  %-28s %s\n", name, tool.Description())
				}

				return nil
			})
		},
	}
}
