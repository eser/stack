// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"math"
	"strings"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/configfx/envparser"
)

// ---------------------------------------------------------------------------
// Config bridge state (stateless — no handles needed)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Config wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type configLoadRequest struct {
	// Sources is an ordered list of config source specs:
	//   "system_env"           — reads OS environment variables
	//   "env_file"             — reads .env (auto-resolved by APP_ENV)
	//   "env_file:<filename>"  — reads the named .env file
	//   "json_file"            — reads config.json (auto-resolved by APP_ENV)
	//   "json_file:<filename>" — reads the named JSON file
	//   "json_string:<json>"   — parses an inline JSON string
	Sources         []string `json:"sources"`
	CaseInsensitive bool     `json:"caseInsensitive"`
}

type configLoadResponse struct {
	Values map[string]any `json:"values"`
	Error  string         `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Config bridge functions
// ---------------------------------------------------------------------------

// bridgeConfigLoad loads configuration from the specified sources and returns
// a JSON-encoded flat map of all config values. Stateless — no handle.
func bridgeConfigLoad(optionsJSON string) string {
	var req configLoadRequest
	if err := json.Unmarshal([]byte(optionsJSON), &req); err != nil {
		return marshalResponse(configLoadResponse{Error: "invalid options JSON: " + err.Error()}) //nolint:exhaustruct
	}

	cm := configfx.NewConfigManager()

	resources := make([]configfx.ConfigResource, 0, len(req.Sources))

	for _, src := range req.Sources {
		switch {
		case src == "system_env":
			resources = append(resources, cm.FromSystemEnv(req.CaseInsensitive))

		case src == "env_file":
			resources = append(resources, cm.FromEnvFile(".env", req.CaseInsensitive))

		case strings.HasPrefix(src, "env_file:"):
			filename := strings.TrimPrefix(src, "env_file:")
			resources = append(resources, cm.FromEnvFileDirect(filename, req.CaseInsensitive))

		case src == "json_file":
			resources = append(resources, cm.FromJSONFile("config.json"))

		case strings.HasPrefix(src, "json_file:"):
			filename := strings.TrimPrefix(src, "json_file:")
			resources = append(resources, cm.FromJSONFileDirect(filename))

		case strings.HasPrefix(src, "json_string:"):
			jsonStr := strings.TrimPrefix(src, "json_string:")
			resources = append(resources, cm.FromJSONString(jsonStr))
		}
	}

	values, err := cm.LoadMap(resources...)
	if err != nil {
		return marshalResponse(configLoadResponse{Error: "load config: " + err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(configLoadResponse{Values: *values, Error: ""})
}

// ---------------------------------------------------------------------------
// Dotenv and file loader bridge functions (@eserstack/config/dotenv and
// @eserstack/config/file). The host's environment arrives in the request,
// because the WASM build has none of its own.
// ---------------------------------------------------------------------------

// Codes of the failures the TypeScript library turns into its own error
// classes.
const (
	configCodeNotFound         = "not_found"
	configCodePermissionDenied = "permission_denied"
	configCodeTooLarge         = "too_large"
	configCodeParse            = "parse"
)

// configEnviron is the host environment of a dotenv request: the variables
// in the host's order, and whether names match regardless of case (Windows).
type configEnviron struct {
	Environ            [][2]string `json:"environ"`
	EnvCaseInsensitive bool        `json:"envCaseInsensitive"`
}

func (e configEnviron) entries() []envparser.DotenvEntry {
	entries := make([]envparser.DotenvEntry, 0, len(e.Environ))
	for _, pair := range e.Environ {
		entries = append(entries, envparser.DotenvEntry{Key: pair[0], Value: pair[1]})
	}

	return entries
}

func (e configEnviron) lookup() envparser.LookupFunc {
	return envparser.EnvironLookup(e.entries(), e.EnvCaseInsensitive)
}

func dotenvPairs(entries []envparser.DotenvEntry) [][2]string {
	pairs := make([][2]string, 0, len(entries))
	for _, entry := range entries {
		pairs = append(pairs, [2]string{entry.Key, entry.Value})
	}

	return pairs
}

// dotenvMaxFileSize turns the request's limit into ReadDotenvFile's; null
// sets none.
func dotenvMaxFileSize(limit *float64) float64 {
	if limit == nil {
		return math.Inf(1)
	}

	return *limit
}

// configFailure is the error part of the dotenv and file answers.
type configFailure struct {
	Error    string `json:"error,omitempty"`
	Code     string `json:"code,omitempty"`
	FileSize int64  `json:"fileSize,omitempty"`
}

func configFailureOf(err error) configFailure {
	failure := configFailure{Error: err.Error(), Code: "", FileSize: 0}

	var tooLarge *envparser.FileTooLargeError

	switch {
	case errors.As(err, &tooLarge):
		failure.Code = configCodeTooLarge
		failure.FileSize = tooLarge.Size
	case errors.Is(err, configfx.ErrFileParse):
		failure.Code = configCodeParse
	case errors.Is(err, fs.ErrNotExist):
		failure.Code = configCodeNotFound
	case errors.Is(err, fs.ErrPermission):
		failure.Code = configCodePermissionDenied
	}

	return failure
}

type configParseDotenvRequest struct {
	configEnviron

	Text string `json:"text"`
}

type configDotenvResponse struct {
	configFailure

	Entries [][2]string `json:"entries"`
	Ignored []string    `json:"ignored,omitempty"`
}

// bridgeConfigParseDotenv parses .env text in the dialect of
// @eserstack/config/dotenv. Returns JSON: { entries, ignored? } | { error }.
func bridgeConfigParseDotenv(requestJSON string) string {
	var req configParseDotenvRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	result := envparser.ParseDotenv(req.Text, req.lookup())

	return marshalResponse(configDotenvResponse{ //nolint:exhaustruct
		Entries: dotenvPairs(result.Entries),
		Ignored: result.Ignored,
	})
}

type configReadDotenvFileRequest struct {
	MaxFileSize *float64 `json:"maxFileSize"`

	configEnviron

	Path string `json:"path"`
}

// bridgeConfigReadDotenvFile reads and parses one .env file; a missing file
// reads as empty. Returns JSON: { entries, ignored? } | { error, code?,
// fileSize? }.
func bridgeConfigReadDotenvFile(requestJSON string) string {
	var req configReadDotenvFileRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	result, err := envparser.ReadDotenvFile(req.Path, dotenvMaxFileSize(req.MaxFileSize), req.lookup())
	if err != nil {
		return marshalResponse(configDotenvResponse{configFailure: configFailureOf(err), Entries: [][2]string{}}) //nolint:exhaustruct
	}

	return marshalResponse(configDotenvResponse{ //nolint:exhaustruct
		Entries: dotenvPairs(result.Entries),
		Ignored: result.Ignored,
	})
}

type configLoadDotenvRequest struct {
	Env         *string  `json:"env"`
	MaxFileSize *float64 `json:"maxFileSize"`

	configEnviron

	BaseDir         string   `json:"baseDir"`
	DefaultEnvValue string   `json:"defaultEnvValue"`
	EnvVars         []string `json:"envVars"`
	LoadProcessEnv  bool     `json:"loadProcessEnv"`
}

type configLoadDotenvResponse struct {
	configFailure

	EnvName  string      `json:"envName"`
	Filepath string      `json:"filepath,omitempty"`
	Entries  [][2]string `json:"entries"`
	Ignored  []string    `json:"ignored,omitempty"`
}

// bridgeConfigLoadDotenv loads the .env files of an environment and the
// process environment as @eserstack/config/dotenv's load does. Returns JSON:
// { envName, entries, ignored? } | { error, code?, filepath?, fileSize?,
// ignored? }.
func bridgeConfigLoadDotenv(requestJSON string) string {
	var req configLoadDotenvRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	environ := req.entries()
	result, err := envparser.LoadDotenv(&envparser.DotenvLoadOptions{
		Env:            req.Env,
		Lookup:         envparser.EnvironLookup(environ, req.EnvCaseInsensitive),
		BaseDir:        req.BaseDir,
		DefaultEnv:     req.DefaultEnvValue,
		EnvVars:        req.EnvVars,
		Environ:        environ,
		MaxFileSize:    dotenvMaxFileSize(req.MaxFileSize),
		LoadProcessEnv: req.LoadProcessEnv,
	})

	response := configLoadDotenvResponse{ //nolint:exhaustruct
		EnvName: result.EnvName,
		Entries: dotenvPairs(result.Entries),
		Ignored: result.Ignored,
	}

	if err != nil {
		response.configFailure = configFailureOf(err)

		var tooLarge *envparser.FileTooLargeError
		if errors.As(err, &tooLarge) {
			response.Filepath = tooLarge.Path
		}
	}

	return marshalResponse(response)
}

type configLocateFileRequest struct {
	BaseDir       string   `json:"baseDir"`
	Filenames     []string `json:"filenames"`
	SearchParents bool     `json:"searchParents"`
}

type configLocateFileResponse struct {
	Path  *string `json:"path,omitempty"`
	Error string  `json:"error,omitempty"`
}

// bridgeConfigLocateFile finds the first of the file names in a directory
// and, when asked, its parents. Returns JSON: { path? } | { error }.
func bridgeConfigLocateFile(requestJSON string) string {
	var req configLocateFileRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	path, found := configfx.LocateFile(req.BaseDir, req.Filenames, configfx.LocateOptions{SearchParents: req.SearchParents})
	if !found {
		return marshalResponse(configLocateFileResponse{}) //nolint:exhaustruct
	}

	return marshalResponse(configLocateFileResponse{Path: &path}) //nolint:exhaustruct
}

// configPathStyle is the path style of a request that says whether the host
// separates paths the Windows way.
func configPathStyle(windows bool) configfx.PathStyle {
	if windows {
		return configfx.PathStyleWindows
	}

	return configfx.PathStylePOSIX
}

type configFileFormatRequest struct {
	Path    string `json:"path"`
	Windows bool   `json:"windows"`
}

type configFileFormatResponse struct {
	Error  string `json:"error,omitempty"`
	Format int    `json:"format"`
}

// bridgeConfigFileFormat picks a configuration file's format from its
// extension. Returns JSON: { format } | { error }.
func bridgeConfigFileFormat(requestJSON string) string {
	var req configFileFormatRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	return marshalResponse(configFileFormatResponse{ //nolint:exhaustruct
		Format: int(configfx.FileFormatOf(req.Path, configPathStyle(req.Windows))),
	})
}

type configParseFileRequest struct {
	Format  *int   `json:"format"`
	Path    string `json:"path"`
	Windows bool   `json:"windows"`
}

type configParseFileResponse struct {
	Text *string `json:"text,omitempty"`

	configFailure

	Content json.RawMessage `json:"content,omitempty"`
	Format  int             `json:"format"`
}

// bridgeConfigParseFile reads a configuration file and parses JSON and JSONC;
// YAML and TOML come back as text for the caller to decode. Returns JSON:
// { format, content? | text? } | { format, error, code? }.
func bridgeConfigParseFile(requestJSON string) string {
	var req configParseFileRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalError("invalid request JSON: " + err.Error())
	}

	opts := configfx.ParseFileOptions{Format: nil, PathStyle: configPathStyle(req.Windows)}
	if req.Format != nil {
		format := configfx.FileFormat(*req.Format)
		opts.Format = &format
	}

	parsed, err := configfx.ParseFile(req.Path, opts)
	if err != nil {
		response := configParseFileResponse{configFailure: configFailureOf(err)} //nolint:exhaustruct

		var parseErr *configfx.FileParseError
		if errors.As(err, &parseErr) {
			response.Format = int(parseErr.Format)
		}

		return marshalResponse(response)
	}

	response := configParseFileResponse{Content: parsed.Content, Format: int(parsed.Format)} //nolint:exhaustruct
	if parsed.Format == configfx.FileFormatTOML || parsed.Format == configfx.FileFormatYAML {
		response.Text = &parsed.Text
	}

	return marshalResponse(response)
}

func init() {
	register("configLoad", bridgeConfigLoad)
	register("configParseDotenv", bridgeConfigParseDotenv)
	register("configReadDotenvFile", bridgeConfigReadDotenvFile)
	register("configLoadDotenv", bridgeConfigLoadDotenv)
	register("configLocateFile", bridgeConfigLocateFile)
	register("configFileFormat", bridgeConfigFileFormat)
	register("configParseFile", bridgeConfigParseFile)
}
