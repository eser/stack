// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx

import (
	"encoding/base64"
	"fmt"

	"github.com/eser/stack/pkg/ajan/configfx/envparser"
)

// loadEnvFile reads a .env file at filename and returns a string map.
// If filename is empty, returns an empty map with no error.
// Files that do not exist are silently skipped (consistent with configfx semantics).
func loadEnvFile(filename string) (map[string]string, error) {
	raw := make(map[string]any)

	if filename != "" {
		if err := envparser.TryParseFiles(&raw, false, filename); err != nil {
			return nil, fmt.Errorf("load env file %q: %w", filename, err)
		}
	}

	result := make(map[string]string, len(raw))

	for k, v := range raw {
		if s, ok := v.(string); ok {
			result[k] = s
		}
	}

	return result, nil
}

// BuildConfigMap constructs a ConfigMap from plain key/value env data.
// namespace is omitted from metadata when it is empty or "default".
func BuildConfigMap(name, namespace string, data map[string]string) *ConfigMap {
	meta := ObjectMeta{Name: name} //nolint:exhaustruct

	if namespace != "" && namespace != "default" {
		meta.Namespace = namespace
	}

	return &ConfigMap{
		APIVersion: "v1",
		Kind:       "ConfigMap",
		Metadata:   meta,
		Data:       data,
	}
}

// BuildSecret constructs a Secret with Base64-encoded values in the data field.
//
// # Security note
//
// Base64 encoding is required by the Kubernetes API to support binary data.
// It provides NO confidentiality — Kubernetes Secrets are stored unencrypted
// in etcd by default. For sensitive workloads consider etcd encryption at rest
// or an external secrets provider (Vault, AWS Secrets Manager, Sealed Secrets).
func BuildSecret(name, namespace string, data map[string]string) *Secret {
	meta := ObjectMeta{Name: name} //nolint:exhaustruct

	if namespace != "" && namespace != "default" {
		meta.Namespace = namespace
	}

	encoded := make(map[string]string, len(data))

	for k, v := range data {
		encoded[k] = base64.StdEncoding.EncodeToString([]byte(v))
	}

	return &Secret{
		APIVersion: "v1",
		Kind:       "Secret",
		Metadata:   meta,
		Data:       encoded,
		Type:       "Opaque",
	}
}
