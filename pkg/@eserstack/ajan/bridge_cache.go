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

// cacheHostInput carries the host facts the base directories come from. The
// WASM build runs as wasip1 without the host's home or environment, so the
// caller sends them; an absent field falls back to this process's own.
type cacheHostInput struct {
	Env      map[string]string `json:"env,omitempty"`
	Platform string            `json:"platform,omitempty"`
	Home     string            `json:"home,omitempty"`
}

// host builds the cachefx.Host of a request: the process's own facts with
// the fields the request sets put over them. A request env replaces the
// process environment as a whole.
func (in *cacheHostInput) host() *cachefx.Host {
	host := cachefx.CurrentHost()
	if in == nil {
		return &host
	}

	if in.Platform != "" {
		host.OS = in.Platform
	}

	if in.Home != "" {
		host.Home = in.Home
	}

	if in.Env != nil {
		env := in.Env
		host.Getenv = func(key string) string { return env[key] }
	}

	return &host
}

type cacheCreateRequest struct {
	Host    *cacheHostInput `json:"host,omitempty"`
	App     cacheAppInput   `json:"app"`
	BaseDir string          `json:"baseDir,omitempty"`
}

type cacheResolvePathsRequest struct {
	Host    *cacheHostInput `json:"host,omitempty"`
	App     cacheAppInput   `json:"app"`
	BaseDir string          `json:"baseDir,omitempty"`
	Version string          `json:"version,omitempty"`
	Item    string          `json:"item,omitempty"`
}

type cacheResolvePathsResponse struct {
	CacheHome     string `json:"cacheHome,omitempty"`
	DataHome      string `json:"dataHome,omitempty"`
	ConfigHome    string `json:"configHome,omitempty"`
	AppDir        string `json:"appDir,omitempty"`
	VersionedPath string `json:"versionedPath,omitempty"`
	Error         string `json:"error,omitempty"`
}

type cacheExistsResponse struct {
	Error  string `json:"error,omitempty"`
	Exists bool   `json:"exists"`
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

// cachePathRequest names a path in a cache: an absolute path, or one
// relative to the cache directory.
type cachePathRequest struct {
	Handle string `json:"handle"`
	Path   string `json:"path"`
}

// lookupCache returns the Manager behind a handle.
func lookupCache(handle string) (*cachefx.Manager, bool) {
	cacheMu.RLock()
	mgr, ok := cacheHandles[handle]
	cacheMu.RUnlock()

	return mgr, ok
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
		Host:    req.Host.host(),
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

// bridgeCacheResolvePaths answers the base directories of a host and, when
// the request names an app, its cache directory and a versioned path in it.
// It reads no files.
func bridgeCacheResolvePaths(requestJSON string) string {
	var req cacheResolvePathsRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheResolvePathsResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	host := req.Host.host()
	resp := cacheResolvePathsResponse{ //nolint:exhaustruct
		CacheHome:  host.CacheHome(),
		DataHome:   host.DataHome(),
		ConfigHome: host.ConfigHome(),
	}

	if req.App.Name != "" {
		mgr := cachefx.NewManager(cachefx.Options{
			Host:    host,
			BaseDir: req.BaseDir,
			App:     cachefx.AppIdentifier{Org: req.App.Org, Name: req.App.Name},
		})
		resp.AppDir = mgr.Dir()
		resp.VersionedPath = mgr.VersionedPath(req.Version, req.Item)
	}

	return marshalResponse(resp)
}

// bridgeCacheExists reports whether a path in the cache exists.
func bridgeCacheExists(requestJSON string) string {
	var req cachePathRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(cacheExistsResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	mgr, ok := lookupCache(req.Handle)
	if !ok {
		return marshalResponse(cacheExistsResponse{Error: "cache handle not found: " + req.Handle}) //nolint:exhaustruct
	}

	return marshalResponse(cacheExistsResponse{Exists: mgr.Exists(req.Path)}) //nolint:exhaustruct
}

// bridgeCacheEnsureDir creates a directory in the cache with its parents.
func bridgeCacheEnsureDir(requestJSON string) string {
	var req cachePathRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse(fmt.Errorf("invalid request JSON: %w", err).Error())
	}

	mgr, ok := lookupCache(req.Handle)
	if !ok {
		return errorResponse("cache handle not found: " + req.Handle)
	}

	if err := mgr.EnsureDir(req.Path); err != nil {
		return errorResponse(err.Error())
	}

	return "{}"
}

// bridgeCacheRemove deletes a path in the cache: an absolute path, or one
// relative to the cache directory.
func bridgeCacheRemove(requestJSON string) string {
	var req cachePathRequest
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
	register("cacheResolvePaths", bridgeCacheResolvePaths)
	register("cacheExists", bridgeCacheExists)
	register("cacheEnsureDir", bridgeCacheEnsureDir)
	register("cacheList", bridgeCacheList)
	register("cacheRemove", bridgeCacheRemove)
	register("cacheClear", bridgeCacheClear)
	register("cacheClose", bridgeCacheClose)
}
