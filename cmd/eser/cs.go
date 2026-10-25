// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"errors"
	"flag"
	"fmt"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/csfx"
)

var errInvalidResource = errors.New("give the resource as cm/<name>, configmap/<name> or secret/<name>")

// csFlags registers the flags the TypeScript cs CLI takes, with its short
// names.
func csFlags(fs *flag.FlagSet) {
	for _, names := range [][2]string{{"env", "e"}, {"namespace", "n"}, {"output", "o"}} {
		value := new(string)
		usage := map[string]string{
			"env":       "environment name (default: $ENV, $APP_ENV, $DENO_ENV, $NODE_ENV or development)",
			"namespace": "Kubernetes namespace",
			"output":    "output format: yaml or json",
		}[names[0]]

		fs.StringVar(value, names[0], "", usage)
		fs.StringVar(value, names[1], "", "short for --"+names[0])
	}
}

// parseResource reads cm/<name>, configmap/<name> or secret/<name>.
func parseResource(arg, namespace string) (csfx.ResourceReference, error) {
	kind, name, ok := strings.Cut(arg, "/")
	if !ok || name == "" || strings.Contains(name, "/") {
		return csfx.ResourceReference{}, clifx.Usagef("%v, not %q", errInvalidResource, arg) //nolint:exhaustruct
	}

	var resourceType csfx.ResourceType

	switch kind {
	case "cm", "configmap":
		resourceType = csfx.ResourceTypeConfigMap
	case "secret":
		resourceType = csfx.ResourceTypeSecret
	default:
		return csfx.ResourceReference{}, clifx.Usagef("%v, not %q", errInvalidResource, arg) //nolint:exhaustruct
	}

	return csfx.ResourceReference{Type: resourceType, Name: name, Namespace: namespace}, nil
}

func csResourceArg(c *clifx.Context) (csfx.ResourceReference, string, error) {
	if len(c.Args) != 1 {
		return csfx.ResourceReference{}, "", clifx.Usagef("give one resource, such as cm/default or secret/default") //nolint:exhaustruct
	}

	format := c.String("output")
	if format != "" && format != "yaml" && format != "json" {
		return csfx.ResourceReference{}, "", clifx.Usagef("the output format must be yaml or json, not %q", format) //nolint:exhaustruct
	}

	ref, err := parseResource(c.Args[0], c.String("namespace"))

	return ref, format, err
}

func csCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "cs",
		Short: "Kubernetes ConfigMap and Secret tools for .env files",
		Long: "Reads the .env files of an environment in order: .env, .env.<env>, .env.local (not for test) " +
			"and .env.<env>.local, later files winning.",
		Subcommands: []*clifx.Command{
			{
				Name:  "generate",
				Short: "Print a ConfigMap or Secret built from the .env files",
				Long:  "Reads the environment's .env files and no process variables. The default output is YAML.",
				Args:  "<cm|configmap|secret>/<name>",
				Flags: csFlags,
				Run: func(c *clifx.Context) error {
					ref, format, err := csResourceArg(c)
					if err != nil {
						return err
					}

					if format == "" {
						format = "yaml"
					}

					envName := csfx.ResolveEnvName(c.String("env"), e.environ())

					result, err := csfx.Generate(csfx.GenerateOptions{ //nolint:exhaustruct
						Resource: ref,
						EnvFiles: csfx.EnvLayerFiles(e.cwd, envName),
						Format:   format,
					})
					if err != nil {
						return fmt.Errorf("generate %s/%s: %w", ref.Type, ref.Name, err)
					}

					_, _ = fmt.Fprintln(e.stdout, result)

					return nil
				},
			},
			{
				Name:  "sync",
				Short: "Print a kubectl patch that sets a resource's keys from the environment",
				Long: "Reads the resource's keys with kubectl, then their values from the .env files and the " +
					"process environment (process variables win). The default output is JSON.",
				Args: "<cm|configmap|secret>/<name>",
				Flags: func(fs *flag.FlagSet) {
					csFlags(fs)

					stringOnly := new(bool)
					fs.BoolVar(stringOnly, "string-only", false, "print only the patch, without the kubectl command")
					fs.BoolVar(stringOnly, "s", false, "short for --string-only")
				},
				Run: func(c *clifx.Context) error {
					ref, format, err := csResourceArg(c)
					if err != nil {
						return err
					}

					environ := e.environ()
					envName := csfx.ResolveEnvName(c.String("env"), environ)

					result, err := csfx.Sync(csfx.SyncOptions{ //nolint:exhaustruct
						Resource:     ref,
						EnvFiles:     csfx.EnvLayerFiles(e.cwd, envName),
						Environ:      environ,
						Format:       format,
						StringOnly:   c.Bool("string-only"),
						ResourceKeys: e.resourceKeys,
						OnMissingKey: func(key string) {
							_, _ = fmt.Fprintf(e.stderr, "Warning: %s is in %s/%s but not in the environment, so the patch "+
								"leaves it out; define it in the .env file to sync it.\n", key, ref.Type, ref.Name)
						},
					})
					if err != nil {
						return fmt.Errorf("sync %s/%s: %w", ref.Type, ref.Name, err)
					}

					_, _ = fmt.Fprintln(e.stdout, result)

					return nil
				},
			},
		},
	}
}
