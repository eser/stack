package lib

import "strings"

func CaseInsensitiveGet(m map[string]any, key string) (any, bool) { //nolint:varnamelen
	// FIXME(@eser) check exact match first for performance
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

func CaseInsensitiveSet(m *map[string]any, key string, value any) { //nolint:varnamelen
	for k := range *m {
		if strings.EqualFold(k, key) {
			(*m)[k] = value

			return
		}
	}

	(*m)[key] = value
}
