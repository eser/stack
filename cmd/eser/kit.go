// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/kitfx"
	"golang.org/x/term"
)

// The `eser kit` commands (M3-T9): the TypeScript kit's add, list, new, clone
// and update on kitfx, with the same flags and output lines.

// Environment variables for the clone tarball limits, read when the flag is
// not given.
const (
	kitMaxBytesEnv   = "ESER_KIT_MAX_BYTES"
	kitMaxEntriesEnv = "ESER_KIT_MAX_ENTRIES"
)

// varsFlag collects every --var key=value.
type varsFlag []string

func (v *varsFlag) String() string { return strings.Join(*v, ",") }

func (v *varsFlag) Set(value string) error {
	*v = append(*v, value)

	return nil
}

func (v *varsFlag) Get() any { return []string(*v) }

// kitVars parses the --var flags: the key is the text before the first "=",
// and a flag without one sets the key to "". Empty keys are dropped.
func kitVars(c *clifx.Context) map[string]string {
	vars := map[string]string{}

	f := c.Flags.Lookup("var")
	if f == nil {
		return vars
	}

	values, _ := f.Value.(*varsFlag)
	if values == nil {
		return vars
	}

	for _, entry := range *values {
		key, value, _ := strings.Cut(entry, "=")
		if key != "" {
			vars[key] = value
		}
	}

	return vars
}

func defineVarsFlag(fs *flag.FlagSet) {
	fs.Var(&varsFlag{}, "var", "template variable as key=value (repeatable)")
}

// defineInteractiveFlags defines --interactive (-i), --no-interactive and
// --no-post-install.
func defineInteractiveFlags(fs *flag.FlagSet) {
	interactive := fs.Bool("interactive", false, "prompt for missing variables")
	fs.BoolVar(interactive, "i", false, "same as --interactive")
	fs.Bool("no-interactive", false, "never prompt, even on a terminal")
	fs.Bool("no-post-install", false, "skip the post-install commands")
}

func (e *env) stdinIsTerminal() bool {
	file, ok := e.stdin.(*os.File)

	return ok && term.IsTerminal(int(file.Fd())) //nolint:gosec // G115: a file descriptor fits an int
}

// kitPrompt returns the prompt for missing variables, or nil when prompting
// is off: --interactive turns it on, --no-interactive off, and otherwise it
// is on when stdin is a terminal, with a note on stderr.
func (e *env) kitPrompt(c *clifx.Context) kitfx.PromptFunc {
	explicit, disabled := c.Bool("interactive"), c.Bool("no-interactive")
	tty := e.stdinIsTerminal()

	if disabled || (!explicit && !tty) {
		return nil
	}

	if !explicit {
		_, _ = fmt.Fprintln(e.stderr, "Prompting for missing variables (use --no-interactive to disable)")
	}

	prompter := e.prompter()

	return func(ctx context.Context, question string) (string, error) {
		answer, err := prompter.Text(ctx, &clifx.TextOptions{Title: question}) //nolint:exhaustruct
		if err != nil {
			return "", fmt.Errorf("prompt: %w", err)
		}

		return answer, nil
	}
}

// kitApplyOptions are the options every kit command applies recipes with:
// the TypeScript kit's conflict, variable and post-install behaviour.
func (e *env) kitApplyOptions(cwd string) kitfx.ApplyOptions {
	return kitfx.ApplyOptions{ //nolint:exhaustruct
		CWD:                      cwd,
		SkipConflicts:            true,
		StrictVariables:          true,
		StopOnPostInstallFailure: true,
		Stdout:                   e.stdout,
		Stderr:                   e.stderr,
		HTTPClient:               e.httpClient,
	}
}

// loadKitRegistry loads --registry, or with --local the nearest
// .eser/recipes.json at or above cwd (add --cwd), or the default registry.
func (e *env) loadKitRegistry(c *clifx.Context, cwd string, verbose bool) (*kitfx.RegistryManifest, error) {
	// A relative --registry path is relative to the working directory, as in
	// the TypeScript kit, even when --cwd moves the target project.
	source := c.String("registry")
	if source != "" && !strings.Contains(source, "://") && !filepath.IsAbs(source) {
		source = filepath.Join(e.cwd, source)
	}

	manifest, _, err := kitfx.LoadRegistry(c, &kitfx.LoadRegistryOptions{ //nolint:exhaustruct
		Source:     source,
		Local:      c.Bool("local"),
		CWD:        cwd,
		Verbose:    verbose,
		Stdout:     e.stdout,
		Stderr:     e.stderr,
		HTTPClient: e.httpClient,
	})
	if err != nil {
		return nil, fmt.Errorf("load the registry: %w", err)
	}

	return manifest, nil
}

func findRecipe(manifest *kitfx.RegistryManifest, name string) *kitfx.Recipe {
	for i := range manifest.Recipes {
		if manifest.Recipes[i].Name == name {
			return &manifest.Recipes[i]
		}
	}

	return nil
}

func errRecipeNotFound(name string) error {
	return fmt.Errorf("recipe '%s' not found. Run `eser kit list` to see available recipes", name) //nolint:err113 // a message for the user
}

// terminalControl matches terminal control sequences and control characters
// other than tab and newline, as the TypeScript kit's stripTerminalControls.
var terminalControl = regexp.MustCompile(
	`\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][\s\S]*?(?:\x1b\\|$)|` +
		`\x1b[\x20-\x2f]*[\x30-\x7e]?|\x{9b}[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x{9d}[^\x07\x{9c}]*[\x07\x{9c}]?|` +
		`[\x00-\x08\x0b-\x1f\x7f-\x{9f}]`,
)

// untrusted removes terminal controls from registry text before it is printed.
func untrusted(value string) string {
	return terminalControl.ReplaceAllString(value, "")
}

func writeRecipeLine(w io.Writer, recipe *kitfx.Recipe) {
	_, _ = fmt.Fprintf(w, "  %-20s %s [%s]\n", untrusted(recipe.Name), untrusted(recipe.Description), untrusted(recipe.Language))
}

func kitCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "kit",
		Short: "Add recipes to a project, or start one from a template",
		Long: "Recipes come from a registry manifest (.eser/recipes.json): --registry names a path or URL, " +
			"--local looks for one in this directory and its parents, and the default is the eser/stack registry.",
		Subcommands: []*clifx.Command{
			kitAddCommand(e),
			kitListCommand(e),
			kitNewCommand(e),
			kitCloneCommand(e),
			kitUpdateCommand(e),
		},
	}
}

func kitAddCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "add",
		Short: "Add a recipe to your project",
		Args:  "<recipe>",
		Flags: func(fs *flag.FlagSet) {
			fs.String("registry", "", "path or URL of the registry manifest")
			defineVarsFlag(fs)
			fs.String("cwd", "", "the project directory (default: the current directory)")
			fs.Bool("dry-run", false, "print what would be written and write nothing")
			fs.Bool("force", false, "overwrite files that already exist")
			fs.Bool("skip-existing", false, "leave files that already exist as they are")
			fs.Bool("verbose", false, "print a line for each file")
			fs.Bool("local", false, "use the nearest .eser/recipes.json first")
			fs.Bool("no-install", false, "print the dependency install commands instead of running them")
		},
		Run: func(c *clifx.Context) error { return e.kitAdd(c) },
	}
}

func (e *env) kitAdd(c *clifx.Context) error {
	if len(c.Args) == 0 {
		_, _ = fmt.Fprintln(e.stdout, "Usage: eser kit add <recipe> [--registry <url>] [--dry-run] [--var key=value]")
		_, _ = fmt.Fprintln(e.stdout)
		_, _ = fmt.Fprintln(e.stdout, "Run `eser kit list` to see available recipes.")

		return nil
	}

	name, dryRun, verbose := c.Args[0], c.Bool("dry-run"), c.Bool("verbose")

	if dryRun {
		_, _ = fmt.Fprintf(e.stdout, "\nDry run: %s\n\n", name)
	} else {
		_, _ = fmt.Fprintf(e.stdout, "\nAdding %s...\n\n", name)
	}

	cwd := e.cwd
	if dir := c.String("cwd"); dir != "" {
		cwd = dir
		if !filepath.IsAbs(cwd) {
			cwd = filepath.Join(e.cwd, cwd)
		}
	}

	manifest, err := e.loadKitRegistry(c, cwd, verbose)
	if err != nil {
		return err
	}

	recipe := findRecipe(manifest, name)
	if recipe == nil {
		return errRecipeNotFound(name)
	}

	deps := kitfx.GetDependencyInstructions(recipe, kitfx.DetectProjectType(cwd))
	for _, warning := range deps.Warnings {
		_, _ = fmt.Fprintf(e.stdout, "Warning: %s\n", warning)
	}

	opts := e.kitApplyOptions(cwd)
	opts.RegistryURL = manifest.RegistryURL
	opts.SourceBase = manifest.RegistryURL
	opts.Force = c.Bool("force")
	opts.SkipExisting = c.Bool("skip-existing")
	opts.DryRun = dryRun
	opts.Verbose = verbose
	opts.Variables = kitVars(c)

	chain, err := kitfx.ApplyRecipeChain(c, name, manifest, opts)
	if err != nil {
		return fmt.Errorf("add %s: %w", name, err)
	}

	written, skipped := 0, 0
	for _, entry := range chain.Recipes {
		written += len(entry.Result.Written)
		skipped += len(entry.Result.Skipped)
	}

	_, _ = fmt.Fprintf(e.stdout, "✓ Added %d file(s)\n", written)

	if len(chain.Recipes) > 1 {
		_, _ = fmt.Fprintf(e.stdout, "  Applied %d recipes (including dependencies)\n", len(chain.Recipes))
	}

	if skipped > 0 {
		_, _ = fmt.Fprintf(e.stdout, "  Skipped %d existing file(s)\n", skipped)
	}

	for _, entry := range chain.Recipes {
		if entry.Name == name {
			for _, file := range entry.Result.Written {
				_, _ = fmt.Fprintf(e.stdout, "  → %s\n", file)
			}
		}
	}

	e.kitInstall(c, deps.Instructions, cwd, c.Bool("no-install") || dryRun, verbose)

	return nil
}

// kitInstall runs the dependency install commands, or lists them when
// manual is set. A failed install is reported and does not fail the command,
// as in the TypeScript kit.
func (e *env) kitInstall(c *clifx.Context, instructions []string, cwd string, manual, verbose bool) {
	if len(instructions) == 0 {
		return
	}

	if manual {
		_, _ = fmt.Fprintln(e.stdout, "\nDependencies (run manually):")

		for _, instruction := range instructions {
			_, _ = fmt.Fprintf(e.stdout, "  %s\n", instruction)
		}

		return
	}

	_, _ = fmt.Fprintln(e.stdout, "\nInstalling dependencies...")

	results := kitfx.RunInstallCommands(c, instructions, kitfx.InstallOptions{
		CWD:     cwd,
		Stdout:  e.stdout,
		Stderr:  e.stderr,
		Verbose: verbose,
		Timeout: 0,
	})

	for _, result := range results {
		if result.Success {
			_, _ = fmt.Fprintf(e.stdout, "  ✓ %s\n", result.Command)
		} else {
			_, _ = fmt.Fprintf(e.stdout, "  ✗ %s: %s\n", result.Command, result.Error)
		}
	}
}

func kitListCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "list",
		Short: "Browse available recipes and templates",
		Flags: func(fs *flag.FlagSet) {
			fs.String("registry", "", "path or URL of the registry manifest")
			fs.String("language", "", "only recipes of this language")
			fs.String("scale", "", "only recipes of this scale: project, structure or utility")
			fs.String("tag", "", "only recipes with this tag")
			fs.Bool("local", false, "use the nearest .eser/recipes.json first")
		},
		Run: func(c *clifx.Context) error {
			manifest, err := e.loadKitRegistry(c, e.cwd, false)
			if err != nil {
				return err
			}

			recipes := kitfx.FilterRecipes(manifest.Recipes, kitfx.FilterOptions{
				Language: c.String("language"),
				Scale:    c.String("scale"),
				Tag:      c.String("tag"),
			})

			listing := map[string]any{
				"name":        manifest.Name,
				"description": manifest.Description,
				"author":      manifest.Author,
				"registryUrl": manifest.RegistryURL,
				"recipes":     recipes,
			}

			return c.Output(listing, func(w io.Writer) error {
				writeRecipeList(w, manifest, recipes)

				return nil
			})
		},
	}
}

func writeRecipeList(w io.Writer, manifest *kitfx.RegistryManifest, recipes []kitfx.Recipe) {
	if len(recipes) == 0 {
		_, _ = fmt.Fprintln(w, "No recipes found matching your filters.")
		_, _ = fmt.Fprintln(w, "Run `eser kit list` without filters to see all recipes.")

		return
	}

	if manifest.Name != "" {
		_, _ = fmt.Fprintf(w, "%s — %s\n\n", untrusted(manifest.Name), untrusted(manifest.Description))
	}

	groups := []struct {
		scale kitfx.RecipeScale
		label string
	}{
		{kitfx.RecipeScaleProject, "PROJECTS"},
		{kitfx.RecipeScaleStructure, "STRUCTURES"},
		{kitfx.RecipeScaleUtility, "UTILITIES"},
	}

	for _, group := range groups {
		printed := false

		for i := range recipes {
			if recipes[i].Scale != group.scale {
				continue
			}

			if !printed {
				_, _ = fmt.Fprintln(w, group.label)
				printed = true
			}

			writeRecipeLine(w, &recipes[i])
		}

		if printed {
			_, _ = fmt.Fprintln(w)
		}
	}
}

func kitNewCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:    "new",
		Aliases: []string{"create"},
		Short:   "Create a new project from a template",
		Args:    "<template>",
		Flags: func(fs *flag.FlagSet) {
			fs.String("name", "", "the project name and directory (default: the template name)")
			fs.String("registry", "", "path or URL of the registry manifest")
			defineVarsFlag(fs)
			fs.Bool("local", false, "use the nearest .eser/recipes.json first")
			defineInteractiveFlags(fs)
		},
		Run: func(c *clifx.Context) error { return e.kitNew(c) },
	}
}

func (e *env) kitNew(c *clifx.Context) error {
	if len(c.Args) == 0 {
		manifest, err := e.loadKitRegistry(c, e.cwd, false)
		if err != nil {
			return err
		}

		_, _ = fmt.Fprintln(e.stdout, "Usage: eser kit new <template> [--name <project-name>] [--var key=value]")
		_, _ = fmt.Fprintln(e.stdout)
		_, _ = fmt.Fprintln(e.stdout, "Available project templates:")
		_, _ = fmt.Fprintln(e.stdout)

		for i := range manifest.Recipes {
			if manifest.Recipes[i].Scale == kitfx.RecipeScaleProject {
				writeRecipeLine(e.stdout, &manifest.Recipes[i])
			}
		}

		return nil
	}

	templateName := c.Args[0]

	projectName := c.String("name")
	if projectName == "" {
		projectName = templateName
	}

	prompt := e.kitPrompt(c)

	_, _ = fmt.Fprintf(e.stdout, "\nCreating %s from %s...\n\n", projectName, templateName)

	manifest, err := e.loadKitRegistry(c, e.cwd, false)
	if err != nil {
		return err
	}

	var template *kitfx.Recipe

	available := []string{}

	for i := range manifest.Recipes {
		if manifest.Recipes[i].Scale != kitfx.RecipeScaleProject {
			continue
		}

		available = append(available, manifest.Recipes[i].Name)

		if manifest.Recipes[i].Name == templateName {
			template = &manifest.Recipes[i]
		}
	}

	if template == nil {
		return fmt.Errorf("template '%s' not found. Available: %s", templateName, strings.Join(available, ", ")) //nolint:err113 // a message for the user
	}

	targetDir := filepath.Join(e.cwd, projectName)
	if err := os.MkdirAll(targetDir, 0o755); err != nil { //nolint:gosec // G301: a project directory
		return fmt.Errorf("create the project directory %q: %w", targetDir, err)
	}

	vars := map[string]string{"project_name": projectName}
	maps.Copy(vars, kitVars(c))

	opts := e.kitApplyOptions(targetDir)
	opts.RegistryURL = manifest.RegistryURL
	opts.SourceBase = manifest.RegistryURL
	opts.Force = true
	opts.Variables = vars
	opts.Prompt = prompt
	opts.SkipPostInstall = c.Bool("no-post-install")

	result, err := kitfx.ApplyRecipe(c, template, opts)
	if err != nil {
		return fmt.Errorf("new %s: %w", projectName, err)
	}

	deps := kitfx.GetDependencyInstructions(template, kitfx.DetectProjectType(targetDir))

	_, _ = fmt.Fprintf(e.stdout, "✓ Created %s with %d file(s)\n", projectName, len(result.Written))

	for _, file := range result.Written {
		_, _ = fmt.Fprintf(e.stdout, "  → %s\n", file)
	}

	if len(deps.Instructions) > 0 {
		_, _ = fmt.Fprintln(e.stdout, "\nNext steps:")
		_, _ = fmt.Fprintf(e.stdout, "  cd %s\n", projectName)

		for _, instruction := range deps.Instructions {
			_, _ = fmt.Fprintf(e.stdout, "  %s\n", instruction)
		}
	}

	return nil
}

func kitUpdateCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "update",
		Short: "Re-fetch and update an applied recipe",
		Args:  "<recipe>",
		Flags: func(fs *flag.FlagSet) {
			fs.String("registry", "", "path or URL of the registry manifest")
			fs.Bool("dry-run", false, "print what would be written and write nothing")
			fs.Bool("verbose", false, "print a line for each file")
			fs.Bool("local", false, "use the nearest .eser/recipes.json first")
		},
		Run: func(c *clifx.Context) error { return e.kitUpdate(c) },
	}
}

func (e *env) kitUpdate(c *clifx.Context) error {
	if len(c.Args) == 0 {
		_, _ = fmt.Fprintln(e.stdout, "Usage: eser kit update <recipe> [--registry <url>] [--dry-run]")
		_, _ = fmt.Fprintln(e.stdout)
		_, _ = fmt.Fprintln(e.stdout, "Re-fetches and re-applies a recipe, overwriting existing files.")

		return nil
	}

	name, dryRun, verbose := c.Args[0], c.Bool("dry-run"), c.Bool("verbose")

	if dryRun {
		_, _ = fmt.Fprintf(e.stdout, "\nDry run: updating %s\n\n", name)
	} else {
		_, _ = fmt.Fprintf(e.stdout, "\nUpdating %s...\n\n", name)
	}

	manifest, err := e.loadKitRegistry(c, e.cwd, verbose)
	if err != nil {
		return err
	}

	recipe := findRecipe(manifest, name)
	if recipe == nil {
		return errRecipeNotFound(name)
	}

	opts := e.kitApplyOptions(e.cwd)
	opts.RegistryURL = manifest.RegistryURL
	opts.SourceBase = manifest.RegistryURL
	opts.Force = true
	opts.DryRun = dryRun
	opts.Verbose = verbose

	result, err := kitfx.ApplyRecipe(c, recipe, opts)
	if err != nil {
		return fmt.Errorf("update %s: %w", name, err)
	}

	verb := "Updated"
	if dryRun {
		verb = "Would update"
	}

	_, _ = fmt.Fprintf(e.stdout, "✓ %s %d file(s) from %s\n", verb, len(result.Written), name)

	for _, file := range result.Written {
		_, _ = fmt.Fprintf(e.stdout, "  → %s\n", file)
	}

	return nil
}

func kitCloneCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "clone",
		Short: "Clone a recipe from any GitHub repo",
		Args:  "<specifier> [target-dir]",
		Flags: func(fs *flag.FlagSet) {
			fs.String("recipe", "", "path of the recipe file in the repository (default: recipe.json)")
			name := fs.String("name", "", "project name and target directory")
			fs.StringVar(name, "p", "", "same as --name")
			defineVarsFlag(fs)
			fs.String("max-bytes", "", fmt.Sprintf("tarball limit in decompressed bytes (default: %d, env: %s)", kitfx.DefaultMaxBytes, kitMaxBytesEnv))
			fs.String("max-entries", "", fmt.Sprintf("tarball limit in entries (default: %d, env: %s)", kitfx.DefaultMaxEntries, kitMaxEntriesEnv))
			fs.Bool("force", false, "overwrite files that already exist")
			fs.Bool("dry-run", false, "print what would be written and write nothing")
			fs.Bool("skip-existing", false, "leave files that already exist as they are")
			fs.Bool("verbose", false, "print a line for each file")
			defineInteractiveFlags(fs)
		},
		Run: func(c *clifx.Context) error { return e.kitClone(c) },
	}
}

func (e *env) writeCloneUsage() {
	lines := []string{
		"Usage: eser kit clone <specifier> [target-dir] [options]",
		"",
		"Specifier formats:",
		"  owner/repo                     GitHub repo (ref main)",
		"  owner/repo#ref                 GitHub repo at specific tag/branch",
		"  gh:owner/repo/sub/path[#ref]   GitHub repo subpath",
		"",
		"Options:",
		"  --recipe <path>                Path to recipe.json (default: recipe.json)",
		"  --name, -p <dir>               Project name / target directory",
		"  --var key=value                Template variable (repeatable)",
		"  --interactive, -i              Prompt for missing variables",
		"  --no-post-install              Skip post-install commands",
		"  --force                        Overwrite existing files",
		"  --dry-run                      Preview without writing",
		"  --skip-existing                Skip files that already exist",
		"  --verbose                      Show verbose output",
		fmt.Sprintf("  --max-bytes <n>                Tarball limit in decompressed bytes (default: %d, env: %s)", kitfx.DefaultMaxBytes, kitMaxBytesEnv),
		fmt.Sprintf("  --max-entries <n>              Tarball limit in entries (default: %d, env: %s)", kitfx.DefaultMaxEntries, kitMaxEntriesEnv),
	}

	for _, line := range lines {
		_, _ = fmt.Fprintln(e.stdout, line)
	}
}

// kitLimit resolves one tarball limit: the flag, then the environment
// variable (empty counts as unset), then 0 for the default.
func (e *env) kitLimit(c *clifx.Context, flagName, envName, example string) (int64, error) {
	source, raw := "--"+flagName, c.String(flagName)
	if raw == "" && !flagSet(c, flagName) {
		source, raw = envName, e.getenv(envName)
		if raw == "" {
			return 0, nil
		}
	}

	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 1 || value > 1<<53-1 || raw[0] == '0' || raw[0] == '+' {
		return 0, fmt.Errorf("%s %q is not a positive integer; expected a whole number such as %s", source, raw, example) //nolint:err113 // a message for the user
	}

	return value, nil
}

func flagSet(c *clifx.Context, name string) bool {
	set := false

	c.Flags.Visit(func(f *flag.Flag) {
		if f.Name == name {
			set = true
		}
	})

	return set
}

func (e *env) kitClone(c *clifx.Context) error {
	if len(c.Args) == 0 {
		e.writeCloneUsage()

		return nil
	}

	raw := c.Args[0]

	spec := kitfx.ResolveSpecifier(raw)
	if spec.Kind != "repo" {
		_, _ = fmt.Fprintf(e.stdout, "Invalid specifier: '%s'. Use format: owner/repo or gh:owner/repo#ref\n", raw)

		return &clifx.ExitError{Code: clifx.ExitFailure, Err: nil}
	}

	if spec.Ref == "" {
		spec.Ref = kitfx.DefaultRef
	}

	maxBytes, err := e.kitLimit(c, "max-bytes", kitMaxBytesEnv, "536870912 for 512 MiB")
	if err != nil {
		return err
	}

	maxEntries, err := e.kitLimit(c, "max-entries", kitMaxEntriesEnv, "50000")
	if err != nil {
		return err
	}

	projectName := c.String("name")
	if projectName == "" && len(c.Args) > 1 {
		projectName = c.Args[1]
	}

	prompt := e.kitPrompt(c)
	dryRun := c.Bool("dry-run")

	_, _ = fmt.Fprintf(e.stdout, "\nCloning from %s/%s@%s...\n\n", spec.Owner, spec.Repo, spec.Ref)

	recipe, err := kitfx.FetchRecipeFromRepo(c, &spec, kitfx.RepoRecipeOptions{ //nolint:exhaustruct
		RecipePath: c.String("recipe"),
		HTTPClient: e.httpClient,
	})
	if errors.Is(err, kitfx.ErrRecipeFileNotFound) {
		// No recipe file: copy the whole repository or subpath.
		recipe, err = &kitfx.Recipe{Schema: "registry/v1"}, nil //nolint:exhaustruct
	}

	if err != nil {
		return fmt.Errorf("clone %s: %w", raw, err)
	}

	targetDir := e.cwd
	if projectName != "" {
		targetDir = filepath.Join(e.cwd, projectName)

		if !dryRun {
			if err := os.MkdirAll(targetDir, 0o755); err != nil { //nolint:gosec // G301: a project directory
				return fmt.Errorf("create the target directory %q: %w", targetDir, err)
			}
		}
	}

	vars := kitVars(c)
	if _, set := vars["project_name"]; !set && projectName != "" {
		vars["project_name"] = projectName
	}

	specifier := fmt.Sprintf("gh:%s/%s#%s", spec.Owner, spec.Repo, spec.Ref)
	if spec.Subpath != "" {
		specifier = fmt.Sprintf("gh:%s/%s/%s#%s", spec.Owner, spec.Repo, spec.Subpath, spec.Ref)
	}

	opts := e.kitApplyOptions(targetDir)
	// Recipe files resolve against the repository root, also for a subpath
	// recipe, as in the TypeScript kit.
	opts.SourceBase = fmt.Sprintf("%s/%s/%s/%s", kitfx.DefaultGitHubRaw, spec.Owner, spec.Repo, spec.Ref)
	opts.Specifier = specifier
	opts.Force = c.Bool("force")
	opts.SkipExisting = c.Bool("skip-existing")
	opts.DryRun = dryRun
	opts.Verbose = c.Bool("verbose")
	opts.Variables = vars
	opts.Prompt = prompt
	opts.SkipPostInstall = c.Bool("no-post-install")
	opts.MaxBytes = maxBytes
	opts.MaxEntries = int(maxEntries)

	result, err := kitfx.ApplyRecipe(c, recipe, opts)
	if err != nil {
		if limitErr, ok := errors.AsType[*kitfx.TarballLimitError](err); ok {
			flagName, envName := "--max-entries", kitMaxEntriesEnv
			if limitErr.Limit == kitfx.LimitMaxBytes {
				flagName, envName = "--max-bytes", kitMaxBytesEnv
			}

			return fmt.Errorf("clone %s: %w\nIf you trust this repository, raise the limit with %s <n> or %s=<n>", raw, err, flagName, envName)
		}

		return fmt.Errorf("clone %s: %w", raw, err)
	}

	deps := kitfx.GetDependencyInstructions(recipe, kitfx.DetectProjectType(targetDir))

	verb, name := "Cloned", recipe.Name
	if dryRun {
		verb = "Would write"
	}

	if name == "" {
		name = spec.Repo
	}

	_, _ = fmt.Fprintf(e.stdout, "✓ %s %d file(s) from %s\n", verb, len(result.Written), name)

	for _, file := range result.Written {
		_, _ = fmt.Fprintf(e.stdout, "  → %s\n", file)
	}

	if len(result.PostInstallRan) > 0 {
		_, _ = fmt.Fprintln(e.stdout, "\nPost-install:")

		for _, command := range result.PostInstallRan {
			_, _ = fmt.Fprintf(e.stdout, "  ✓ %s\n", command)
		}
	}

	if len(deps.Instructions) > 0 {
		_, _ = fmt.Fprintln(e.stdout, "\nDependencies:")

		for _, instruction := range deps.Instructions {
			_, _ = fmt.Fprintf(e.stdout, "  Run: %s\n", instruction)
		}
	}

	return nil
}
