// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"errors"
	"flag"
	"maps"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// `eser codebase <validator>` runs one codebasefx validator under the name
// .eser/manifest.yml gives it (M3-T7), with the options of its manifest step.

// validatorTimeout is the deadline of a validator run from the command line.
const validatorTimeout = 5 * time.Minute

// validatorCommands returns a command for every validate-* tool of the
// workflow registry.
func validatorCommands(e *env) []*clifx.Command {
	registry := newWorkflowRegistry()

	var commands []*clifx.Command

	for _, name := range registry.Names() {
		if !strings.HasPrefix(name, "validate-") {
			continue
		}

		tool, _ := registry.Get(name)
		commands = append(commands, validatorCommand(e, name, tool.Description()))
	}

	return commands
}

func validatorCommand(e *env, name, description string) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  name,
		Short: description,
		Long: "Runs the " + name + " validator over the repository with the options of its step in " +
			".eser/manifest.yml, when the manifest has one. --fix rewrites the files the validator can fix " +
			"(validate-eof, validate-trailing-whitespace, validate-bom, validate-line-endings, " +
			"validate-licenses). Exits 1 when it finds an issue.",
		Args: "[args...]",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("fix", false, "fix the issues the validator can fix")
			fs.Bool("dry-run", false, "with --fix, report the fixes and write no file")
			fs.String("root", ".", "the directory to validate")
			fs.Var(&varsFlag{}, "exclude", "skip paths that contain this text (repeatable)")
			fs.Bool("no-manifest", false, "ignore the options of the manifest step")
		},
		Run: func(c *clifx.Context) error {
			root := e.resolveDir(c.String("root"))

			step := workflowfx.StepConfig{Name: name, Options: map[string]any{}} //nolint:exhaustruct
			if !c.Bool("no-manifest") {
				manifestStep, err := findManifestStep(root, name)
				if err != nil {
					return err
				}

				if manifestStep != nil {
					step.Options = maps.Clone(manifestStep.Options)
					step.Timeout = manifestStep.Timeout
				}
			}

			if excludes := listFlag(c, "exclude"); len(excludes) > 0 {
				step.Options["exclude"] = append(stringsOf(step.Options["exclude"]), excludes...)
			}

			workflow := &workflowfx.WorkflowDefinition{ //nolint:exhaustruct
				ID:    name,
				On:    []string{"cli"},
				Steps: []workflowfx.StepConfig{step},
			}

			opts := &workflowfx.RunOptions{ //nolint:exhaustruct
				Root:           root,
				Fix:            c.Bool("fix"),
				DryRun:         c.Bool("dry-run"),
				Args:           append([]string{}, c.Args...),
				DefaultTimeout: validatorTimeout,
				OnMutations:    writeMutations,
			}

			if !c.JSON {
				opts.OnStepEnd = stepPrinter(e.stdout, false)
			}

			result, err := workflowfx.RunWorkflow(c, workflow, newWorkflowRegistry(), opts)
			if err != nil {
				return err //nolint:wrapcheck // the engine's errors name the step
			}

			return reportWorkflows(c, []*workflowfx.WorkflowResult{result})
		},
	}
}

// findManifestStep returns the first step of the manifest in root that runs
// the tool, or nil when there is no manifest or no such step.
func findManifestStep(root, tool string) (*workflowfx.StepConfig, error) {
	config, err := workflowfx.LoadManifest(root)
	if errors.Is(err, workflowfx.ErrManifestNotFound) {
		return nil, nil //nolint:nilnil // no manifest: the validator runs with its defaults
	}

	if err != nil {
		return nil, err //nolint:wrapcheck // a ManifestError names the file and path itself
	}

	for _, wf := range config.Workflows {
		for i := range wf.Steps {
			if wf.Steps[i].Name == tool {
				return &wf.Steps[i], nil
			}
		}
	}

	return nil, nil //nolint:nilnil // the manifest does not run this validator
}

// stringsOf returns a manifest list option as strings, or nil when it is not
// a list of strings.
func stringsOf(raw any) []string {
	switch list := raw.(type) {
	case []string:
		return append([]string{}, list...)
	case []any:
		out := make([]string, 0, len(list))

		for _, item := range list {
			s, ok := item.(string)
			if !ok {
				return nil
			}

			out = append(out, s)
		}

		return out
	default:
		return nil
	}
}

// listFlag returns the values of a repeatable flag.
func listFlag(c *clifx.Context, name string) []string {
	f := c.Flags.Lookup(name)
	if f == nil {
		return nil
	}

	values, _ := f.Value.(*varsFlag)
	if values == nil {
		return nil
	}

	return append([]string{}, *values...)
}
