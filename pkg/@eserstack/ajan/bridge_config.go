// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"encoding/json"
	"strings"

	"github.com/eser/stack/pkg/ajan/configfx"
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

func init() {
	register("configLoad", bridgeConfigLoad)
}
