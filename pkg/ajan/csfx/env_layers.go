// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx

import (
	"fmt"
	"path/filepath"
	"strings"
)

// EnvNameVariables are the variables read for the environment name, in
// order, when none is given (the @eserstack/config dotenv loader's envVars).
var EnvNameVariables = []string{"ENV", "APP_ENV", "DENO_ENV", "NODE_ENV"} //nolint:gochecknoglobals

// DefaultEnvName is the environment name when none is given or set.
const DefaultEnvName = "development"

// ResolveEnvName returns explicit when it is set, otherwise the first
// non-empty EnvNameVariables entry of environ ("KEY=value" pairs), otherwise
// DefaultEnvName.
func ResolveEnvName(explicit string, environ []string) string {
	if explicit != "" {
		return explicit
	}

	values := environMap(environ)

	for _, name := range EnvNameVariables {
		if value := values[name]; value != "" {
			return value
		}
	}

	return DefaultEnvName
}

// EnvLayerFiles lists the .env files of an environment in dir, lowest
// precedence first: .env, .env.<env>, .env.local (left out for "test") and
// .env.<env>.local. Missing files are skipped when they are read.
func EnvLayerFiles(dir, envName string) []string {
	files := []string{
		filepath.Join(dir, ".env"),
		filepath.Join(dir, ".env."+envName),
	}

	if envName != "test" {
		files = append(files, filepath.Join(dir, ".env.local"))
	}

	return append(files, filepath.Join(dir, ".env."+envName+".local"))
}

// LoadEnvLayers reads files in order, later values replacing earlier ones;
// then environ, when given, replaces them again (process variables win, as
// in the TypeScript loader with loadProcessEnv).
func LoadEnvLayers(files, environ []string) (map[string]string, error) {
	data := make(map[string]string)

	for _, file := range files {
		values, err := loadEnvFile(file)
		if err != nil {
			return nil, fmt.Errorf("load %s: %w", filepath.Base(file), err)
		}

		for key, value := range values {
			data[key] = value
		}
	}

	for key, value := range environMap(environ) {
		data[key] = value
	}

	return data, nil
}

func environMap(environ []string) map[string]string {
	values := make(map[string]string, len(environ))

	for _, entry := range environ {
		if key, value, ok := strings.Cut(entry, "="); ok && key != "" {
			values[key] = value
		}
	}

	return values
}
