// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── validatorTool ────────────────────────────────────────────────────────────

// validatorFactory builds a validator from its tool options. It returns an
// error for options it cannot apply, so a malformed configuration fails before
// any file is read.
type validatorFactory func(opts map[string]any) (codebasefx.ValidatorFunc, error)

// staticFactory is the factory of a stateless validator that takes no options.
func staticFactory(vf codebasefx.ValidatorFunc) validatorFactory {
	return func(map[string]any) (codebasefx.ValidatorFunc, error) { return vf, nil }
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

	walkOpts := codebasefx.WalkOptions{Root: root, GitAware: true}

	// Options decoded from a manifest hold []any, from Go callers []string.
	exts, err := stringOption(opts["extensions"])
	if err != nil {
		return nil, fmt.Errorf("%s: extensions: %w", t.name, err)
	}

	excl, err := stringOption(opts["exclude"])
	if err != nil {
		return nil, fmt.Errorf("%s: exclude: %w", t.name, err)
	}

	walkOpts.Extensions = exts
	walkOpts.Exclude = excl

	files, err := codebasefx.WalkSourceFiles(ctx, walkOpts)
	if err != nil {
		return nil, fmt.Errorf("%s: walk: %w", t.name, err)
	}

	results := codebasefx.RunValidators(files, []codebasefx.ValidatorFunc{vf})

	var r codebasefx.ValidatorResult
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
			factory: staticFactory(codebasefx.ValidateEOF),
		},
		{
			name:    "codebase-bom",
			desc:    "detect UTF-8 BOM",
			factory: staticFactory(codebasefx.ValidateBOM),
		},
		{
			name:    "codebase-trailing",
			desc:    "detect trailing whitespace",
			factory: staticFactory(codebasefx.ValidateTrailingWhitespace),
		},
		{
			name:    "codebase-line-endings",
			desc:    "detect mixed CRLF/LF line endings",
			factory: staticFactory(codebasefx.ValidateLineEndings),
		},
		{
			name:    "codebase-merge-conflicts",
			desc:    "detect leftover merge conflict markers",
			factory: staticFactory(codebasefx.ValidateMergeConflicts),
		},
		{
			name:    "codebase-secrets",
			desc:    "detect potential secret leaks",
			factory: staticFactory(codebasefx.ValidateSecrets),
		},
		{
			name: "codebase-large-file",
			desc: "report files exceeding a size limit",
			factory: func(opts map[string]any) (codebasefx.ValidatorFunc, error) {
				maxKb, err := codebasefx.ParseMaxKb(opts["maxKb"])
				if err != nil {
					return nil, err
				}
				return codebasefx.ValidateLargeFile(maxKb * 1024), nil
			},
		},
		{
			name:    "codebase-json",
			desc:    "validate JSON and JSONC syntax",
			factory: staticFactory(codebasefx.ValidateJSON),
		},
		{
			name:    "codebase-yaml",
			desc:    "validate YAML syntax",
			factory: staticFactory(codebasefx.ValidateYAML),
		},
		{
			name:    "codebase-toml",
			desc:    "validate TOML syntax",
			factory: staticFactory(codebasefx.ValidateTOML),
		},
		{
			name:    "codebase-license",
			desc:    "check copyright license header in JS/TS files",
			factory: staticFactory(codebasefx.ValidateLicenseHeader),
		},
		{
			name:    "codebase-case-conflict",
			desc:    "detect case-insensitive path conflicts",
			factory: func(map[string]any) (codebasefx.ValidatorFunc, error) { return codebasefx.ValidateCaseConflict(), nil },
		},
		{
			name:    "codebase-symlinks",
			desc:    "detect broken symbolic links",
			factory: func(map[string]any) (codebasefx.ValidatorFunc, error) { return codebasefx.ValidateSymlinks(), nil },
		},
		{
			name:    "codebase-submodules",
			desc:    "detect git submodule references",
			factory: func(map[string]any) (codebasefx.ValidatorFunc, error) { return codebasefx.ValidateSubmodules(), nil },
		},
		{
			name:    "codebase-shebangs",
			desc:    "validate shebang lines (no-op placeholder)",
			factory: staticFactory(codebasefx.ValidateShebangs),
		},
		{
			name: "codebase-filenames",
			desc: "enforce filename conventions",
			factory: func(opts map[string]any) (codebasefx.ValidatorFunc, error) {
				rules, err := codebasefx.ParseFilenameRules(opts["rules"])
				if err != nil {
					return nil, err
				}
				var excludes []string
				if ex, ok := opts["globalExcludes"].([]string); ok {
					excludes = ex
				}
				return codebasefx.ValidateFilenames(rules, excludes), nil
			},
		},
		{
			name:    "codebase-runtime-js-apis",
			desc:    "detect direct Deno API usage in JS/TS files",
			factory: staticFactory(codebasefx.ValidateRuntimeJSAPIs),
		},
		{
			name:    "codebase-code-conventions",
			desc:    "detect non-namespace imports, `||` defaults and `export *` beyond the recorded baseline",
			factory: codeConventionsFactory,
		},
		{
			name:    "codebase-self-imports",
			desc:    "detect a package importing itself by its published name",
			factory: staticFactory(codebasefx.ValidateSelfImports),
		},
		{
			name:    "codebase-error-coverage",
			desc:    "verify error-struct entries have non-empty required fields",
			factory: codebasefx.ParseErrorCoverageOptions,
		},
		{
			name:    "codebase-server-loc",
			desc:    "fail if any non-test file in a directory exceeds the line ceiling",
			factory: codebasefx.ParseServerLocOptions,
		},
		{
			name: "codebase-naming-and-todos",
			desc: "enforce camelCase names and task-tagged TODO comments in JS/TS files",
			factory: func(opts map[string]any) (codebasefx.ValidatorFunc, error) {
				allow, err := codebasefx.ParseAllowNames(opts["allowNames"])
				if err != nil {
					return nil, err
				}
				return codebasefx.ValidateNamingAndTodos(allow), nil
			},
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
func RunSingleValidator(ctx context.Context, name string, files []codebasefx.FileEntry, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
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

		rawResults := codebasefx.RunValidators(files, []codebasefx.ValidatorFunc{vf})

		var r codebasefx.ValidatorResult
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
func builtinValidatorFuncs(opts map[string]any) (map[string]codebasefx.ValidatorFunc, error) {
	maxKb, err := codebasefx.ParseMaxKb(opts["maxKb"])
	if err != nil {
		return nil, err
	}

	return map[string]codebasefx.ValidatorFunc{
		"eof":             codebasefx.ValidateEOF,
		"bom":             codebasefx.ValidateBOM,
		"trailing":        codebasefx.ValidateTrailingWhitespace,
		"line-endings":    codebasefx.ValidateLineEndings,
		"merge-conflicts": codebasefx.ValidateMergeConflicts,
		"secrets":         codebasefx.ValidateSecrets,
		"large-file":      codebasefx.ValidateLargeFile(maxKb * 1024),
		"json":            codebasefx.ValidateJSON,
		"yaml":            codebasefx.ValidateYAML,
		"toml":            codebasefx.ValidateTOML,
		"license":         codebasefx.ValidateLicenseHeader,
		"case-conflict":   codebasefx.ValidateCaseConflict(),
		"symlinks":        codebasefx.ValidateSymlinks(),
		"submodules":      codebasefx.ValidateSubmodules(),
		"shebangs":        codebasefx.ValidateShebangs,
		"runtime-js-apis": codebasefx.ValidateRuntimeJSAPIs,
	}, nil
}

// codeConventionsFactory reads the baseline named by the "baseline" option
// (relative to the root; DefaultCodeConventionsBaseline when unset).
func codeConventionsFactory(opts map[string]any) (codebasefx.ValidatorFunc, error) {
	root := optStr(opts, "root", optStr(opts, "cwd", "."))

	path := codebasefx.DefaultCodeConventionsBaseline

	if raw, ok := opts["baseline"]; ok {
		value, isString := raw.(string)
		if !isString || value == "" {
			return nil, fmt.Errorf("%w: baseline must be a file path relative to the root, got %v", codebasefx.ErrInvalidOption, raw)
		}

		path = value
	}

	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}

	baseline, err := codebasefx.ReadCodeConventionsBaseline(path)
	if err != nil {
		return nil, err
	}

	return codebasefx.ValidateCodeConventions(root, baseline), nil
}

// optStr is a local helper (distinct from workflowfx's optString).
func optStr(opts map[string]any, key, def string) string {
	if v, ok := opts[key].(string); ok && v != "" {
		return v
	}

	return def
}
