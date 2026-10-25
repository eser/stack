// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// configFilePriority is the TypeScript loader's order (package/types.ts
// CONFIG_FILE_PRIORITY): a field's value comes from the first file that has it.
var configFilePriority = []string{"deno.json", "deno.jsonc", "jsr.json", "jsr.jsonc", "package.json"} //nolint:gochecknoglobals

var (
	errNoWorkspaces    = errors.New("the root package config has no workspaces")
	errExplicitVersion = errors.New("an explicit version is required")
)

// FileEdit is one file a release step would write: its path relative to the
// root, and its content before (nil when the file is new) and after.
type FileEdit struct {
	Path   string
	Before []byte
	After  []byte
}

// PackageVersionUpdate is one package's version before and after a bump.
type PackageVersionUpdate struct {
	Name    string
	From    string
	To      string
	Changed bool
}

// VersionPlan is what a versions command would do.
type VersionPlan struct {
	Command VersionCommand
	Target  string
	Updates []PackageVersionUpdate
	Edits   []FileEdit
}

type configFile struct {
	path    string // relative to the root
	before  []byte
	content orderedValue
}

type packageConfig struct {
	name    string
	version string
	files   []configFile
}

// loadPackageConfig reads the config files of dir in priority order; it
// returns false when dir has none.
func loadPackageConfig(root, dir string) (packageConfig, bool, error) {
	var config packageConfig

	for _, name := range configFilePriority {
		rel := filepath.ToSlash(filepath.Join(dir, name))

		data, err := os.ReadFile(filepath.Join(root, rel)) //nolint:gosec // G304: a config file of the workspace
		if errors.Is(err, os.ErrNotExist) {
			continue
		}

		if err != nil {
			return config, false, fmt.Errorf("read %s: %w", rel, err)
		}

		source := data
		if strings.HasSuffix(name, ".jsonc") {
			source = stripJSONComments(data)
		}

		content, err := decodeOrdered(source)
		if err != nil {
			return config, false, fmt.Errorf("parse %s: %w", rel, err)
		}

		if content.kind != 'o' {
			return config, false, fmt.Errorf("%s: %w", rel, errNotJSONObject)
		}

		config.files = append(config.files, configFile{path: rel, before: data, content: content})

		if v, ok := content.get("version"); ok && config.version == "" {
			config.version, _ = v.scalar.(string)
		}

		if v, ok := content.get("name"); ok && config.name == "" {
			config.name, _ = v.scalar.(string)
		}
	}

	return config, len(config.files) > 0, nil
}

// workspaceDirs expands the root's workspace patterns ("pkg/@eserstack/*")
// into package directories relative to the root, sorted.
func workspaceDirs(root string, rootConfig packageConfig) ([]string, error) {
	var patterns []string

	for _, file := range rootConfig.files {
		for _, key := range []string{"workspaces", "workspace"} {
			if v, ok := file.content.get(key); ok && v.kind == 'a' {
				for _, item := range v.array {
					if s, ok := item.scalar.(string); ok {
						patterns = append(patterns, s)
					}
				}
			}
		}

		if len(patterns) > 0 {
			break
		}
	}

	if len(patterns) == 0 {
		return nil, errNoWorkspaces
	}

	var dirs []string

	for _, pattern := range patterns {
		matches, err := filepath.Glob(filepath.Join(root, filepath.FromSlash(pattern)))
		if err != nil {
			return nil, fmt.Errorf("workspace pattern %q: %w", pattern, err)
		}

		for _, match := range matches {
			if info, err := os.Stat(match); err == nil && info.IsDir() {
				rel, _ := filepath.Rel(root, match)
				dirs = append(dirs, filepath.ToSlash(rel))
			}
		}
	}

	slices.Sort(dirs)

	return slices.Compact(dirs), nil
}

// PlanVersions computes what the versions command does in root: the target
// version (the highest workspace version bumped by command, the highest
// itself for sync, or explicit), each package's update, and the edits: every
// config file that holds a different version, rewritten as the TypeScript
// writer does (JSON.stringify with two spaces and a final newline), and the
// VERSION file. Nothing is written; ApplyEdits writes the edits.
func PlanVersions(root string, command VersionCommand, explicit string) (*VersionPlan, error) {
	rootConfig, ok, err := loadPackageConfig(root, ".")
	if err != nil {
		return nil, err
	}

	if !ok {
		return nil, fmt.Errorf("%w: no package config in %s", errNoWorkspaces, root)
	}

	dirs, err := workspaceDirs(root, rootConfig)
	if err != nil {
		return nil, err
	}

	packages := []packageConfig{rootConfig}

	for _, dir := range dirs {
		config, ok, err := loadPackageConfig(root, dir)
		if err != nil {
			return nil, err
		}

		if ok {
			packages = append(packages, config)
		}
	}

	highest := "0.0.0"

	for _, pkg := range packages {
		version := pkg.version
		if version == "" {
			version = "0.0.0"
		}

		if CompareVersions(version, highest) > 0 {
			highest = version
		}
	}

	var target string

	switch command {
	case VersionCommandExplicit:
		if explicit == "" {
			return nil, errExplicitVersion
		}

		if _, _, _, _, err := ParseSemver(explicit); err != nil {
			return nil, err
		}

		target = explicit
	case VersionCommandSync:
		target = highest
	default:
		target, err = BumpVersion(highest, command, "")
		if err != nil {
			return nil, err
		}

		// BumpVersion answers in tag form; package configs hold the bare version.
		target = strings.TrimPrefix(target, "v")
	}

	plan := &VersionPlan{Command: command, Target: target} //nolint:exhaustruct

	for i, pkg := range packages {
		name := pkg.name
		if i == 0 && name == "" {
			name = "(root)"
		}

		from := pkg.version
		if from == "" {
			from = "0.0.0"
		}

		plan.Updates = append(plan.Updates, PackageVersionUpdate{Name: name, From: from, To: target, Changed: from != target})

		for _, file := range pkg.files {
			value, ok := file.content.get("version")
			if !ok {
				continue
			}

			if current, _ := value.scalar.(string); current == target {
				continue
			}

			value.kind, value.scalar, value.object, value.array = 's', target, nil, nil

			plan.Edits = append(plan.Edits, FileEdit{Path: file.path, Before: file.before, After: file.content.stringify()})
		}
	}

	versionFile, err := os.ReadFile(filepath.Join(root, "VERSION")) //nolint:gosec // G304: the workspace's VERSION file
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read VERSION: %w", err)
	}

	if strings.TrimSpace(string(versionFile)) != target {
		before := versionFile
		if errors.Is(err, os.ErrNotExist) {
			before = nil
		}

		plan.Edits = append(plan.Edits, FileEdit{Path: "VERSION", Before: before, After: []byte(target + "\n")})
	}

	return plan, nil
}

// ApplyEdits writes each edit's After content under root.
func ApplyEdits(root string, edits []FileEdit) error {
	var failed []error

	for _, edit := range edits {
		path := filepath.Join(root, filepath.FromSlash(edit.Path))
		if err := os.WriteFile(path, edit.After, 0o644); err != nil { //nolint:gosec // G306: a repository file
			failed = append(failed, fmt.Errorf("write %s: %w", edit.Path, err))
		}
	}

	return errors.Join(failed...)
}
