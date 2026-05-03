// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"strings"
	"sync"
)

// Registry is a thread-safe store of Format implementations.
type Registry struct {
	formats     map[string]Format // keyed by format name
	byExtension map[string]string // extension (no dot) -> format name
	mu          sync.RWMutex
}

// DefaultRegistry is the package-level registry used by RegisterBuiltinFormats.
var DefaultRegistry = NewRegistry()

// NewRegistry creates an empty Registry.
func NewRegistry() *Registry {
	return &Registry{
		formats:     make(map[string]Format),
		byExtension: make(map[string]string),
		mu:          sync.RWMutex{},
	}
}

// Register adds a format to the registry, indexing it by name and all extensions.
func (r *Registry) Register(format Format) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.formats[format.Name()] = format

	for _, ext := range format.Extensions() {
		r.byExtension[strings.TrimPrefix(ext, ".")] = format.Name()
	}
}

// Unregister removes a format (and its extension mappings) from the registry.
func (r *Registry) Unregister(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	f, ok := r.formats[name]
	if !ok {
		return
	}

	for _, ext := range f.Extensions() {
		delete(r.byExtension, strings.TrimPrefix(ext, "."))
	}

	delete(r.formats, name)
}

// Get looks up a format by name or file extension.
// The extension may include a leading dot (e.g. ".json") or omit it (e.g. "json").
func (r *Registry) Get(nameOrExtension string) (Format, bool) { //nolint:ireturn
	r.mu.RLock()
	defer r.mu.RUnlock()

	key := strings.TrimPrefix(nameOrExtension, ".")

	if f, ok := r.formats[key]; ok {
		return f, true
	}

	if name, ok := r.byExtension[key]; ok {
		f, ok := r.formats[name]

		return f, ok
	}

	return nil, false
}

// List returns all registered formats in arbitrary order.
func (r *Registry) List() []Format {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]Format, 0, len(r.formats))

	for _, f := range r.formats {
		result = append(result, f)
	}

	return result
}

// Has reports whether a format name or extension is registered.
func (r *Registry) Has(nameOrExtension string) bool {
	_, ok := r.Get(nameOrExtension)

	return ok
}

// Clear removes all formats from the registry.
func (r *Registry) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.formats = make(map[string]Format)
	r.byExtension = make(map[string]string)
}

// GetFormat looks up a format in DefaultRegistry, returning a FormatNotFoundError if missing.
func GetFormat(nameOrExtension string) (Format, error) { //nolint:ireturn
	f, ok := DefaultRegistry.Get(nameOrExtension)
	if !ok {
		return nil, newFormatNotFound(nameOrExtension)
	}

	return f, nil
}
