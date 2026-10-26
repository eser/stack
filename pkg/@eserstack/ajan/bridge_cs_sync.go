// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"

	"github.com/eser/stack/pkg/ajan/csfx"
)

// csSyncRequest is the JSON request for EserAjanCsSync.
type csSyncRequest struct {
	Resource   csResourceJSON `json:"resource"`
	EnvFile    string         `json:"envFile,omitempty"`
	Format     string         `json:"format,omitempty"`
	StringOnly bool           `json:"stringOnly,omitempty"`
}

// bridgeCsSync generates a kubectl patch command that syncs env values into a K8s resource.
func bridgeCsSync(requestJSON string) string {
	var req csSyncRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(csResultResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	result, err := csfx.Sync(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type:      csfx.ResourceType(req.Resource.Type),
			Name:      req.Resource.Name,
			Namespace: req.Resource.Namespace,
		},
		EnvFile:    req.EnvFile,
		Format:     req.Format,
		StringOnly: req.StringOnly,
	})
	if err != nil {
		return marshalResponse(csResultResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(csResultResponse{Result: result}) //nolint:exhaustruct
}

func init() {
	register("csSync", bridgeCsSync)
}
