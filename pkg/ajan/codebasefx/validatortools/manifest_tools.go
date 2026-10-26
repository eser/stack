// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// treeTool is a whole-repository check that runs once per step.
type treeTool struct {
	name string
	desc string
	run  func(root string, opts map[string]any) ([]workflowfx.WorkflowIssue, map[string]any, error)
}

func (t *treeTool) Name() string        { return t.name }
func (t *treeTool) Description() string { return t.desc }

func (t *treeTool) Run(_ context.Context, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	issues, stats, err := t.run(optStr(opts, "root", optStr(opts, "cwd", ".")), opts)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", t.name, err)
	}

	return &workflowfx.WorkflowToolResult{ //nolint:exhaustruct
		Name:   t.name,
		Passed: len(issues) == 0,
		Issues: issues,
		Stats:  stats,
	}, nil
}

func messages(format func(i int) string, n int) []workflowfx.WorkflowIssue {
	issues := make([]workflowfx.WorkflowIssue, 0, n)
	for i := range n {
		issues = append(issues, workflowfx.WorkflowIssue{Message: format(i)}) //nolint:exhaustruct
	}

	return issues
}

func treeTools() []workflowfx.WorkflowTool {
	return []workflowfx.WorkflowTool{
		&treeTool{
			name: "validate-circular-deps",
			desc: "detect circular dependencies between workspace packages",
			run: func(root string, _ map[string]any) ([]workflowfx.WorkflowIssue, map[string]any, error) {
				result, err := codebasefx.CheckCircularDeps(root)

				return messages(func(i int) string {
					return "Circular dependency: " + strings.Join(result.Cycles[i], " → ")
				}, len(result.Cycles)), map[string]any{"packagesChecked": result.PackagesChecked}, err
			},
		},
		&treeTool{
			name: "validate-mod-exports",
			desc: "check that every source file is reached from an entry point",
			run: func(root string, _ map[string]any) ([]workflowfx.WorkflowIssue, map[string]any, error) {
				result, err := codebasefx.CheckModExports(root)
				issues := make([]workflowfx.WorkflowIssue, 0, len(result.MissingExports))

				for _, m := range result.MissingExports {
					issues = append(issues, workflowfx.WorkflowIssue{ //nolint:exhaustruct
						Path: m.File,
						Message: fmt.Sprintf("%s: %s is not reached from mod.ts, the exports or another entry point; export it or remove it",
							m.PackageName, m.File),
					})
				}

				return issues, map[string]any{"packagesChecked": result.PackagesChecked}, err
			},
		},
		&treeTool{
			name: "validate-export-names",
			desc: "check the export path naming conventions",
			run: func(root string, opts map[string]any) ([]workflowfx.WorkflowIssue, map[string]any, error) {
				ignore, err := stringOption(opts["ignoreWords"])
				if err != nil {
					return nil, nil, err
				}

				result, err := codebasefx.CheckExportNames(root, ignore)

				return messages(func(i int) string {
					v := result.Violations[i]

					return fmt.Sprintf("%s: %q should be %q", v.PackageName, v.ExportPath, v.Suggestion)
				}, len(result.Violations)), map[string]any{"packagesChecked": result.PackagesChecked}, err
			},
		},
		&treeTool{
			name: "validate-docs",
			desc: "check the JSDoc of exported symbols",
			run: func(root string, opts map[string]any) ([]workflowfx.WorkflowIssue, map[string]any, error) {
				requireExamples, _ := opts["requireExamples"].(bool)
				result, err := codebasefx.CheckDocs(root, requireExamples)
				issues := make([]workflowfx.WorkflowIssue, 0, len(result.Issues))

				for _, d := range result.Issues {
					issues = append(issues, workflowfx.WorkflowIssue{Path: d.File, Line: d.Line, Message: d.Symbol + ": " + d.Issue}) //nolint:exhaustruct
				}

				return issues, map[string]any{"filesChecked": result.FilesChecked, "symbolsChecked": result.SymbolsChecked}, err
			},
		},
		&treeTool{
			name: "validate-commit-msg",
			desc: "validate the conventional commit format",
			run: func(root string, opts map[string]any) ([]workflowfx.WorkflowIssue, map[string]any, error) {
				file := optStr(opts, "commitMsgFile", "")
				if args, ok := opts["_args"].([]string); ok && file == "" && len(args) > 0 {
					file = args[0]
				}

				if file == "" {
					file = filepath.Join(root, ".git", "COMMIT_EDITMSG")
				}

				message, err := os.ReadFile(file) //nolint:gosec // G304: the commit message file git passes to the hook
				if err != nil {
					return []workflowfx.WorkflowIssue{{Message: "cannot read commit message file: " + file}}, map[string]any{}, nil //nolint:exhaustruct
				}

				commitOpts := codebasefx.DefaultCommitMsgOptions()
				if v, ok := opts["allowAsterisk"].(bool); ok {
					commitOpts.AllowAsterisk = v
				}

				if v, ok := opts["allowMultipleScopes"].(bool); ok {
					commitOpts.AllowMultipleScopes = v
				}

				if v, ok := opts["forceScope"].(bool); ok {
					commitOpts.ForceScope = v
				}

				if types, err := stringOption(opts["types"]); err == nil {
					commitOpts.Types = types
				}

				result := codebasefx.ValidateCommitMsg(string(message), commitOpts)

				return messages(func(i int) string { return result.Issues[i] }, len(result.Issues)), map[string]any{}, nil
			},
		},
	}
}

// stringOption reads a list of strings from a JSON- or YAML-decoded option.
func stringOption(raw any) ([]string, error) {
	switch list := raw.(type) {
	case nil:
		return nil, nil
	case []string:
		return list, nil
	case []any:
		out := make([]string, 0, len(list))

		for _, item := range list {
			s, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("%w: expected a list of strings, got %T", codebasefx.ErrInvalidOption, item)
			}

			out = append(out, s)
		}

		return out, nil
	default:
		return nil, fmt.Errorf("%w: expected a list of strings, got %T", codebasefx.ErrInvalidOption, raw)
	}
}

// RegisterManifestTools registers, in addition to RegisterAllValidators, the
// tools under the step names .eser/manifest.yml uses: the validate-* file
// validators, which check what the TypeScript tools of the same names check
// (manifest_parity.go), and the whole-repository checks.
func RegisterManifestTools(r *workflowfx.Registry) {
	RegisterAllValidators(r)

	for _, tool := range manifestFileTools() {
		r.Register(tool)
	}

	for _, tool := range treeTools() {
		r.Register(tool)
	}
}
