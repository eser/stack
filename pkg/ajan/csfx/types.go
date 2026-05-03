// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package csfx provides utilities for generating and syncing Kubernetes
// ConfigMap and Secret resources from environment variable files.
//
// It can produce YAML or JSON manifests for kubectl apply, and generate
// kubectl patch commands to sync existing resources from local .env files.
package csfx

// ObjectMeta holds standard Kubernetes object metadata.
type ObjectMeta struct {
	Name        string            `json:"name"                  yaml:"name"`
	Namespace   string            `json:"namespace,omitempty"   yaml:"namespace,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"      yaml:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty" yaml:"annotations,omitempty"`
}

// ConfigMap represents a Kubernetes ConfigMap resource.
type ConfigMap struct {
	APIVersion string            `json:"apiVersion"        yaml:"apiVersion"`
	Kind       string            `json:"kind"              yaml:"kind"`
	Metadata   ObjectMeta        `json:"metadata"          yaml:"metadata"`
	Data       map[string]string `json:"data,omitempty"    yaml:"data,omitempty"`
	BinaryData map[string]string `json:"binaryData,omitempty" yaml:"binaryData,omitempty"`
}

// Secret represents a Kubernetes Secret resource.
type Secret struct {
	APIVersion string            `json:"apiVersion"           yaml:"apiVersion"`
	Kind       string            `json:"kind"                 yaml:"kind"`
	Metadata   ObjectMeta        `json:"metadata"             yaml:"metadata"`
	Data       map[string]string `json:"data,omitempty"       yaml:"data,omitempty"`
	StringData map[string]string `json:"stringData,omitempty" yaml:"stringData,omitempty"`
	Type       string            `json:"type,omitempty"       yaml:"type,omitempty"`
}

// ResourceType is either "configmap" or "secret".
type ResourceType string

const (
	ResourceTypeConfigMap ResourceType = "configmap"
	ResourceTypeSecret    ResourceType = "secret"
)

// ResourceReference identifies a Kubernetes resource.
type ResourceReference struct {
	Type      ResourceType
	Name      string
	Namespace string
}

// GenerateOptions configures manifest generation from an env file.
type GenerateOptions struct {
	// Resource identifies the target Kubernetes resource.
	Resource ResourceReference
	// EnvFile is the path to a single .env file. Ignored when EnvFiles is set.
	EnvFile string
	// EnvFiles lists env files to load in order; later files override earlier keys.
	// When non-empty, takes precedence over EnvFile.
	EnvFiles []string
	// Format is the output serialization format: "yaml" (default) or "json".
	Format string
	// Namespace is a fallback namespace when Resource.Namespace is empty.
	Namespace string
}

// SyncOptions configures kubectl patch command generation.
type SyncOptions struct {
	// Resource identifies the existing Kubernetes resource to sync.
	Resource ResourceReference
	// EnvFile is the path to a .env file to read values from.
	EnvFile string
	// Format is the patch serialization format: "json" (default) or "yaml".
	Format string
	// StringOnly returns only the patch data string instead of a full kubectl command.
	StringOnly bool
}
