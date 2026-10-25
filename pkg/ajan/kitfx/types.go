// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package kitfx provides a recipe-based project scaffolding engine.
//
// Recipes are fetched from a registry manifest (local or GitHub), resolved
// in dependency order, and applied to a project directory with optional
// variable substitution and post-install command execution.
package kitfx

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// RecipeScale classifies a recipe by its scope.
type RecipeScale string

const (
	RecipeScaleProject   RecipeScale = "project"
	RecipeScaleStructure RecipeScale = "structure"
	RecipeScaleUtility   RecipeScale = "utility"
)

// RecipeFileKind distinguishes a single file from a directory tree.
type RecipeFileKind string

const (
	RecipeFileKindFile   RecipeFileKind = "file"
	RecipeFileKindFolder RecipeFileKind = "folder"
)

// RecipeFileProvider indicates where a file is fetched from.
type RecipeFileProvider string

const (
	RecipeFileProviderLocal  RecipeFileProvider = "local"
	RecipeFileProviderGitHub RecipeFileProvider = "github"
)

// RecipeFile is a single source→target mapping in a recipe.
type RecipeFile struct {
	Source   string             `json:"source"`
	Target   string             `json:"target"`
	Kind     RecipeFileKind     `json:"kind,omitempty"`
	Provider RecipeFileProvider `json:"provider,omitempty"`
}

// RecipeDependencies lists packages to install, grouped by ecosystem.
type RecipeDependencies struct {
	Go  []string `json:"go,omitempty"`
	JSR []string `json:"jsr,omitempty"`
	NPM []string `json:"npm,omitempty"`
}

// TemplateVariable defines a variable that can be substituted in recipe files.
type TemplateVariable struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Default     string `json:"default,omitempty"`
	Prompt      string `json:"prompt,omitempty"`
	// Pattern is a regular expression that a given or typed value must
	// match. It is matched unanchored, as JavaScript's RegExp.test does, with
	// Go's RE2 syntax, so lookarounds and backreferences do not compile.
	Pattern string `json:"pattern,omitempty"`
	// Required is read from the manifest but not acted on, as in the
	// TypeScript kit: every variable without a default needs a value.
	Required *bool `json:"required,omitempty"`

	// defaultSet records a "default" key in the JSON, so that an empty
	// default counts as a default.
	defaultSet bool
}

// HasDefault reports whether the variable has a default: a non-empty Default,
// or a "default" key in the manifest it was decoded from, even an empty one.
func (v *TemplateVariable) HasDefault() bool {
	return v.defaultSet || v.Default != ""
}

// UnmarshalJSON decodes a variable and records whether it had a "default" key.
func (v *TemplateVariable) UnmarshalJSON(data []byte) error {
	type plain TemplateVariable

	var decoded plain
	if err := json.Unmarshal(data, &decoded); err != nil {
		return fmt.Errorf("decode template variable: %w", err)
	}

	var keys map[string]json.RawMessage
	if err := json.Unmarshal(data, &keys); err != nil {
		return fmt.Errorf("decode template variable: %w", err)
	}

	_, decoded.defaultSet = keys["default"]
	*v = TemplateVariable(decoded)

	return nil
}

// Recipe is a single recipe definition as stored in a registry manifest, or
// as a standalone recipe.json that `kit clone` reads.
type Recipe struct {
	// Schema is the "registry/v1" sentinel of a standalone recipe.json.
	Schema      string             `json:"schema,omitempty"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Language    string             `json:"language"`
	Scale       RecipeScale        `json:"scale"`
	Tags        []string           `json:"tags,omitempty"`
	Requires    []string           `json:"requires,omitempty"`
	Variables   []TemplateVariable `json:"variables,omitempty"`
	PostInstall []string           `json:"postInstall,omitempty"`
	// Files lists the files to copy. A nil Files on a recipe that `kit clone`
	// read selects whole-repo mode (see ApplyOptions.Specifier).
	Files []RecipeFile `json:"files"`
	// Ignore holds the glob patterns of the files whole-repo mode leaves out.
	// Files mode does not read it, as in the TypeScript kit.
	Ignore       []string            `json:"ignore,omitempty"`
	Dependencies *RecipeDependencies `json:"dependencies,omitempty"`
}

// RegistryManifest is the root eser-registry.json structure.
type RegistryManifest struct {
	Schema      string   `json:"$schema,omitempty"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Author      string   `json:"author"`
	RegistryURL string   `json:"registryUrl"`
	Recipes     []Recipe `json:"recipes"`
}

// ProjectType identifies the build system used in a project directory.
type ProjectType string

const (
	ProjectTypeGo      ProjectType = "go"
	ProjectTypeDeno    ProjectType = "deno"
	ProjectTypeNode    ProjectType = "node"
	ProjectTypeUnknown ProjectType = "unknown"
)

// ProjectDetection holds the result of scanning a directory for a project file.
type ProjectDetection struct {
	Type ProjectType
	// ConfigFile is the path of the file that decided Type; empty when
	// Type==Unknown.
	ConfigFile string
}

// DependencyInstructions holds shell commands and any mismatch warnings.
type DependencyInstructions struct {
	Instructions []string
	Warnings     []string
}

// InstallResult records the outcome of a single install command.
type InstallResult struct {
	Command string
	Success bool
	Error   string
}

// ApplyOptions configures recipe application.
type ApplyOptions struct {
	CWD          string
	RegistryURL  string
	Force        bool
	SkipExisting bool
	DryRun       bool
	// Verbose prints a line for each file written or skipped and each
	// post-install command on Stdout, and logs post-install failures to
	// standard error when Logger is nil.
	Verbose   bool
	Variables map[string]string

	// Logger receives one warning for each post-install command that fails.
	// When it is nil, failures go to standard error if Verbose is set, and
	// are otherwise only listed in ApplyResult.PostInstallFailed.
	Logger *logfx.Logger

	// PostInstallTimeout bounds each post-install command. Zero selects
	// DefaultCommandTimeout; a negative value makes ApplyRecipe return an
	// error before it writes anything.
	PostInstallTimeout time.Duration

	// SourceBase is the base that the source of each local-provider file
	// resolves against: the manifest's registryUrl, as the TypeScript kit
	// uses it. An http or https URL is fetched as SourceBase/source, a
	// file:// URL or a plain path is read from disk, and a folder under a
	// https://raw.githubusercontent.com/ base (see GitHub) is listed through
	// the GitHub contents API. Empty keeps each source as a path of its own.
	SourceBase string

	// Specifier is the clone specifier (gh:owner/repo[/subpath][#ref]) that a
	// recipe without Files (whole-repo mode) downloads as a tarball. A recipe
	// without Files and without Specifier writes nothing.
	Specifier string

	// MaxBytes and MaxEntries bound the whole-repo tarball; zero selects
	// DefaultMaxBytes and DefaultMaxEntries, a negative value is an error.
	MaxBytes   int64
	MaxEntries int

	// SkipConflicts reports a file target that already exists on Stderr and
	// skips it, when neither Force nor SkipExisting is set, as the TypeScript
	// kit does. Without it the apply stops with an error before it writes.
	SkipConflicts bool

	// StrictVariables resolves variables as the TypeScript kit does: only the
	// recipe's declared variables are substituted, and a declared variable
	// without a value, a default or a prompt answer is a *MissingVariableError.
	// Without it undeclared values pass through and a missing one is empty.
	StrictVariables bool

	// Prompt asks for a declared variable that has no value and no default.
	// Nil turns prompting off.
	Prompt PromptFunc

	// SkipPostInstall leaves the post-install commands out.
	SkipPostInstall bool

	// StopOnPostInstallFailure ends the apply at the first post-install
	// command that fails, with a *PostInstallError, as the TypeScript kit
	// does. Without it a failed command is logged and the rest still run.
	StopOnPostInstallFailure bool

	// Stdout receives the progress lines ([write], [skip], [dry-run] and the
	// post-install commands' output); Stderr the warnings and the resolved
	// variables. Nil discards them.
	Stdout io.Writer
	Stderr io.Writer

	// HTTPClient sends the registry, file and tarball requests; nil uses a
	// client of its own. Each request is also bounded by a timeout.
	HTTPClient *http.Client

	// GitHub holds the GitHub hosts; zero fields select the public ones.
	GitHub GitHubEndpoints
}

// PromptFunc asks question (such as "Project name: ") on the terminal and
// returns the answer as typed. An error, such as end of input, ends prompting.
type PromptFunc func(ctx context.Context, question string) (string, error)

// ApplyResult records what was written, skipped, and run during recipe application.
type ApplyResult struct {
	Written []string
	Skipped []string
	Total   int

	// PostInstallRan lists every post-install command that was attempted,
	// including the ones in PostInstallFailed.
	PostInstallRan []string

	// PostInstallFailed lists the post-install commands that could not start,
	// exited with a non-zero status or ran past ApplyOptions.PostInstallTimeout.
	// The cause of each is logged once (see ApplyOptions.Logger).
	PostInstallFailed []string
}

// ApplyChainResult holds per-recipe results when a full dependency chain is applied.
type ApplyChainResult struct {
	Recipes []NamedApplyResult
}

// NamedApplyResult pairs a recipe name with its ApplyResult.
type NamedApplyResult struct {
	Name   string
	Result ApplyResult
}

// ResolvedSpecifier is the parsed form of a kit specifier string.
type ResolvedSpecifier struct {
	// Kind is "name" or "repo".
	Kind  string
	Name  string // set when Kind=="name"
	Owner string // set when Kind=="repo"
	Repo  string // set when Kind=="repo"
	Ref   string // branch / tag / commit after "#"; empty when absent
	// Subpath is the path inside the repository, from gh:owner/repo/sub/path.
	Subpath string
}

// FetchedFile holds a single file path + content downloaded from a folder listing.
type FetchedFile struct {
	Path    string
	Content string
}
