// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"context"
	"fmt"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── validatorTool ────────────────────────────────────────────────────────────

// validatorFactory builds a validator from its tool options. It returns an
// error for options it cannot apply, so a malformed configuration fails before
// any file is read.
type validatorFactory func(opts map[string]any) (ValidatorFunc, error)

// staticFactory is the factory of a stateless validator that takes no options.
func staticFactory(vf ValidatorFunc) validatorFactory {
	return func(map[string]any) (ValidatorFunc, error) { return vf, nil }
}

// validatorTool adapts a single-file ValidatorFunc to the workflowfx.WorkflowTool
// interface. factory is called fresh on each Run so stateful closures
// (e.g. ValidateCaseConflict) start with a clean slate per invocation.
type validatorTool struct {
	name    string
	desc    string
	factory validatorFactory
}

func (t *validatorTool) Name() string        { return t.name }
func (t *validatorTool) Description() string { return t.desc }

func (t *validatorTool) Run(ctx context.Context, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	vf, err := t.factory(opts)
	if err != nil {
		return nil, fmt.Errorf("%s: options: %w", t.name, err)
	}

	root := optStr(opts, "root", optStr(opts, "cwd", "."))

	walkOpts := WalkOptions{Root: root, GitAware: true}

	if exts, ok := opts["extensions"].([]string); ok {
		walkOpts.Extensions = exts
	}

	if excl, ok := opts["exclude"].([]string); ok {
		walkOpts.Exclude = excl
	}

	files, err := WalkSourceFiles(ctx, walkOpts)
	if err != nil {
		return nil, fmt.Errorf("%s: walk: %w", t.name, err)
	}

	results := RunValidators(files, []ValidatorFunc{vf})

	var r ValidatorResult
	if len(results) > 0 {
		r = results[0]
	}

	r.Name = t.name

	wfIssues := make([]workflowfx.WorkflowIssue, 0, len(r.Issues))

	for _, iss := range r.Issues {
		var msg string

		switch {
		case iss.Line > 0:
			msg = fmt.Sprintf("%s:%d: %s", iss.File, iss.Line, iss.Message)
		case iss.File != "":
			msg = iss.File + ": " + iss.Message
		default:
			msg = iss.Message
		}

		wfIssues = append(wfIssues, workflowfx.WorkflowIssue{Message: msg})
	}

	return &workflowfx.WorkflowToolResult{
		Name:   t.name,
		Passed: r.Passed,
		Issues: wfIssues,
		Stats: map[string]any{
			"filesChecked": r.FilesChecked,
			"issueCount":   len(r.Issues),
		},
	}, nil
}

// ─── RegisterAllValidators ────────────────────────────────────────────────────

// RegisterAllValidators registers every codebasefx validator as a workflowfx tool.
// Tool names follow the pattern "codebase-<validator-name>".
func RegisterAllValidators(r *workflowfx.Registry) {
	tools := []*validatorTool{
		{
			name:    "codebase-eof",
			desc:    "check files end with exactly one newline",
			factory: staticFactory(ValidateEOF),
		},
		{
			name:    "codebase-bom",
			desc:    "detect UTF-8 BOM",
			factory: staticFactory(ValidateBOM),
		},
		{
			name:    "codebase-trailing",
			desc:    "detect trailing whitespace",
			factory: staticFactory(ValidateTrailingWhitespace),
		},
		{
			name:    "codebase-line-endings",
			desc:    "detect mixed CRLF/LF line endings",
			factory: staticFactory(ValidateLineEndings),
		},
		{
			name:    "codebase-merge-conflicts",
			desc:    "detect leftover merge conflict markers",
			factory: staticFactory(ValidateMergeConflicts),
		},
		{
			name:    "codebase-secrets",
			desc:    "detect potential secret leaks",
			factory: staticFactory(ValidateSecrets),
		},
		{
			name: "codebase-large-file",
			desc: "report files exceeding a size limit",
			factory: func(opts map[string]any) (ValidatorFunc, error) {
				maxKb, err := ParseMaxKb(opts["maxKb"])
				if err != nil {
					return nil, err
				}
				return ValidateLargeFile(maxKb * 1024), nil
			},
		},
		{
			name:    "codebase-json",
			desc:    "validate JSON and JSONC syntax",
			factory: staticFactory(ValidateJSON),
		},
		{
			name:    "codebase-yaml",
			desc:    "validate YAML syntax",
			factory: staticFactory(ValidateYAML),
		},
		{
			name:    "codebase-toml",
			desc:    "validate TOML syntax",
			factory: staticFactory(ValidateTOML),
		},
		{
			name:    "codebase-license",
			desc:    "check copyright license header in JS/TS files",
			factory: staticFactory(ValidateLicenseHeader),
		},
		{
			name:    "codebase-case-conflict",
			desc:    "detect case-insensitive path conflicts",
			factory: func(map[string]any) (ValidatorFunc, error) { return ValidateCaseConflict(), nil },
		},
		{
			name:    "codebase-symlinks",
			desc:    "detect broken symbolic links",
			factory: func(map[string]any) (ValidatorFunc, error) { return ValidateSymlinks(), nil },
		},
		{
			name:    "codebase-submodules",
			desc:    "detect git submodule references",
			factory: func(map[string]any) (ValidatorFunc, error) { return ValidateSubmodules(), nil },
		},
		{
			name:    "codebase-shebangs",
			desc:    "validate shebang lines (no-op placeholder)",
			factory: staticFactory(ValidateShebangs),
		},
		{
			name: "codebase-filenames",
			desc: "enforce filename conventions",
			factory: func(opts map[string]any) (ValidatorFunc, error) {
				rules, err := ParseFilenameRules(opts["rules"])
				if err != nil {
					return nil, err
				}
				var excludes []string
				if ex, ok := opts["globalExcludes"].([]string); ok {
					excludes = ex
				}
				return ValidateFilenames(rules, excludes), nil
			},
		},
		{
			name:    "codebase-runtime-js-apis",
			desc:    "detect direct Deno API usage in JS/TS files",
			factory: staticFactory(ValidateRuntimeJSAPIs),
		},
	}

	for _, tool := range tools {
		r.Register(tool)
	}
}

// RunSingleValidator resolves a built-in validator by short name (e.g. "eof",
// "secrets", "json") or full tool name ("codebase-eof") and runs it.
//
// When files is non-nil the validator is applied directly to those files
// (no walk). When files is nil the tool performs its own walk using opts["root"].
func RunSingleValidator(ctx context.Context, name string, files []FileEntry, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	if opts == nil {
		opts = map[string]any{}
	}

	// Resolve short name (e.g. "eof") → full tool name ("codebase-eof").
	shortName := name
	if len(name) > len("codebase-") && name[:len("codebase-")] == "codebase-" {
		shortName = name[len("codebase-"):]
	}

	fullName := "codebase-" + shortName

	// When pre-walked files are provided, run the ValidatorFunc directly so we
	// avoid a second filesystem walk.
	if files != nil {
		vfMap, err := builtinValidatorFuncs(opts)
		if err != nil {
			return nil, fmt.Errorf("%s: options: %w", fullName, err)
		}

		vf, ok := vfMap[shortName]
		if !ok {
			return nil, fmt.Errorf("unknown validator %q", name)
		}

		rawResults := RunValidators(files, []ValidatorFunc{vf})

		var r ValidatorResult
		if len(rawResults) > 0 {
			r = rawResults[0]
		}

		r.Name = fullName

		wfIssues := make([]workflowfx.WorkflowIssue, 0, len(r.Issues))

		for _, iss := range r.Issues {
			var msg string

			switch {
			case iss.Line > 0:
				msg = fmt.Sprintf("%s:%d: %s", iss.File, iss.Line, iss.Message)
			case iss.File != "":
				msg = iss.File + ": " + iss.Message
			default:
				msg = iss.Message
			}

			wfIssues = append(wfIssues, workflowfx.WorkflowIssue{Message: msg})
		}

		return &workflowfx.WorkflowToolResult{
			Name:   fullName,
			Passed: r.Passed,
			Issues: wfIssues,
			Stats:  map[string]any{"filesChecked": r.FilesChecked, "issueCount": len(r.Issues)},
		}, nil
	}

	// No pre-walked files: delegate to the registry tool which walks internally.
	reg := workflowfx.NewRegistry()
	RegisterAllValidators(reg)

	tool, ok := reg.Get(fullName)
	if !ok {
		return nil, fmt.Errorf("unknown validator %q", name)
	}

	return tool.Run(ctx, opts)
}

// builtinValidatorFuncs returns the short-name → ValidatorFunc map that
// RunSingleValidator uses for pre-walked files.
func builtinValidatorFuncs(opts map[string]any) (map[string]ValidatorFunc, error) {
	maxKb, err := ParseMaxKb(opts["maxKb"])
	if err != nil {
		return nil, err
	}

	return map[string]ValidatorFunc{
		"eof":             ValidateEOF,
		"bom":             ValidateBOM,
		"trailing":        ValidateTrailingWhitespace,
		"line-endings":    ValidateLineEndings,
		"merge-conflicts": ValidateMergeConflicts,
		"secrets":         ValidateSecrets,
		"large-file":      ValidateLargeFile(maxKb * 1024),
		"json":            ValidateJSON,
		"yaml":            ValidateYAML,
		"toml":            ValidateTOML,
		"license":         ValidateLicenseHeader,
		"case-conflict":   ValidateCaseConflict(),
		"symlinks":        ValidateSymlinks(),
		"submodules":      ValidateSubmodules(),
		"shebangs":        ValidateShebangs,
		"runtime-js-apis": ValidateRuntimeJSAPIs,
	}, nil
}

// optStr is a local helper (distinct from workflowfx's optString).
func optStr(opts map[string]any, key, def string) string {
	if v, ok := opts[key].(string); ok && v != "" {
		return v
	}

	return def
}
