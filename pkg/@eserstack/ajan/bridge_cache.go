// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/eser/stack/pkg/ajan/cachefx"
)

func drainCacheHandles() shutdownStep {
	cacheMu.Lock()
	clear(cacheHandles)
	cacheMu.Unlock()

	return shutdownStep{} //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// Cache bridge — state
// ---------------------------------------------------------------------------

var (
	cacheHandles = make(map[string]*cachefx.Manager)
	cacheMu      sync.RWMutex
)

// ---------------------------------------------------------------------------
// Cache bridge — wire types
// ---------------------------------------------------------------------------

type cacheAppInput struct {
	Org  string `json:"org,omitempty"`
	Name string `json:"name"`
}

type cacheCreateRequest struct {
	App     cacheAppInput `json:"app"`
	BaseDir string        `json:"baseDir,omitempty"`
}

type cacheHandleResponse struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
}

type cacheDirResponse struct {
	Dir   string `json:"dir,omitempty"`
	Error string `json:"error,omitempty"`
}

type cachePathResponse struct {
	Path  string `json:"path,omitempty"`
	Error string `json:"error,omitempty"`
}

type cacheEntryJSON struct {
	Path        string `json:"path"`
	Name        string `json:"name"`
	MtimeUnix   int64  `json:"mtimeUnix"`
	Size        int64  `json:"size"`
	IsDirectory bool   `json:"isDirectory"`
}

type cacheListResponse struct {
	Entries []cacheEntryJSON `json:"entries,omitempty"`
	Error   string           `json:"error,omitempty"`
}

type cacheHandleRequest struct {
	Handle string `json:"handle"`
}

type cacheVersionedPathRequest struct {
	Handle  string `json:"handle"`
	Version string `json:"version"`
	Name    string `json:"name"`
}

type cacheRemoveRequest struct {
	Handle string `json:"handle"`
	Path   string `json:"path"`
}

// ---------------------------------------------------------------------------
// Cache bridge functions
// ---------------------------------------------------------------------------

// bridgeCacheCreate creates a Manager and stores it under a new handle.
func bridgeCacheCreate(requestJSON string) string {
	var req cacheCreateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheHandleResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	if req.App.Name == "" {
		return marshalResponse(cacheHandleResponse{Error: "app.name is required"}) //nolint:exhaustruct
	}

	mgr := cachefx.NewManager(cachefx.Options{
		BaseDir: req.BaseDir,
		App:     cachefx.AppIdentifier{Org: req.App.Org, Name: req.App.Name},
	})

	handle := newHandle("cache")

	cacheMu.Lock()
	cacheHandles[handle] = mgr
	cacheMu.Unlock()

	return marshalResponse(cacheHandleResponse{Handle: handle}) //nolint:exhaustruct
}

// bridgeCacheGetDir returns the absolute cache directory for a handle.
func bridgeCacheGetDir(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheDirResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(cacheDirResponse{Error: "cache handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	return marshalResponse(cacheDirResponse{Dir: mgr.Dir()}) //nolint:exhaustruct
}

// bridgeCacheGetVersionedPath returns the path for a named artefact at a version.
func bridgeCacheGetVersionedPath(requestJSON string) string {
	var req cacheVersionedPathRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cachePathResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(cachePathResponse{Error: "cache handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	return marshalResponse(cachePathResponse{Path: mgr.VersionedPath(req.Version, req.Name)}) //nolint:exhaustruct
}

// bridgeCacheList lists entries in the cache directory.
func bridgeCacheList(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheListResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(cacheListResponse{Error: "cache handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	entries, err := mgr.List()
	if err != nil {
		return marshalResponse(cacheListResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonEntries := make([]cacheEntryJSON, 0, len(entries))
	for _, e := range entries {
		jsonEntries = append(jsonEntries, cacheEntryJSON{
			Path:        e.Path,
			Name:        e.Name,
			Size:        e.Size,
			MtimeUnix:   e.MtimeUnix,
			IsDirectory: e.IsDirectory,
		})
	}

	return marshalResponse(cacheListResponse{Entries: jsonEntries}) //nolint:exhaustruct
}

// bridgeCacheRemove deletes a specific path from the cache.
func bridgeCacheRemove(requestJSON string) string {
	var req cacheRemoveRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: fmt.Errorf("invalid request JSON: %w", err).Error()})
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: "cache handle not found: " + req.Handle})
	}

	if err := mgr.Remove(req.Path); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: err.Error()})
	}

	return "{}"
}

// bridgeCacheClear deletes the entire cache directory for a handle.
func bridgeCacheClear(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: fmt.Errorf("invalid request JSON: %w", err).Error()})
	}

	cacheMu.RLock()
	mgr, ok := cacheHandles[req.Handle]
	cacheMu.RUnlock()

	if !ok {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: "cache handle not found: " + req.Handle})
	}

	if err := mgr.Clear(); err != nil {
		return marshalResponse(struct {
			Error string `json:"error,omitempty"`
		}{Error: err.Error()})
	}

	return "{}"
}

// bridgeCacheClose removes a cache handle and frees the reference.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeCacheClose(requestJSON string) string {
	var req cacheHandleRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return "{}"
	}

	cacheMu.Lock()
	delete(cacheHandles, req.Handle)
	cacheMu.Unlock()

	return "{}"
}

func init() {
	registerShutdownDrain(drainCacheHandles)
	register("cacheCreate", bridgeCacheCreate)
	register("cacheGetDir", bridgeCacheGetDir)
	register("cacheGetVersionedPath", bridgeCacheGetVersionedPath)
	register("cacheList", bridgeCacheList)
	register("cacheRemove", bridgeCacheRemove)
	register("cacheClear", bridgeCacheClear)
	register("cacheClose", bridgeCacheClose)
}
