package lib

import (
	"os"
	"strings"
)

func EnvGetCurrent() string {
	// FIXME(@eser) no need to use os.Lookupenv here
	env := strings.ToLower(os.Getenv("env"))

	if env == "" {
		env = "development"
	}

	return env
}

func EnvAwareFilenames(env string, filename string) []string {
	dirname, basename, ext := PathsSplit(filename)

	filenames := []string{
		filename,
		dirname + basename + "." + env + ext,
	}

	if env != "test" {
		filenames = append(filenames, dirname+basename+".local"+ext)
	}

	filenames = append(filenames, dirname+basename+"."+env+".local"+ext)

	return filenames
}

func EnvOverrideVariables(m *map[string]any, keyCaseInsensitive bool) { //nolint:varnamelen
	for _, e := range os.Environ() {
		pair := strings.SplitN(e, "=", 2) //nolint:mnd

		if keyCaseInsensitive {
			CaseInsensitiveSet(m, pair[0], pair[1])
		} else {
			(*m)[pair[0]] = pair[1]
		}
	}
}
