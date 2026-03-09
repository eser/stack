package lib

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func PathsSplit(filename string) (string, string, string) {
	dir, file := filepath.Split(filename)
	ext := filepath.Ext(file)
	rest := len(file) - len(ext)

	if rest == 0 {
		return dir, file, ""
	}

	return dir, file[:rest], ext
}

// expandPath expands tilde (~) in file paths to the user's home directory.
func ExpandPath(path string) (string, error) {
	if !strings.HasPrefix(path, "~/") {
		return path, nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get user home directory: %w", err)
	}

	return filepath.Join(homeDir, path[2:]), nil
}
