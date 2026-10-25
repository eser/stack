// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"encoding/json"
	"os"

	"github.com/eser/stack/pkg/ajan/csfx"
)

// ---------------------------------------------------------------------------
// CS (Kubernetes ConfigMap/Secret) bridge
// ---------------------------------------------------------------------------

// csResourceJSON is the wire representation for a Kubernetes resource reference.
type csResourceJSON struct {
	Type      string `json:"type"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

// csGenerateRequest is the JSON request for EserAjanCsGenerate.
type csGenerateRequest struct {
	Resource  csResourceJSON `json:"resource"`
	EnvFile   string         `json:"envFile,omitempty"`
	Env       string         `json:"env,omitempty"`
	CWD       string         `json:"cwd,omitempty"`
	Format    string         `json:"format,omitempty"`
	Namespace string         `json:"namespace,omitempty"`
}

// csResultResponse wraps a string result for the caller.
type csResultResponse struct {
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

// bridgeCsGenerate generates a Kubernetes ConfigMap/Secret manifest from an env file.
func bridgeCsGenerate(requestJSON string) string {
	var req csGenerateRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(csResultResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	genOpts := csfx.GenerateOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{
			Type:      csfx.ResourceType(req.Resource.Type),
			Name:      req.Resource.Name,
			Namespace: req.Resource.Namespace,
		},
		Format:    req.Format,
		Namespace: req.Namespace,
	}
	if req.EnvFile != "" {
		genOpts.EnvFile = req.EnvFile
	} else {
		cwd := req.CWD
		if cwd == "" {
			wd, err := os.Getwd()
			if err != nil {
				return marshalResponse(csResultResponse{Error: "cannot determine cwd: " + err.Error()}) //nolint:exhaustruct
			}
			cwd = wd
		}
		// The layered files of the environment, as @eserstack/config's dotenv
		// loader reads them (the cs README), without process variables.
		genOpts.EnvFiles = csfx.EnvLayerFiles(cwd, csfx.ResolveEnvName(req.Env, os.Environ()))
	}
	result, err := csfx.Generate(genOpts)
	if err != nil {
		return marshalResponse(csResultResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(csResultResponse{Result: result}) //nolint:exhaustruct
}

func init() {
	register("csGenerate", []string{"requestJSON"}, func(a []string) string { return bridgeCsGenerate(a[0]) })
}
