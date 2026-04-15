package configfx

import "reflect"

const (
	TagConf     = "conf"
	TagDefault  = "default"
	TagRequired = "required"

	Separator = "__"
)

type ConfigItemMeta struct {
	Type         reflect.Type
	Field        reflect.Value
	Name         string
	DefaultValue string

	Children        []ConfigItemMeta
	IsRequired      bool
	HasDefaultValue bool
}

type ConfigResource func(target *map[string]any) error

type ConfigLoader interface {
	LoadMeta(i any) (ConfigItemMeta, error)
	LoadMap(resources ...ConfigResource) (*map[string]any, error)
	Load(i any, resources ...ConfigResource) error
	LoadDefaults(i any) error

	FromEnvFileDirect(filename string, keyCaseInsensitive bool) ConfigResource
	FromEnvFile(filename string, keyCaseInsensitive bool) ConfigResource
	FromSystemEnv(keyCaseInsensitive bool) ConfigResource

	FromJSONFileDirect(filename string) ConfigResource
	FromJSONFile(filename string) ConfigResource
}
