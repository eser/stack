// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package formatfx provides a pluggable format registry for serializing and
// deserializing structured data.
//
// Built-in formats: JSON, JSONL (newline-delimited JSON), CSV, YAML, and TOML.
//
// Usage:
//
//	formatfx.RegisterBuiltinFormats()
//
//	f, err := formatfx.GetFormat("json")
//	raw, err := f.WriteItem(myData, nil)
package formatfx

// RegisterBuiltinFormats registers all built-in formats (JSON, JSONL, CSV,
// YAML, TOML) into DefaultRegistry. Safe to call multiple times.
func RegisterBuiltinFormats() {
	DefaultRegistry.Register(JSONFormat)
	DefaultRegistry.Register(JSONLFormat)
	DefaultRegistry.Register(CSVFormat)
	DefaultRegistry.Register(YAMLFormat)
	DefaultRegistry.Register(TOMLFormat)
}
