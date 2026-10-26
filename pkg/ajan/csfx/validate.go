// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const k8sMaxNameLength = 253

// Sentinel errors returned by validation functions.
var (
	ErrResourceNameRequired  = errors.New("resource name is required")
	ErrResourceNameTooLong   = errors.New("resource name exceeds 253-character limit")
	ErrResourceNameInvalid   = errors.New("resource name must match RFC 1123 DNS subdomain (lowercase alphanumeric, '-', '.')")
	ErrConsecutiveSeparators = errors.New("resource name cannot contain consecutive '.' or '-'")
)

// validK8sName matches RFC 1123 DNS subdomain names:
// starts and ends with alphanumeric; body may contain alphanumeric, '-', or '.'.
var validK8sName = regexp.MustCompile(`^[a-z0-9]([a-z0-9.\-]*[a-z0-9])?$`)

// ValidateResourceName checks that name is a valid Kubernetes resource name
// (RFC 1123 DNS subdomain, ≤253 chars). fieldName is used in error messages.
func ValidateResourceName(name, fieldName string) error {
	if name == "" {
		return fmt.Errorf("%s: %w", fieldName, ErrResourceNameRequired)
	}

	if len(name) > k8sMaxNameLength {
		return fmt.Errorf("%s %q: %w (got %d)", fieldName, name, ErrResourceNameTooLong, len(name))
	}

	if !validK8sName.MatchString(name) {
		return fmt.Errorf("%s %q: %w", fieldName, name, ErrResourceNameInvalid)
	}

	if strings.Contains(name, "..") || strings.Contains(name, "--") {
		return fmt.Errorf("%s %q: %w", fieldName, name, ErrConsecutiveSeparators)
	}

	return nil
}

// ValidateResourceReference validates both Name and optional Namespace of ref.
func ValidateResourceReference(ref ResourceReference) error {
	if err := ValidateResourceName(ref.Name, "resource name"); err != nil {
		return err
	}

	if ref.Namespace != "" {
		if err := ValidateResourceName(ref.Namespace, "namespace"); err != nil {
			return err
		}
	}

	return nil
}
