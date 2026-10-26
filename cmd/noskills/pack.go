// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// `noskills pack` (commands/pack.ts): list, install, uninstall, inspect and
// search the built-in and remote packs.

func (l *lifecycleRun) pack(ctx context.Context, args []string) (int, error) {
	root, prefix := l.configuredPrefix()

	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}

	switch sub {
	case "list":
		return l.packList(root)
	case "install":
		return l.packInstall(ctx, root, prefix, args[1:])
	case "uninstall":
		return l.packUninstall(root, prefix, args[1:])
	case "inspect":
		return l.packInspect(ctx, prefix, args[1:])
	case "search":
		return l.packSearch(ctx, root, prefix, args[1:])
	}

	writeln(l.e.stdout, "Usage: "+prefix+" pack <list | install <name> | uninstall <name> | inspect <name> | search <query>>")

	return clifx.ExitOK, nil
}

func packFileField(pack *noskillsfx.JSObject, key string) string {
	value, ok := pack.Get(key)

	return noskillsfx.JSString(value, ok)
}

func (l *lifecycleRun) packList(root string) (int, error) {
	out := l.e.stdout

	packs, err := noskillsfx.BuiltinPacks()
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the pack
	}

	writeln(out, bold("Built-in packs:"))

	for _, pack := range packs {
		var parts []string
		if n := len(pack.RuleNames); n > 0 {
			parts = append(parts, strconv.Itoa(n)+" rules")
		}

		if n := len(pack.Concerns); n > 0 {
			word := " concern"
			if n > 1 {
				word = " concerns"
			}

			parts = append(parts, strconv.Itoa(n)+word)
		}

		writeln(out, "  ", bold(noskillsfx.JSPadEnd(pack.Name, 16)), dim(packFileField(pack.Manifest, "description")),
			dim(" ("+strings.Join(parts, ", ")+")"))
	}

	writeln(out, "")
	writeln(out, bold("Installed packs:"))

	installed := noskillsfx.InstalledPacks(noskillsfx.ReadPacksFile(root))
	if len(installed) == 0 {
		writeln(out, dim("  No packs installed."))

		return clifx.ExitOK, nil
	}

	for _, pack := range installed {
		writeln(out, "  ", green(noskillsfx.JSPadEnd(packFileField(pack, "name"), 16)), dim("v"+packFileField(pack, "version")),
			dim("  (installed "+noskillsfx.JSSlice(packFileField(pack, "installedAt"), 0, 10)+")"))
	}

	return clifx.ExitOK, nil
}

func isRemotePack(nameOrSpecifier string) bool {
	return strings.Contains(nameOrSpecifier, "/") || strings.Contains(nameOrSpecifier, ":")
}

// packFetcher fetches the files of remote packs over https.
func packFetcher() noskillsfx.PackFetcher {
	return noskillsfx.FetchPackURL(&http.Client{Timeout: noskillsfx.RegistryTimeout}) //nolint:exhaustruct // the defaults with a timeout
}

// installRequiredPacks installs the built-in packs a pack requires and
// records each one in packs.json as it lands.
func (l *lifecycleRun) installRequiredPacks(root string, requires []string, installed []*noskillsfx.JSObject) ([]*noskillsfx.JSObject, error) {
	var deps []*noskillsfx.JSObject

	for _, dep := range requires {
		all := append(slices.Clone(installed), deps...)
		if slices.ContainsFunc(all, func(p *noskillsfx.JSObject) bool { return packFileField(p, "name") == dep }) {
			continue
		}

		builtin, err := noskillsfx.FindBuiltinPack(dep)
		if err != nil {
			return nil, err //nolint:wrapcheck // the message names the pack
		}

		if builtin == nil {
			continue
		}

		writeln(l.e.stdout, dim("  Installing dependency: "+dep))

		record, err := noskillsfx.InstallBuiltinPack(root, builtin, l.e.now())
		if err != nil {
			return nil, err //nolint:wrapcheck // the message names the file
		}

		deps = append(deps, record)

		if err := noskillsfx.WritePacksFile(root, append(slices.Clone(installed), deps...)); err != nil {
			return nil, err //nolint:wrapcheck // the message names the file
		}
	}

	return deps, nil
}

func requiresOf(manifest *noskillsfx.JSObject) []string {
	value, _ := manifest.Get("requires")
	items, _ := value.([]any)

	var out []string

	for _, item := range items {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}

	return out
}

func (l *lifecycleRun) packInstall(ctx context.Context, root, prefix string, args []string) (int, error) { //nolint:cyclop,funlen // the steps of packInstall
	out := l.e.stdout

	if len(args) == 0 || args[0] == "" {
		writeln(out, red("Please provide a pack name: "), bold(prefix+" pack install typescript"))

		return clifx.ExitFailure, nil
	}

	nameOrSpecifier := args[0]
	installed := noskillsfx.InstalledPacks(noskillsfx.ReadPacksFile(root))
	remote := isRemotePack(nameOrSpecifier)

	packName := nameOrSpecifier
	if remote {
		if parsed, ok := noskillsfx.ParsePackSpecifier(nameOrSpecifier); ok {
			packName = parsed.PackPath
		}
	}

	if slices.ContainsFunc(installed, func(p *noskillsfx.JSObject) bool { return packFileField(p, "name") == packName }) {
		writeln(out, red(`Pack "`+packName+`" is already installed.`))
		writeln(out, dim("  Uninstall first to re-install."))

		return clifx.ExitFailure, nil
	}

	var (
		record *noskillsfx.JSObject
		deps   []*noskillsfx.JSObject
	)

	if remote {
		writeln(out, dim("Fetching pack from "+nameOrSpecifier+"..."))

		fetch := packFetcher()

		manifest, err := noskillsfx.FetchRemotePackManifest(ctx, fetch, nameOrSpecifier)
		if err == nil {
			deps, err = l.installRequiredPacks(root, requiresOf(manifest), installed)
		}

		if err == nil {
			record, err = noskillsfx.InstallRemotePack(ctx, fetch, root, nameOrSpecifier, manifest, l.e.now())
		}

		if err != nil {
			writeln(out, red("Failed to install: "+err.Error()))

			return clifx.ExitFailure, nil
		}
	} else {
		builtin, err := noskillsfx.FindBuiltinPack(nameOrSpecifier)
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the pack
		}

		if builtin == nil {
			writeln(out, red("Unknown pack: "+nameOrSpecifier))
			writeln(out, dim("  Available built-in packs: typescript, react, security"))

			return clifx.ExitFailure, nil
		}

		if deps, err = l.installRequiredPacks(root, requiresOf(builtin.Manifest), installed); err != nil {
			return 0, err
		}

		if record, err = noskillsfx.InstallBuiltinPack(root, builtin, l.e.now()); err != nil {
			return 0, err //nolint:wrapcheck // the message names the file
		}
	}

	if err := noskillsfx.WritePacksFile(root, append(append(slices.Clone(installed), deps...), record)); err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	synced, err := syncTools(root)
	if err != nil {
		return 0, err
	}

	if synced {
		writeln(out, dim("  Tool files synced."))
	}

	writeln(out, green("✔"), ` Pack "`+packFileField(record, "name")+`" v`+packFileField(record, "version")+" installed.")

	for _, list := range []struct{ label, key string }{{"Rules", "rules"}, {"Concerns", "concerns"}} {
		value, _ := record.Get(list.key)
		if items, _ := value.([]any); len(items) > 0 {
			names := make([]string, len(items))
			for i, item := range items {
				names[i] = noskillsfx.JSString(item, true)
			}

			writeln(out, dim("  "+list.label+": "+strings.Join(names, ", ")))
		}
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) packUninstall(root, prefix string, args []string) (int, error) {
	out := l.e.stdout

	if len(args) == 0 || args[0] == "" {
		writeln(out, red("Please provide a pack name: "), bold(prefix+" pack uninstall typescript"))

		return clifx.ExitFailure, nil
	}

	name := args[0]
	installed := noskillsfx.InstalledPacks(noskillsfx.ReadPacksFile(root))

	at := slices.IndexFunc(installed, func(p *noskillsfx.JSObject) bool { return packFileField(p, "name") == name })
	if at == -1 {
		writeln(out, red(`Pack "`+name+`" is not installed.`))

		return clifx.ExitFailure, nil
	}

	var dependents []string

	for _, other := range installed {
		otherName := packFileField(other, "name")
		if otherName == name {
			continue
		}

		builtin, err := noskillsfx.FindBuiltinPack(otherName)
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the pack
		}

		if builtin != nil && slices.Contains(requiresOf(builtin.Manifest), name) {
			dependents = append(dependents, otherName)
		}
	}

	if len(dependents) > 0 {
		writeln(out, red(`Warning: pack "`+name+`" is required by: `+strings.Join(dependents, ", ")))
	}

	noskillsfx.UninstallPackFiles(root, installed[at])

	kept := slices.DeleteFunc(slices.Clone(installed), func(p *noskillsfx.JSObject) bool { return packFileField(p, "name") == name })
	if err := noskillsfx.WritePacksFile(root, kept); err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	synced, err := syncTools(root)
	if err != nil {
		return 0, err
	}

	if synced {
		writeln(out, dim("  Tool files synced."))
	}

	writeln(out, green("✔"), ` Pack "`+name+`" uninstalled.`)

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) packInspect(ctx context.Context, prefix string, args []string) (int, error) { //nolint:cyclop,funlen // the sections of packInspect
	out := l.e.stdout

	if len(args) == 0 || args[0] == "" {
		writeln(out, red("Please provide a pack name: "), bold(prefix+" pack inspect typescript"))

		return clifx.ExitFailure, nil
	}

	nameOrSpecifier := args[0]

	var (
		manifest *noskillsfx.JSObject
		builtin  *noskillsfx.BuiltinPack
	)

	if isRemotePack(nameOrSpecifier) {
		fetched, err := noskillsfx.FetchRemotePackManifest(ctx, packFetcher(), nameOrSpecifier)
		if err != nil {
			writeln(out, red("Failed to fetch: "+err.Error()))

			return clifx.ExitFailure, nil
		}

		manifest = fetched
	} else {
		found, err := noskillsfx.FindBuiltinPack(nameOrSpecifier)
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the pack
		}

		if found == nil {
			writeln(out, red("Unknown pack: "+nameOrSpecifier))

			return clifx.ExitFailure, nil
		}

		builtin, manifest = found, found.Manifest
	}

	writeln(out, bold("Pack: "+packFileField(manifest, "name")), dim(" v"+packFileField(manifest, "version")))
	writeln(out, "Description: "+packFileField(manifest, "description"))

	if author, ok := manifest.Get("author"); ok {
		writeln(out, "Author: "+noskillsfx.JSString(author, true))
	}

	if tags := stringList(manifest, "tags"); len(tags) > 0 {
		writeln(out, "Tags: "+strings.Join(tags, ", "))
	}

	rules := stringList(manifest, "rules")

	writeln(out, "")
	writeln(out, bold("Rules ("+strconv.Itoa(len(rules))+"):"))

	if builtin != nil {
		for _, name := range builtin.RuleNames {
			writeln(out, "  - "+name+": ", dim(`"`+builtin.RuleContents[name]+`"`))
		}
	} else {
		for _, rule := range rules {
			writeln(out, "  - "+strings.TrimSuffix(strings.TrimPrefix(rule, "rules/"), ".md"))
		}
	}

	concernCount := len(stringList(manifest, "concerns"))

	writeln(out, "")
	writeln(out, bold("Concerns ("+strconv.Itoa(concernCount)+"):"))

	switch {
	case builtin != nil && len(builtin.Concerns) > 0:
		for _, concern := range builtin.Concerns {
			writeln(out, "  - "+packFileField(concern, "id")+": "+packFileField(concern, "name"))

			if criteria := stringList(concern, "acceptanceCriteria"); len(criteria) > 0 {
				writeln(out, dim(`    ACs: "`+strings.Join(criteria, `", "`)+`"`))
			}
		}
	case concernCount == 0:
		writeln(out, dim("  none"))
	}

	folderRules := 0

	if value, ok := manifest.Get("folderRules"); ok {
		if o, isObject := value.(*noskillsfx.JSObject); isObject {
			folderRules = len(o.Keys())
		}
	}

	writeln(out, "")

	if folderRules > 0 {
		writeln(out, "Folder rules: "+strconv.Itoa(folderRules))
	} else {
		writeln(out, "Folder rules: none")
	}

	if requires := stringList(manifest, "requires"); len(requires) > 0 {
		writeln(out, "Dependencies: "+strings.Join(requires, ", "))
	} else {
		writeln(out, "Dependencies: none")
	}

	return clifx.ExitOK, nil
}

// stringList reads a list field as the strings JavaScript would join.
func stringList(o *noskillsfx.JSObject, key string) []string {
	value, _ := o.Get(key)
	items, _ := value.([]any)

	out := make([]string, len(items))
	for i, item := range items {
		out[i] = noskillsfx.JSString(item, true)
	}

	return out
}

func (l *lifecycleRun) packSearch(ctx context.Context, root, prefix string, args []string) (int, error) {
	out := l.e.stdout

	query := ""
	if len(args) > 0 {
		query = strings.ToLower(args[0])
	}

	if query == "" {
		writeln(out, red("Please provide a search query: "), bold(prefix+" pack search typescript"))

		return clifx.ExitFailure, nil
	}

	packs, err := noskillsfx.BuiltinPacks()
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the pack
	}

	writeln(out, bold("Matching packs:"))

	found := false
	matches := func(name, description string, tags []string) bool {
		return strings.Contains(name, query) || slices.ContainsFunc(tags, func(t string) bool { return strings.Contains(t, query) }) ||
			strings.Contains(strings.ToLower(description), query)
	}

	for _, pack := range packs {
		description := packFileField(pack.Manifest, "description")
		if matches(pack.Name, description, stringList(pack.Manifest, "tags")) {
			writeln(out, "  ", bold(noskillsfx.JSPadEnd(pack.Name, 16)), dim(description), dim("  [builtin]"))

			found = true
		}
	}

	if section, ok := noskillsfx.ReadManifestSection(root); ok {
		if setting, present := section.Get("packRegistry"); present {
			entries, err := l.searchRegistry(ctx, setting)
			if err != nil {
				writeln(out, yellow("  Remote registry not searched: "+err.Error()))
			}

			for _, entry := range entries {
				if matches(entry.Name, entry.Description, entry.Tags) {
					writeln(out, "  ", bold(noskillsfx.JSPadEnd(entry.Name, 16)), dim(entry.Description), dim("  ["+entry.Source+"]"))

					found = true
				}
			}
		}
	}

	if !found {
		writeln(out, dim(`  No packs matching "`+query+`" found.`))
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) searchRegistry(ctx context.Context, setting any) ([]noskillsfx.PackRegistryEntry, error) {
	u, err := noskillsfx.ParseRegistryURL(setting)
	if err != nil {
		return nil, err //nolint:wrapcheck // the message is the TypeScript one
	}

	ctx, cancel := context.WithTimeout(ctx, noskillsfx.RegistryTimeout+time.Second)
	defer cancel()

	return noskillsfx.FetchRegistry(ctx, noskillsfx.NewRegistryClient(u), u) //nolint:wrapcheck // the message names the URL
}
