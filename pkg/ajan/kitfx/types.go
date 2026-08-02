// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package kitfx provides a recipe-based project scaffolding engine.
//
// Recipes are fetched from a registry manifest (local or GitHub), resolved
// in dependency order, and applied to a project directory with optional
// variable substitution and post-install command execution.
package kitfx

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
}

// Recipe is a single recipe definition as stored in a registry manifest.
type Recipe struct {
	Name         string              `json:"name"`
	Description  string              `json:"description"`
	Language     string              `json:"language"`
	Scale        RecipeScale         `json:"scale"`
	Tags         []string            `json:"tags,omitempty"`
	Requires     []string            `json:"requires,omitempty"`
	Variables    []TemplateVariable  `json:"variables,omitempty"`
	PostInstall  []string            `json:"postInstall,omitempty"`
	Files        []RecipeFile        `json:"files"`
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
	Type       ProjectType
	ConfigFile string // empty when Type==Unknown
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
	Verbose      bool
	Variables    map[string]string
}

// ApplyResult records what was written, skipped, and run during recipe application.
type ApplyResult struct {
	Written        []string
	Skipped        []string
	Total          int
	PostInstallRan []string
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
	Ref   string // branch / tag / commit; may be empty for "name" kind
}

// FetchedFile holds a single file path + content downloaded from a folder listing.
type FetchedFile struct {
	Path    string
	Content string
}
