// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

// CollectableFile represents a JS/TS file eligible for dynamic import collection.
type CollectableFile struct {
	// RelPath is the path relative to the base directory, using forward slashes.
	RelPath string
	// AbsPath is the absolute filesystem path.
	AbsPath string
}

// ManifestEntry represents one file's collected exports in a manifest.
type ManifestEntry struct {
	// RelPath is the file's path relative to the base directory.
	RelPath string
	// Exports are the names the manifest refers to on the file's namespace,
	// one per collected export. @eserstack/collector sends the name of each
	// export's value (a function's name), not the export's own name.
	Exports []string
}

// WalkOptions controls which files are discovered for collection.
type WalkOptions struct {
	// BaseDir is the root directory to walk (defaults to ".").
	BaseDir string
	// GlobFilter is an optional pattern applied to relative paths (e.g. "routes/**/*.ts").
	GlobFilter string
	// IgnoreFilePattern is an optional regex applied to relative paths to skip files.
	IgnoreFilePattern string
}
