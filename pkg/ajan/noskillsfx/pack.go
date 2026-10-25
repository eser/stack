// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Packs (commands/pack.ts, pack/schema.ts, defaults/packs): bundles of
// rules, concerns and folder rules that `noskills pack install` copies into
// .eser/ and records in .eser/packs.json. The built-in packs are embedded
// byte for byte from pkg/@eserstack/noskills/defaults/packs (a test keeps
// them equal); file names are snake_case here, as this tree requires.

//go:embed defaults/packs
var defaultPackFiles embed.FS

// PacksFile is the installed-pack record, relative to the project.
const PacksFile = eserDir + "/packs.json"

// BuiltinPack is a built-in pack with its rule and concern contents.
type BuiltinPack struct {
	Name     string
	Manifest *JSObject
	// RuleNames are the rule names in the manifest's order, and
	// RuleContents their text without the final newline.
	RuleNames    []string
	RuleContents map[string]string
	Concerns     []*JSObject
}

// builtinPackNames are the built-in packs in BUILTIN_PACKS order.
func builtinPackNames() []string {
	return []string{"typescript", "react", "security"}
}

// embeddedName is a pack file's embedded name: its base name in snake_case.
func embeddedName(rel string) string {
	dir, base := path.Split(rel)

	return dir + strings.ReplaceAll(base, "-", "_")
}

// packRuleName is a rule's name from its path in the manifest:
// rules/<name>.md.
func packRuleName(rulePath string) string {
	return strings.TrimSuffix(strings.TrimPrefix(rulePath, "rules/"), ".md")
}

func readEmbeddedPackFile(pack, rel string) (string, error) {
	data, err := defaultPackFiles.ReadFile(path.Join("defaults/packs", pack, embeddedName(rel)))
	if err != nil {
		return "", fmt.Errorf("read the built-in pack file %s/%s: %w", pack, rel, err)
	}

	return string(data), nil
}

func loadBuiltinPack(name string) (*BuiltinPack, error) {
	manifestText, err := readEmbeddedPackFile(name, "pack.json")
	if err != nil {
		return nil, err
	}

	parsed, err := parseJSON(manifestText)
	if err != nil {
		return nil, fmt.Errorf("parse the built-in pack %s: %w", name, err)
	}

	manifest, _ := parsed.(*JSObject)
	pack := &BuiltinPack{Name: name, Manifest: manifest, RuleNames: nil, RuleContents: map[string]string{}, Concerns: nil}

	for _, rulePath := range stringsOf(manifest.arr("rules")) {
		content, err := readEmbeddedPackFile(name, rulePath)
		if err != nil {
			return nil, err
		}

		ruleName := packRuleName(rulePath)
		pack.RuleNames = append(pack.RuleNames, ruleName)
		pack.RuleContents[ruleName] = strings.TrimSuffix(content, "\n")
	}

	for _, concernPath := range stringsOf(manifest.arr("concerns")) {
		content, err := readEmbeddedPackFile(name, concernPath)
		if err != nil {
			return nil, err
		}

		concern, err := parseJSON(content)
		if err != nil {
			return nil, fmt.Errorf("parse the built-in concern %s/%s: %w", name, concernPath, err)
		}

		if o, ok := concern.(*JSObject); ok {
			pack.Concerns = append(pack.Concerns, o)
		}
	}

	return pack, nil
}

// BuiltinPacks returns the built-in packs in their order.
func BuiltinPacks() ([]*BuiltinPack, error) {
	packs := make([]*BuiltinPack, 0, len(builtinPackNames()))

	for _, name := range builtinPackNames() {
		pack, err := loadBuiltinPack(name)
		if err != nil {
			return nil, err
		}

		packs = append(packs, pack)
	}

	return packs, nil
}

// FindBuiltinPack returns the built-in pack with that name, or nil.
func FindBuiltinPack(name string) (*BuiltinPack, error) {
	packs, err := BuiltinPacks()
	if err != nil {
		return nil, err
	}

	for _, pack := range packs {
		if pack.Name == name {
			return pack, nil
		}
	}

	return nil, nil //nolint:nilnil // no such pack is not an error
}

// ReadPacksFile is readPacksFile: the parsed file, or {installed: []} when
// it cannot be read.
func ReadPacksFile(root string) *JSObject {
	parsed, ok := readJSONFile(projectPath(root, PacksFile))
	if o, isObject := parsed.(*JSObject); ok && isObject {
		return o
	}

	return JSObjectOf("installed", []any{})
}

// InstalledPacks are the objects of the file's installed list.
func InstalledPacks(file *JSObject) []*JSObject {
	return objectsOf(file.arr("installed"))
}

// WritePacksFile writes .eser/packs.json.
func WritePacksFile(root string, installed []*JSObject) error {
	return writeSyncFile(projectPath(root, PacksFile), jsonStringifyIndent(JSObjectOf("installed", anyOfObjects(installed)))+"\n")
}

var concernNumberPrefix = regexp.MustCompile(`^(\d+)-`) //nolint:gochecknoglobals // compiled once

// nextConcernPrefix is one more than the largest number prefix of the
// project's concern files.
func nextConcernPrefix(root string) int {
	highest := 0

	entries, err := os.ReadDir(projectPath(root, concernsDir))
	if err != nil {
		return 1
	}

	for _, entry := range entries {
		if !entry.Type().IsRegular() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		if match := concernNumberPrefix.FindStringSubmatch(entry.Name()); match != nil {
			if n, ok := JSParseInt(match[1]); ok && n > highest {
				highest = n
			}
		}
	}

	return highest + 1
}

func paddedPrefix(n int) string {
	s := strconv.Itoa(n)
	for len(s) < 3 {
		s = "0" + s
	}

	return s
}

var errUnsafePackName = errors.New("must be a single file name")

// checkPackFileName refuses a name that would leave its folder: a pack's
// name, rule names and concern ids become file names.
func checkPackFileName(what, name string) error {
	if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `/\`) || strings.Contains(name, "\x00") {
		return fmt.Errorf("%s %q %w", what, name, errUnsafePackName)
	}

	return nil
}

func installedPack(name, version, source string, now time.Time, rules, concerns, folderRules []string) *JSObject {
	return JSObjectOf(
		"name", name,
		"version", version,
		"installedAt", now.UTC().Format("2006-01-02T15:04:05.000Z"),
		"source", source,
		"rules", anyOf(nonNil(rules)),
		"concerns", anyOf(nonNil(concerns)),
		"folderRules", anyOf(nonNil(folderRules)),
	)
}

// InstallBuiltinPack copies a built-in pack's rules (as pack-<name>-<rule>.md)
// and concerns (with the next number prefixes) into the project.
func InstallBuiltinPack(root string, pack *BuiltinPack, now time.Time) (*JSObject, error) {
	if err := os.MkdirAll(projectPath(root, rulesDir), 0o750); err != nil {
		return nil, fmt.Errorf("create %s: %w", rulesDir, err)
	}

	rules := make([]string, 0, len(pack.RuleNames))

	for _, ruleName := range pack.RuleNames {
		fileName := "pack-" + pack.Name + "-" + ruleName + ".md"
		if err := writeSyncFile(projectPath(root, rulesDir+"/"+fileName), pack.RuleContents[ruleName]+"\n"); err != nil {
			return nil, err
		}

		rules = append(rules, fileName)
	}

	var concerns []string

	if len(pack.Concerns) > 0 {
		first := nextConcernPrefix(root)

		for i, concern := range pack.Concerns {
			fileName := paddedPrefix(first+i) + "-" + jsString(concern.getOr("id")) + ".json"
			if err := writeSyncFile(projectPath(root, concernsDir+"/"+fileName), jsonStringifyIndent(concern)+"\n"); err != nil {
				return nil, err
			}

			concerns = append(concerns, fileName)
		}
	}

	return installedPack(pack.Name, jsString(pack.Manifest.getOr("version")), "builtin", now, rules, concerns, nil), nil
}

// PackSpecifier is a remote pack's place: github:owner/repo#pack, gh: or
// owner/repo#pack, always on the main branch.
type PackSpecifier struct {
	Owner, Repo, Ref, PackPath string
}

// ParsePackSpecifier is parsePackSpecifier; ok is false for another form.
func ParsePackSpecifier(specifier string) (PackSpecifier, bool) {
	cleaned := strings.TrimPrefix(specifier, "github:")
	cleaned = strings.TrimPrefix(cleaned, "gh:")

	repoPath, packPath, found := strings.Cut(cleaned, "#")
	if !found {
		return PackSpecifier{}, false //nolint:exhaustruct // no specifier
	}

	owner, repo, found := strings.Cut(repoPath, "/")
	if !found || owner == "" || repo == "" || packPath == "" {
		return PackSpecifier{}, false //nolint:exhaustruct // no specifier
	}

	return PackSpecifier{Owner: owner, Repo: repo, Ref: "main", PackPath: packPath}, true
}

// fileURL is where a remote pack's file is served.
func (s PackSpecifier) fileURL(file string) string { //nolint:gocritic // hugeParam: four strings
	return "https://raw.githubusercontent.com/" + s.Owner + "/" + s.Repo + "/" + s.Ref + "/packs/" + s.PackPath + "/" + file
}

// PackFetcher fetches a URL and returns the HTTP status and the body.
type PackFetcher func(ctx context.Context, url string) (status int, body string, err error)

func fetchPackFile(ctx context.Context, fetch PackFetcher, specifier, file string) (string, error) {
	parsed, ok := ParsePackSpecifier(specifier)
	if !ok {
		return "", fmt.Errorf("Invalid pack specifier: %s", specifier) //nolint:err113,staticcheck,revive // the TypeScript message
	}

	status, body, err := fetch(ctx, parsed.fileURL(file))
	if err != nil {
		return "", err
	}

	if status < 200 || status > 299 {
		return "", fmt.Errorf("Could not fetch %s from %s. HTTP %d", file, specifier, status) //nolint:err113,staticcheck,revive // the TypeScript message
	}

	return body, nil
}

// FetchRemotePackManifest is fetchRemotePackManifest: the pack.json of a
// remote pack, checked for a name, a version and a description.
func FetchRemotePackManifest(ctx context.Context, fetch PackFetcher, specifier string) (*JSObject, error) {
	parsed, ok := ParsePackSpecifier(specifier)
	if !ok {
		return nil, fmt.Errorf("Invalid pack specifier: %s. Expected format: github:owner/repo#pack-name", specifier) //nolint:err113,staticcheck,revive // the TypeScript message
	}

	status, body, err := fetch(ctx, parsed.fileURL("pack.json"))
	if err != nil {
		return nil, err
	}

	if status < 200 || status > 299 {
		return nil, fmt.Errorf("Could not fetch pack from %s. HTTP %d", specifier, status) //nolint:err113,staticcheck,revive // the TypeScript message
	}

	data, err := parseJSON(body)
	if err != nil {
		return nil, fmt.Errorf("the pack.json of %s is not JSON: %w", specifier, err)
	}

	return validatePackManifest(data)
}

func validatePackManifest(data any) (*JSObject, error) {
	o, _ := data.(*JSObject)

	for _, field := range []string{"name", "version", "description"} {
		if s, ok := o.strOK(field); !ok || s == "" {
			return nil, fmt.Errorf("Pack manifest must have a non-empty '%s' field", field) //nolint:err113,staticcheck,revive // the TypeScript message
		}
	}

	return o, nil
}

// InstallRemotePack fetches a remote pack's files one at a time and writes
// them into the project. Every name that becomes a file name is checked,
// and the folder rules are written through os.Root, so a pack cannot write
// outside the project.
func InstallRemotePack(ctx context.Context, fetch PackFetcher, root, specifier string, manifest *JSObject, now time.Time) (*JSObject, error) { //nolint:cyclop,funlen // the three kinds of pack file, in order
	name := manifest.str("name")
	if err := checkPackFileName("pack name", name); err != nil {
		return nil, err
	}

	if err := os.MkdirAll(projectPath(root, rulesDir), 0o750); err != nil {
		return nil, fmt.Errorf("create %s: %w", rulesDir, err)
	}

	var rules, concerns, folderRules []string

	for _, rulePath := range stringsOf(manifest.arr("rules")) {
		content, err := fetchPackFile(ctx, fetch, specifier, rulePath)
		if err != nil {
			return nil, err
		}

		ruleName := packRuleName(rulePath)
		if err := checkPackFileName("rule", ruleName); err != nil {
			return nil, err
		}

		fileName := "pack-" + name + "-" + ruleName + ".md"
		if err := writeSyncFile(projectPath(root, rulesDir+"/"+fileName), content); err != nil {
			return nil, err
		}

		rules = append(rules, fileName)
	}

	if concernPaths := stringsOf(manifest.arr("concerns")); len(concernPaths) > 0 {
		prefix := nextConcernPrefix(root)

		for _, concernPath := range concernPaths {
			content, err := fetchPackFile(ctx, fetch, specifier, concernPath)
			if err != nil {
				return nil, err
			}

			parsed, err := parseJSON(content)
			if err != nil {
				return nil, fmt.Errorf("%s in %s is not JSON: %w", concernPath, specifier, err)
			}

			var definition ConcernDefinition
			if err := json.Unmarshal([]byte(content), &definition); err == nil {
				if scopeErr := ValidateConcernScopes(&definition); scopeErr != nil {
					return nil, fmt.Errorf("%s in %s is not a valid concern: %w", concernPath, specifier, scopeErr)
				}
			}

			id := JSString(FieldOf(parsed, "id"))
			if err := checkPackFileName("concern id", id); err != nil {
				return nil, err
			}

			fileName := paddedPrefix(prefix) + "-" + id + ".json"
			if err := writeSyncFile(projectPath(root, concernsDir+"/"+fileName), content); err != nil {
				return nil, err
			}

			concerns = append(concerns, fileName)
			prefix++
		}
	}

	if folders := manifest.obj("folderRules"); folders != nil {
		project, err := os.OpenRoot(root)
		if err != nil {
			return nil, fmt.Errorf("open the project %s: %w", root, err)
		}
		defer func() { _ = project.Close() }()

		for _, targetDir := range folders.Keys() {
			sourcePath := jsString(folders.getOr(targetDir))

			content, err := fetchPackFile(ctx, fetch, specifier, sourcePath)
			if err != nil {
				return nil, err
			}

			if err := writeInRoot(project, targetDir, ".folder-rules.md", content); err != nil {
				return nil, err
			}

			folderRules = append(folderRules, targetDir+"/.folder-rules.md")
		}
	}

	return installedPack(name, jsString(manifest.getOr("version")), specifier, now, rules, concerns, folderRules), nil
}

// writeInRoot writes dir/name inside the project, refusing a dir that
// leaves it.
func writeInRoot(project *os.Root, dir, name, content string) error {
	rel := filepath.FromSlash(dir)

	if err := project.MkdirAll(rel, 0o750); err != nil {
		return fmt.Errorf("create the folder %s for its folder rules: %w", dir, err)
	}

	if err := project.WriteFile(filepath.Join(rel, name), []byte(content), 0o644); err != nil {
		return fmt.Errorf("write %s/%s: %w", dir, name, err)
	}

	return nil
}

// UninstallPackFiles removes an installed pack's files; one already gone is
// fine. The folder rules are removed through os.Root.
func UninstallPackFiles(root string, installed *JSObject) {
	for _, rule := range stringsOf(installed.arr("rules")) {
		if !strings.ContainsAny(rule, `/\`) {
			_ = os.Remove(projectPath(root, rulesDir+"/"+rule))
		}
	}

	for _, concern := range stringsOf(installed.arr("concerns")) {
		if !strings.ContainsAny(concern, `/\`) {
			_ = os.Remove(projectPath(root, concernsDir+"/"+concern))
		}
	}

	project, err := os.OpenRoot(root)
	if err != nil {
		return
	}
	defer func() { _ = project.Close() }()

	for _, folderRule := range stringsOf(installed.arr("folderRules")) {
		// A file that is already gone, or outside the project, stays as it is.
		_ = project.Remove(filepath.FromSlash(folderRule))
	}
}
