// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

// Commit represents a single git commit.
type Commit struct {
	Subject string
	Body    string
	Hash    string
}

// CommitAuthor holds author identity for git commits.
type CommitAuthor struct {
	Name  string
	Email string
}

// FileEntry represents a file found during a directory walk.
type FileEntry struct {
	Path      string
	Name      string
	Size      int64
	IsSymlink bool
}

// WalkOptions controls how source files are discovered.
type WalkOptions struct {
	Root       string   // defaults to current directory
	Extensions []string // e.g. [".go", ".ts"]; nil = all extensions
	Exclude    []string // path substrings to skip
	GitAware   bool     // use git ls-files when inside a git repo
}

// ValidatorIssue describes a single problem found by a validator.
type ValidatorIssue struct {
	Severity string // "error" or "warning"
	File     string
	Line     int
	Message  string
	Fixed    bool
}

// ValidatorResult collects all issues from one validator pass.
type ValidatorResult struct {
	Name         string
	Passed       bool
	Issues       []ValidatorIssue
	FilesChecked int
}

// ConventionalCommit represents a parsed conventional commit message.
type ConventionalCommit struct {
	Type     string
	Scope    string
	Message  string
	Hash     string
	Breaking bool
}

// ChangelogSection is a named section in a CHANGELOG.
type ChangelogSection string

const (
	SectionAdded   ChangelogSection = "Added"
	SectionFixed   ChangelogSection = "Fixed"
	SectionChanged ChangelogSection = "Changed"
	SectionRemoved ChangelogSection = "Removed"
)

// CommitMsgOptions controls conventional commit message validation.
type CommitMsgOptions struct {
	AllowAsterisk       bool
	AllowMultipleScopes bool
	ForceScope          bool
	Types               []string // nil uses defaultConventionalTypes
}

// CommitMsgResult is the outcome of ValidateCommitMsg.
type CommitMsgResult struct {
	Valid  bool
	Issues []string
}

// GenerateChangelogOptions controls changelog generation.
type GenerateChangelogOptions struct {
	Root   string // working directory; defaults to "."
	DryRun bool   // when true, does not write CHANGELOG.md
}

// GenerateChangelogResult is returned by GenerateChangelog.
type GenerateChangelogResult struct {
	Version     string
	CommitCount int
	EntryCount  int
	Content     string
	DryRun      bool
}

// VersionCommand is the type of semver bump to apply.
type VersionCommand string

const (
	VersionCommandSync     VersionCommand = "sync"
	VersionCommandPatch    VersionCommand = "patch"
	VersionCommandMinor    VersionCommand = "minor"
	VersionCommandMajor    VersionCommand = "major"
	VersionCommandExplicit VersionCommand = "explicit"
)

// VersionUpdate describes a version change for one package.
type VersionUpdate struct {
	Name    string
	From    string
	To      string
	Changed bool
}

// ---------------------------------------------------------------------------
// Workspace types
// ---------------------------------------------------------------------------

// FilenameRule controls the naming convention applied to a directory.
type FilenameRule struct {
	Directory  string   `json:"directory"`
	Convention string   `json:"convention"` // "kebab-case" or "snake_case"
	Exclude    []string `json:"exclude,omitempty"`
}

// WorkspacePackageConfig holds parsed fields from deno.json / package.json.
type WorkspacePackageConfig struct {
	Exports         interface{}
	Dependencies    map[string]string
	DevDependencies map[string]string
	Imports         map[string]string
	RawDeno         map[string]interface{}
	RawPackage      map[string]interface{}
}

// WorkspacePackage represents one member of a workspace.
type WorkspacePackage struct {
	Name   string
	Path   string
	Config WorkspacePackageConfig
}

// ---------------------------------------------------------------------------
// Workspace validator result types
// ---------------------------------------------------------------------------

// CircularDepsResult is the outcome of CheckCircularDeps.
type CircularDepsResult struct {
	HasCycles       bool       `json:"hasCycles"`
	Cycles          [][]string `json:"cycles"`
	PackagesChecked int        `json:"packagesChecked"`
}

// ExportNameViolation is a single naming-convention violation.
type ExportNameViolation struct {
	PackageName string `json:"packageName"`
	ExportPath  string `json:"exportPath"`
	Suggestion  string `json:"suggestion"`
}

// ExportNamesResult is the outcome of CheckExportNames.
type ExportNamesResult struct {
	IsValid         bool                  `json:"isValid"`
	Violations      []ExportNameViolation `json:"violations"`
	PackagesChecked int                   `json:"packagesChecked"`
}

// MissingExport describes a file that should appear in mod.ts but does not.
type MissingExport struct {
	PackageName string `json:"packageName"`
	File        string `json:"file"`
}

// ModExportsResult is the outcome of CheckModExports.
type ModExportsResult struct {
	IsComplete      bool            `json:"isComplete"`
	MissingExports  []MissingExport `json:"missingExports"`
	PackagesChecked int             `json:"packagesChecked"`
}

// ConfigInconsistency describes a field that differs between deno.json and package.json.
type ConfigInconsistency struct {
	PackageName  string `json:"packageName"`
	Field        string `json:"field"`
	DenoValue    string `json:"denoValue"`
	PackageValue string `json:"packageValue"`
}

// DependencyInconsistency describes a dep mismatch between package.json and deno.json.
type DependencyInconsistency struct {
	PackageName    string `json:"packageName"`
	DependencyName string `json:"dependencyName"`
	// Issue is one of: "missing_in_deno", "missing_in_package", "version_mismatch"
	Issue    string `json:"issue"`
	Expected string `json:"expected,omitempty"`
	Actual   string `json:"actual,omitempty"`
}

// PackageConfigsResult is the outcome of CheckPackageConfigs.
type PackageConfigsResult struct {
	IsConsistent              bool                      `json:"isConsistent"`
	Inconsistencies           []ConfigInconsistency     `json:"inconsistencies"`
	DependencyInconsistencies []DependencyInconsistency `json:"dependencyInconsistencies"`
	PackagesChecked           int                       `json:"packagesChecked"`
}

// DocIssue describes a documentation problem for one exported symbol.
type DocIssue struct {
	File   string `json:"file"`
	Symbol string `json:"symbol"`
	// Issue is one of: "missing-description", "empty-description", "missing-example"
	Issue string `json:"issue"`
	Line  int    `json:"line,omitempty"`
}

// DocsResult is the outcome of CheckDocs.
type DocsResult struct {
	IsValid        bool       `json:"isValid"`
	Issues         []DocIssue `json:"issues"`
	FilesChecked   int        `json:"filesChecked"`
	SymbolsChecked int        `json:"symbolsChecked"`
}
