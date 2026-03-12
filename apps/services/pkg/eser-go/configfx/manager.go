package configfx

import (
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/eser/stack/apps/services/pkg/eser-go/types"
)

var (
	ErrNotStruct                  = errors.New("not a struct")
	ErrMissingRequiredConfigValue = errors.New("missing required config value")
)

type ConfigManager struct{}

var _ ConfigLoader = (*ConfigManager)(nil)

func NewConfigManager() *ConfigManager {
	return &ConfigManager{}
}

func (cl *ConfigManager) LoadMeta(i any) (ConfigItemMeta, error) {
	r := reflect.ValueOf(i).Elem() //nolint:varnamelen

	children, err := reflectMeta(r)
	if err != nil {
		return ConfigItemMeta{}, err
	}

	return ConfigItemMeta{
		Name:            "root",
		Field:           r,
		Type:            nil,
		IsRequired:      false,
		HasDefaultValue: false,
		DefaultValue:    "",

		Children: children,
	}, nil
}

// ------------------------
// Load Methods
// ------------------------

func (cl *ConfigManager) LoadMap(resources ...ConfigResource) (*map[string]any, error) {
	target := make(map[string]any)

	for _, resource := range resources {
		err := resource(&target)
		if err != nil {
			return nil, err
		}
	}

	return &target, nil
}

func (cl *ConfigManager) Load(i any, resources ...ConfigResource) error {
	meta, err := cl.LoadMeta(i)
	if err != nil {
		return err
	}

	target, err := cl.LoadMap(resources...)
	if err != nil {
		return err
	}

	err = reflectSet(meta, "", target)
	if err != nil {
		return err
	}

	return nil
}

func (cl *ConfigManager) LoadDefaults(i any) error {
	return cl.Load(
		i,
		cl.FromJSONFile("config.json"),
		cl.FromEnvFile(".env", true),
		cl.FromSystemEnv(true),
	)
}

func reflectMeta( //nolint:cyclop,funlen
	r reflect.Value, //nolint:varnamelen
) ([]ConfigItemMeta, error) {
	result := make([]ConfigItemMeta, 0)

	// Ensure we are working with the struct value, handling pointers
	if r.Kind() == reflect.Ptr {
		r = r.Elem()
	}

	if r.Kind() != reflect.Struct {
		return nil, fmt.Errorf(
			"%w (type=%s)",
			ErrNotStruct,
			r.Type().String(),
		)
	}

	for i := range r.NumField() {
		structField := r.Field(i)
		structFieldType := r.Type().Field(i)

		if structFieldType.Anonymous {
			children, err := reflectMeta(structField)
			if err != nil {
				return nil, err
			}

			if children != nil {
				result = append(result, children...)
			}

			continue
		}

		tag, hasTag := structFieldType.Tag.Lookup(TagConf)
		if !hasTag {
			continue
		}

		_, isRequired := structFieldType.Tag.Lookup(TagRequired)
		defaultValue, hasDefaultValue := structFieldType.Tag.Lookup(TagDefault)

		var children []ConfigItemMeta = nil

		structFieldTypeKind := structFieldType.Type.Kind()

		switch {
		case structFieldTypeKind == reflect.Struct:
			// Pass the struct value directly
			var err error

			children, err = reflectMeta(structField)
			if err != nil {
				return nil, err
			}
		case structFieldTypeKind == reflect.Ptr && structFieldType.Type.Elem().Kind() == reflect.Struct:
			// If it's a pointer to a struct, reflectMeta's check (Ptr -> Elem) will handle dereferencing.
			// Create a zero value of the struct type (the element type)
			// Because we want metadata about the TYPE, not necessarily the value (which might be nil)
			elemType := structFieldType.Type.Elem()
			elemValue := reflect.Zero(elemType)

			var err error

			children, err = reflectMeta(elemValue)
			if err != nil {
				return nil, err
			}
		case structFieldTypeKind == reflect.Slice && structFieldType.Type.Elem().Kind() == reflect.Struct:
			// Special handling for slice of structs to pre-calculate meta for elements
			// We create a dummy zero value of the element type to reflect on it
			elemType := structFieldType.Type.Elem()
			elemValue := reflect.Zero(elemType)

			var err error

			children, err = reflectMeta(elemValue)
			if err != nil {
				return nil, err
			}
		}

		result = append(result, ConfigItemMeta{
			Name:            tag,
			Field:           structField,
			Type:            structFieldType.Type,
			IsRequired:      isRequired,
			HasDefaultValue: hasDefaultValue,
			DefaultValue:    defaultValue,

			Children: children,
		})
	}

	return result, nil
}

func reflectSet( //nolint:cyclop,gocognit,gocyclo,funlen,maintidx
	meta ConfigItemMeta,
	prefix string,
	target *map[string]any,
) error {
	for _, child := range meta.Children {
		key := prefix + child.Name

		if child.Type.Kind() == reflect.Map { //nolint:nestif
			// Create a new map
			newMap := reflect.MakeMap(child.Type)

			// Find all keys that start with our prefix
			prefix := key + Separator
			for targetKey := range *target {
				// if !strings.HasPrefix(targetKey, prefix) {
				if !strings.HasPrefix(strings.ToLower(targetKey), strings.ToLower(prefix)) {
					continue
				}

				// Extract the map key from the flattened key
				// Prefix matching is case-insensitive, and since ASCII case changes
				// don't affect string length, we can safely index with len(prefix).
				mapKey := targetKey[len(prefix):]

				// If there are more separators, this might be a nested key
				// e.g. DICT__KEY__SUBKEY -> map key is KEY
				if idx := strings.Index(mapKey, Separator); idx != -1 {
					mapKey = mapKey[:idx]
				}

				// Normalize map keys to lowercase for consistent lookups.
				// Env vars are uppercase by convention (e.g. DICT__SERVICE_ACCOUNT),
				// but code reads map entries with lowercase keys (e.g. Properties["service_account"]).
				// Without normalization, these would be different Go map keys.
				mapKey = strings.ToLower(mapKey)

				// Create and set the map value
				valueType := child.Type.Elem()
				mapValue := reflect.New(valueType).Elem()

				if valueType.Kind() == reflect.String {
					// For simple string maps, we get the value directly
					// Note: if mapKey had a separator, we are looking at DICT__KEY__...
					// This block expects the value at DICT__KEY exactly.
					// But the loop iterates over all keys starting with DICT__.
					// If we are processing DICT__KEY, we want its value.
					// If we are processing DICT__KEY__SUB, this block shouldn't run for that key?
					// Or rather, we are building the map.
					// Current logic: iterates ALL keys starting with prefix.
					// For each key, extracts the immediate child key.
					// e.g. DICT__KEY1, DICT__KEY2.
					// If duplicate keys map to same mapKey (e.g. DICT__KEY__A, DICT__KEY__B),
					// we might process 'KEY' multiple times.
					// Optimization: we could check if newMap already has this key?
					if newMap.MapIndex(reflect.ValueOf(mapKey)).IsValid() {
						continue
					}

					valAny, valFound := lib.CaseInsensitiveGet(*target, prefix+mapKey)
					if valFound {
						if valStr, ok := valAny.(string); ok {
							mapValue.SetString(valStr)
						}
					}
				}

				// Recursively set the fields of the map value
				// Only if it's a struct or complex type
				if valueType.Kind() == reflect.Struct {
					// We need to check if we already processed this map key to avoid double work?
					// Yes, similar check
					if newMap.MapIndex(reflect.ValueOf(mapKey)).IsValid() {
						continue
					}

					subMeta := ConfigItemMeta{
						Name:            mapKey,
						Field:           mapValue,
						Type:            valueType,
						IsRequired:      child.IsRequired,
						HasDefaultValue: child.HasDefaultValue,
						DefaultValue:    child.DefaultValue,
						Children:        nil,
					}

					children, _ := reflectMeta(mapValue)
					subMeta.Children = children

					err := reflectSet(subMeta, prefix+mapKey+Separator, target)
					if err != nil {
						return err
					}
				}

				// Check if we successfully set something (or if it was a struct that got filled)
				// If mapValue is zero? For structs it might be fine.

				// Set the value in the map
				newMap.SetMapIndex(reflect.ValueOf(mapKey), mapValue)
			}

			child.Field.Set(newMap)

			continue
		}

		if child.Type.Kind() == reflect.Slice { //nolint:nestif
			// Slice support
			// We look for keys like ARR__0, ARR__1, etc.
			// Or ARR__0__FIELD for struct slices.
			// Since we don't know the length beforehand, we scan.
			// Limit scan to reasonable number? Or scan all keys in target?
			// Scanning keys is safer.
			prefix := key + Separator
			maxIndex := -1
			indices := make(map[int]bool)

			for targetKey := range *target {
				if !strings.HasPrefix(strings.ToLower(targetKey), strings.ToLower(prefix)) {
					continue
				}

				// extract index
				rest := targetKey[len(prefix):]
				// find next separator if any
				idxStr, _, _ := strings.Cut(rest, Separator)

				idx, err := strconv.Atoi(idxStr)
				if err == nil && idx >= 0 {
					if idx > maxIndex {
						maxIndex = idx
					}

					indices[idx] = true
				}
			}

			if maxIndex >= 0 {
				// Create slice
				newSlice := reflect.MakeSlice(child.Type, maxIndex+1, maxIndex+1)
				child.Field.Set(newSlice)

				valueType := child.Type.Elem()

				for i := 0; i <= maxIndex; i++ {
					if !indices[i] {
						continue
					}

					sliceElem := child.Field.Index(i)
					indexStr := strconv.Itoa(i)

					if valueType.Kind() == reflect.Struct {
						subMeta := ConfigItemMeta{
							Name:            indexStr,
							Field:           sliceElem,
							Type:            valueType,
							IsRequired:      child.IsRequired,
							HasDefaultValue: child.HasDefaultValue,
							DefaultValue:    child.DefaultValue,
							Children:        nil,
						}

						// We must generate fresh metadata for the slice element instance
						// because the metadata in child.Children refers to the dummy zero value
						// created in reflectMeta, not this specific slice element.
						children, _ := reflectMeta(sliceElem)
						subMeta.Children = children

						err := reflectSet(subMeta, prefix+indexStr+Separator, target)
						if err != nil {
							return err
						}
					} else {
						// Primitive slice
						valKey := prefix + indexStr

						valAny, valFound := lib.CaseInsensitiveGet(*target, valKey)
						if valFound {
							if valStr, ok := valAny.(string); ok {
								reflectSetField(sliceElem, valueType, valStr)
							}
						}
					}
				}
				// child.Field.Set(newSlice) // Already set above
			}

			continue
		}

		if child.Type.Kind() == reflect.Struct {
			err := reflectSet(child, key+Separator, target)
			if err != nil {
				return err
			}

			continue
		}

		// Check if the target map has the key with the child name
		valueAny, valueAnyOk := lib.CaseInsensitiveGet(*target, key)
		value, valueOk := valueAny.(string)

		if !valueAnyOk {
			valueOk = false
		}

		if !valueOk {
			if child.HasDefaultValue {
				reflectSetField(child.Field, child.Type, child.DefaultValue)

				continue
			}

			if child.IsRequired {
				return fmt.Errorf(
					"%w (key=%q, child_name=%q, child_type=%s)",
					ErrMissingRequiredConfigValue,
					key,
					child.Name,
					child.Type.String(),
				)
			}

			continue
		}

		reflectSetField(child.Field, child.Type, value)
	}

	return nil
}

func reflectSetField( //nolint:cyclop,funlen
	field reflect.Value,
	fieldType reflect.Type,
	value string,
) {
	var finalValue reflect.Value

	switch fieldType {
	case reflect.TypeFor[string]():
		finalValue = reflect.ValueOf(value)
	case reflect.TypeFor[int]():
		intValue, _ := strconv.Atoi(value)
		finalValue = reflect.ValueOf(intValue)
	case reflect.TypeFor[int8]():
		int64Value, _ := strconv.ParseInt(value, 10, 8)
		int8Value := int8(int64Value)
		finalValue = reflect.ValueOf(int8Value)
	case reflect.TypeFor[int16]():
		int64Value, _ := strconv.ParseInt(value, 10, 16)
		int16Value := int16(int64Value)
		finalValue = reflect.ValueOf(int16Value)
	case reflect.TypeFor[int32]():
		int64Value, _ := strconv.ParseInt(value, 10, 32)
		int32Value := int32(int64Value)
		finalValue = reflect.ValueOf(int32Value)
	case reflect.TypeFor[int64]():
		int64Value, _ := strconv.ParseInt(value, 10, 64)
		finalValue = reflect.ValueOf(int64Value)
	case reflect.TypeFor[uint]():
		uint64Value, _ := strconv.ParseUint(value, 10, strconv.IntSize)
		uintValue := uint(uint64Value)
		finalValue = reflect.ValueOf(uintValue)
	case reflect.TypeFor[uint8]():
		uint64Value, _ := strconv.ParseUint(value, 10, 8)
		uint8Value := uint8(uint64Value)
		finalValue = reflect.ValueOf(uint8Value)
	case reflect.TypeFor[uint16]():
		uint64Value, _ := strconv.ParseUint(value, 10, 16)
		uint16Value := uint16(uint64Value)
		finalValue = reflect.ValueOf(uint16Value)
	case reflect.TypeFor[uint32]():
		uint64Value, _ := strconv.ParseUint(value, 10, 32)
		uint32Value := uint32(uint64Value)
		finalValue = reflect.ValueOf(uint32Value)
	case reflect.TypeFor[uint64]():
		uint64Value, _ := strconv.ParseUint(value, 10, 64)
		finalValue = reflect.ValueOf(uint64Value)
	case reflect.TypeFor[float32]():
		floatValue, _ := strconv.ParseFloat(value, 32)
		finalValue = reflect.ValueOf(floatValue)
	case reflect.TypeFor[float64]():
		floatValue, _ := strconv.ParseFloat(value, 64)
		finalValue = reflect.ValueOf(floatValue)
	case reflect.TypeFor[bool]():
		boolValue, _ := strconv.ParseBool(value)
		finalValue = reflect.ValueOf(boolValue)
	case reflect.TypeFor[time.Duration]():
		durationValue, _ := time.ParseDuration(value)
		finalValue = reflect.ValueOf(durationValue)
	case reflect.TypeFor[types.MetricInt]():
		var metricInt types.MetricInt

		_ = metricInt.UnmarshalText([]byte(value))
		finalValue = reflect.ValueOf(metricInt)
	case reflect.TypeFor[types.MetricFloat]():
		var metricFloat types.MetricFloat

		_ = metricFloat.UnmarshalText([]byte(value))
		finalValue = reflect.ValueOf(metricFloat)
	default:
		return
	}

	if field.Kind() == reflect.Ptr {
		// Handle pointer types by allocating a new instance
		ptr := reflect.New(fieldType.Elem())
		ptr.Elem().Set(finalValue)
		field.Set(ptr)

		return
	}

	// FIXME(@eser) we might need to control if we can set
	//              the field directly by `field.CanSet()`
	field.Set(finalValue)
}
