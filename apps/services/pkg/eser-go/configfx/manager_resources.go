package configfx

import (
	"errors"
	"fmt"

	"github.com/eser/stack/apps/services/pkg/eser-go/configfx/envparser"
	"github.com/eser/stack/apps/services/pkg/eser-go/configfx/jsonparser"
	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
)

var (
	ErrFailedToParseEnvFile    = errors.New("failed to parse env file")
	ErrFailedToParseJSONFile   = errors.New("failed to parse JSON file")
	ErrFailedToParseJSONString = errors.New("failed to parse JSON string")
)

func (cl *ConfigManager) FromEnvFileDirect(
	filename string,
	keyCaseInsensitive bool,
) ConfigResource {
	return func(target *map[string]any) error {
		err := envparser.TryParseFiles(target, keyCaseInsensitive, filename)
		if err != nil {
			return fmt.Errorf("%w (filename=%q): %w", ErrFailedToParseEnvFile, filename, err)
		}

		return nil
	}
}

func (cl *ConfigManager) FromEnvFile(filename string, keyCaseInsensitive bool) ConfigResource {
	return func(target *map[string]any) error {
		env := lib.EnvGetCurrent()
		filenames := lib.EnvAwareFilenames(env, filename)

		err := envparser.TryParseFiles(target, keyCaseInsensitive, filenames...)
		if err != nil {
			return fmt.Errorf("%w (filename=%q): %w", ErrFailedToParseEnvFile, filename, err)
		}

		return nil
	}
}

func (cl *ConfigManager) FromSystemEnv(keyCaseInsensitive bool) ConfigResource {
	return func(target *map[string]any) error {
		lib.EnvOverrideVariables(target, keyCaseInsensitive)

		return nil
	}
}

func (cl *ConfigManager) FromJSONFileDirect(filename string) ConfigResource {
	return func(target *map[string]any) error {
		err := jsonparser.TryParseFiles(target, filename)
		if err != nil {
			return fmt.Errorf("%w (filename=%q): %w", ErrFailedToParseJSONFile, filename, err)
		}

		return nil
	}
}

func (cl *ConfigManager) FromJSONFile(filename string) ConfigResource {
	return func(target *map[string]any) error {
		env := lib.EnvGetCurrent()
		filenames := lib.EnvAwareFilenames(env, filename)

		err := jsonparser.TryParseFiles(target, filenames...)
		if err != nil {
			return fmt.Errorf("%w (filename=%q): %w", ErrFailedToParseJSONFile, filename, err)
		}

		return nil
	}
}

func (cl *ConfigManager) FromJSONString(jsonStr string) ConfigResource {
	return func(target *map[string]any) error {
		err := jsonparser.ParseBytes([]byte(jsonStr), target)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToParseJSONString, err)
		}

		return nil
	}
}
