// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"context"
	"encoding/json"

	"github.com/eser/stack/pkg/ajan/collectorfx"
)

// ---------------------------------------------------------------------------
// Collector bridge
// ---------------------------------------------------------------------------

type collectorSpecifierRequest struct {
	Specifier string   `json:"specifier"`
	Used      []string `json:"used,omitempty"`
}

type collectorSpecifierResponse struct {
	Identifier string `json:"identifier,omitempty"`
	Error      string `json:"error,omitempty"`
}

type collectorWalkRequest struct {
	Dir               string `json:"dir"`
	IgnoreFilePattern string `json:"ignoreFilePattern,omitempty"`
}

type collectorFileJSON struct {
	RelPath string `json:"relPath"`
	AbsPath string `json:"absPath"`
}

type collectorWalkResponse struct {
	Files []collectorFileJSON `json:"files,omitempty"`
	Error string              `json:"error,omitempty"`
}

type collectorManifestRequest struct {
	Entries []collectorManifestEntryJSON `json:"entries"`
}

type collectorManifestEntryJSON struct {
	RelPath string   `json:"relPath"`
	Exports []string `json:"exports,omitempty"`
}

type collectorManifestResponse struct {
	Source string `json:"source,omitempty"`
	Error  string `json:"error,omitempty"`
}

// bridgeCollectorSpecifierToIdentifier converts a file-path specifier to a valid JS identifier.
func bridgeCollectorSpecifierToIdentifier(requestJSON string) string {
	var req collectorSpecifierRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(collectorSpecifierResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	// Rebuild the used set from the provided slice.
	used := make(map[string]struct{}, len(req.Used))
	for _, u := range req.Used {
		used[u] = struct{}{}
	}

	ident := collectorfx.SpecifierToIdentifier(req.Specifier, used)

	return marshalResponse(collectorSpecifierResponse{Identifier: ident}) //nolint:exhaustruct
}

// bridgeCollectorWalkFiles walks a directory for collectible JS/TS files.
func bridgeCollectorWalkFiles(requestJSON string) string {
	var req collectorWalkRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(collectorWalkResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	files, err := collectorfx.WalkCollectableFiles(context.Background(), collectorfx.WalkOptions{
		BaseDir:           req.Dir,
		IgnoreFilePattern: req.IgnoreFilePattern,
	})
	if err != nil {
		return marshalResponse(collectorWalkResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonFiles := make([]collectorFileJSON, 0, len(files))
	for _, f := range files {
		jsonFiles = append(jsonFiles, collectorFileJSON{
			RelPath: f.RelPath,
			AbsPath: f.AbsPath,
		})
	}

	return marshalResponse(collectorWalkResponse{Files: jsonFiles}) //nolint:exhaustruct
}

// bridgeCollectorGenerateManifest generates TypeScript manifest source from entries.
func bridgeCollectorGenerateManifest(requestJSON string) string {
	var req collectorManifestRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(collectorManifestResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	entries := make([]collectorfx.ManifestEntry, 0, len(req.Entries))
	for _, e := range req.Entries {
		entries = append(entries, collectorfx.ManifestEntry{
			RelPath: e.RelPath,
			Exports: e.Exports,
		})
	}

	src := collectorfx.GenerateManifestSource(entries)

	return marshalResponse(collectorManifestResponse{Source: src}) //nolint:exhaustruct
}

func init() {
	register("collectorSpecifierToIdentifier", bridgeCollectorSpecifierToIdentifier)
	register("collectorWalkFiles", bridgeCollectorWalkFiles)
	register("collectorGenerateManifest", bridgeCollectorGenerateManifest)
}
