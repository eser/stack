package lib

import "strings"

// CaseInsensitiveGet returns the value stored under key, comparing keys with
// strings.EqualFold. An exact match wins; when only keys that differ in case
// exist and more than one matches, which one is returned is unspecified.
func CaseInsensitiveGet(m map[string]any, key string) (any, bool) { //nolint:varnamelen
	// The exact key is the common case and costs one lookup, so it is tried
	// before the linear case-insensitive scan.
	if val, ok := m[key]; ok {
		return val, true
	}

	// Check case-insensitive match
	for k, v := range m {
		if strings.EqualFold(k, key) {
			return v, true
		}
	}

	return nil, false
}

// CaseInsensitiveSet overwrites the value of an existing key that matches key
// with strings.EqualFold, keeping that key's spelling, or adds key when none
// matches.
func CaseInsensitiveSet(m *map[string]any, key string, value any) { //nolint:varnamelen
	for k := range *m {
		if strings.EqualFold(k, key) {
			(*m)[k] = value

			return
		}
	}

	(*m)[key] = value
}
