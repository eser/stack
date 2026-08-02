// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package postsfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// ErrTokenNotFound is returned when no stored token exists for a platform.
var ErrTokenNotFound = errors.New("no stored token for platform")

// FileTokenStore implements TokenStore using a JSON file per platform.
// Tokens are stored in dir/<platform>.json.
type FileTokenStore struct {
	dir string
}

// NewFileTokenStore creates a FileTokenStore that persists tokens in dir.
// dir is created on first write if it does not exist.
func NewFileTokenStore(dir string) *FileTokenStore {
	return &FileTokenStore{dir: dir}
}

// DefaultTokenStoreDir returns the XDG-style directory for token storage.
// On Unix it is $XDG_CONFIG_HOME/eser/posts or $HOME/.config/eser/posts.
func DefaultTokenStoreDir() string {
	if base := os.Getenv("XDG_CONFIG_HOME"); base != "" {
		return filepath.Join(base, "eser", "posts")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".config", "eser", "posts")
	}

	return filepath.Join(home, ".config", "eser", "posts")
}

// Load reads stored tokens for the given platform.
func (s *FileTokenStore) Load(_ context.Context, platform Platform) (*OAuthTokens, error) {
	path := s.tokenPath(platform)

	data, err := os.ReadFile(path) //nolint:gosec
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%w: %s", ErrTokenNotFound, platform)
		}

		return nil, fmt.Errorf("reading token file %q: %w", path, err)
	}

	var tokens OAuthTokens
	if err := json.Unmarshal(data, &tokens); err != nil {
		return nil, fmt.Errorf("parsing token file %q: %w", path, err)
	}

	return &tokens, nil
}

// Save persists tokens for the given platform.
func (s *FileTokenStore) Save(_ context.Context, platform Platform, tokens *OAuthTokens) error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return fmt.Errorf("creating token store dir: %w", err)
	}

	data, err := json.MarshalIndent(tokens, "", "  ") //nolint:gosec // marshalling OAuth token for secure file persistence
	if err != nil {
		return fmt.Errorf("marshalling tokens: %w", err)
	}

	path := s.tokenPath(platform)
	if err := os.WriteFile(path, data, 0o600); err != nil { //nolint:gosec
		return fmt.Errorf("writing token file %q: %w", path, err)
	}

	return nil
}

// Clear removes the stored tokens for the given platform.
func (s *FileTokenStore) Clear(_ context.Context, platform Platform) error {
	path := s.tokenPath(platform)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removing token file %q: %w", path, err)
	}

	return nil
}

func (s *FileTokenStore) tokenPath(platform Platform) string {
	return filepath.Join(s.dir, string(platform)+".json")
}
