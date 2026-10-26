package configfx

import (
	"encoding"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
)

var (
	ErrNotStruct                  = errors.New("not a struct")
	ErrMissingRequiredConfigValue = errors.New("missing required config value")
	ErrInvalidConfigValue         = errors.New("invalid config value")
	ErrUnsettableConfigField      = errors.New("config field cannot be set")
	ErrUnsupportedConfigType      = errors.New("unsupported config field type")
)

// MaxIndexedSliceLength bounds the length that indexed keys can give a slice
// field. The length is the highest index plus one, so without a bound a typo
// such as PATHS__1000000000 would allocate a billion items at start-up.
const MaxIndexedSliceLength = 10_000

// textUnmarshalerType is the interface a field type implements to parse its
// own value, as time.Time, slog.Level and netip.Addr do.
var textUnmarshalerType = reflect.TypeFor[encoding.TextUnmarshaler]()

type ConfigManager struct{}

var _ ConfigLoader = (*ConfigManager)(nil)

func NewConfigManager() *ConfigManager {
	return &ConfigManager{}
}

func (cl *ConfigManager) LoadMeta(i any) (ConfigItemMeta, error) {
	target := reflect.ValueOf(i)

	// Only a non-nil pointer gives fields that reflect can assign, and Elem
	// panics on anything else, so reject other targets here with a message.
	if target.Kind() != reflect.Pointer || target.IsNil() {
		return ConfigItemMeta{}, fmt.Errorf(
			"%w (type=%T): pass a non-nil pointer to the config struct",
			ErrNotStruct,
			i,
		)
	}

	r := target.Elem()

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

	err = reflectSet(&meta, "", target)
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

	// Ensure we are working with the struct value, handling pointers. A nil
	// pointer (an embedded *Base nobody allocated) has no value to reflect
	// on, so its zero struct describes the fields instead; reflectSet then
	// reports them as unsettable rather than panicking.
	if r.Kind() == reflect.Pointer {
		if r.IsNil() {
			r = reflect.Zero(r.Type().Elem())
		} else {
			r = r.Elem()
		}
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
		case isStructSection(structFieldType.Type):
			// Pass the struct value directly
			var err error

			children, err = reflectMeta(structField)
			if err != nil {
				return nil, err
			}
		case structFieldTypeKind == reflect.Pointer && isStructSection(structFieldType.Type.Elem()):
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
		case structFieldTypeKind == reflect.Slice && isStructSection(structFieldType.Type.Elem()):
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

// isTextUnmarshaler reports whether a value of type t parses itself through
// encoding.TextUnmarshaler. Such a type loads from one string, even when it is
// a struct (time.Time) or a slice (net.IP).
func isTextUnmarshaler(t reflect.Type) bool {
	return reflect.PointerTo(t).Implements(textUnmarshalerType)
}

// isStructSection reports whether t is a struct whose conf-tagged fields load
// from nested keys (key__field).
func isStructSection(t reflect.Type) bool {
	return t.Kind() == reflect.Struct && !isTextUnmarshaler(t)
}

func reflectSet(
	meta *ConfigItemMeta,
	prefix string,
	target *map[string]any,
) error {
	for i := range meta.Children {
		child := &meta.Children[i]
		key := prefix + child.Name

		// reflect.Value.Set panics on a field it cannot assign: an unexported
		// field with a conf tag, or one reached through a nil embedded pointer.
		// Fail on every such field, whether or not a value is present, so the
		// mistake shows up on the first load instead of when someone sets it.
		if !child.Field.CanSet() {
			return fmt.Errorf(
				"%w (key=%q, child_name=%q, child_type=%s): "+
					"export the field and reach it through non-nil pointers",
				ErrUnsettableConfigField,
				key,
				child.Name,
				child.Type.String(),
			)
		}

		err := reflectSetChild(child, key, target)
		if err != nil {
			return err
		}
	}

	return nil
}

// reflectSetChild loads one field by the shape of its type.
func reflectSetChild(child *ConfigItemMeta, key string, target *map[string]any) error {
	fieldType := child.Type

	switch {
	case isTextUnmarshaler(fieldType):
		return reflectSetValue(child, key, target)
	case fieldType.Kind() == reflect.Map:
		return reflectSetMap(child, key, target)
	case fieldType.Kind() == reflect.Slice:
		return reflectSetSlice(child, key, target)
	case fieldType.Kind() == reflect.Struct:
		return reflectSet(child, key+Separator, target)
	case fieldType.Kind() == reflect.Pointer && isStructSection(fieldType.Elem()):
		return reflectSetStructPointer(child, key, target)
	default:
		return reflectSetValue(child, key, target)
	}
}

// reflectSetValue loads a field that takes one value: the value at key, else
// the default tag. A missing required value is an error.
func reflectSetValue(child *ConfigItemMeta, key string, target *map[string]any) error {
	value, found := lookupString(*target, key)
	if found {
		err := reflectSetField(child.Field, child.Type, value)
		if err != nil {
			return fmt.Errorf("%w (key=%q, child_name=%q)", err, key, child.Name)
		}

		return nil
	}

	if child.HasDefaultValue {
		// A default that cannot parse is a bug in the struct tag, not in
		// the operator's environment, and it silently produced a zero
		// field exactly like a bad override did.
		err := reflectSetField(child.Field, child.Type, child.DefaultValue)
		if err != nil {
			return fmt.Errorf(
				"%w (key=%q, child_name=%q, source=default)",
				err,
				key,
				child.Name,
			)
		}

		return nil
	}

	if child.IsRequired {
		return missingRequiredError(child, key)
	}

	return nil
}

// reflectSetSlice loads a slice from the first source that has it: a
// comma-separated value at key (PATHS=/a,/b), then indexed keys (PATHS__0,
// or ITEMS__0__NAME for a slice of structs), then the default tag. The value
// at key wins over indexed keys because the environment, which overrides
// config files, sets a list as one value, while JSON arrays arrive as
// indexed keys.
func reflectSetSlice(child *ConfigItemMeta, key string, target *map[string]any) error {
	value, found := lookupString(*target, key)
	if found {
		err := reflectSetList(child.Field, child.Type, value)
		if err != nil {
			return fmt.Errorf("%w (key=%q, child_name=%q)", err, key, child.Name)
		}

		return nil
	}

	found, err := reflectSetIndexedSlice(child, key, target)
	if err != nil || found {
		return err
	}

	if child.HasDefaultValue {
		err := reflectSetList(child.Field, child.Type, child.DefaultValue)
		if err != nil {
			return fmt.Errorf(
				"%w (key=%q, child_name=%q, source=default)",
				err,
				key,
				child.Name,
			)
		}

		return nil
	}

	if child.IsRequired {
		return missingRequiredError(child, key)
	}

	return nil
}

// reflectSetList assigns the comma-separated items of value to a slice field.
// Items are trimmed and empty ones dropped, so an empty value gives an empty
// slice, which lets a later source clear a default.
func reflectSetList(field reflect.Value, sliceType reflect.Type, value string) error {
	items := splitList(value)
	elemType := sliceType.Elem()

	if len(items) > 0 && isStructSection(elemType) {
		return fmt.Errorf(
			"%w (value=%q, expected_type=%s): "+
				"set the items of a list of structs with indexed keys such as key__0__field",
			ErrInvalidConfigValue,
			value,
			sliceType.String(),
		)
	}

	list := reflect.MakeSlice(sliceType, len(items), len(items))

	for i, item := range items {
		err := reflectSetField(list.Index(i), elemType, item)
		if err != nil {
			return fmt.Errorf("%w (index=%d)", err, i)
		}
	}

	field.Set(list)

	return nil
}

// splitList splits a comma-separated value into trimmed, non-empty items.
func splitList(value string) []string {
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))

	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			items = append(items, item)
		}
	}

	return items
}

// reflectSetIndexedSlice loads a slice from indexed keys (ARR__0, ARR__1, or
// ARR__0__FIELD for a slice of structs) and reports whether any was found.
// The length is the highest index plus one; a missing index leaves a zero
// item. An index of MaxIndexedSliceLength or more is an error.
func reflectSetIndexedSlice(
	child *ConfigItemMeta,
	key string,
	target *map[string]any,
) (bool, error) {
	// Since we don't know the length beforehand, scan the keys in target.
	prefix := key + Separator
	maxIndex := -1
	maxIndexKey := ""
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
				maxIndexKey = targetKey
			}

			indices[idx] = true
		}
	}

	if maxIndex < 0 {
		return false, nil
	}

	if maxIndex >= MaxIndexedSliceLength {
		return true, fmt.Errorf(
			"%w (key=%q, index=%d): a list loaded from indexed keys holds at most %d items, "+
				"use indices 0 to %d",
			ErrInvalidConfigValue,
			maxIndexKey,
			maxIndex,
			MaxIndexedSliceLength,
			MaxIndexedSliceLength-1,
		)
	}

	newSlice := reflect.MakeSlice(child.Type, maxIndex+1, maxIndex+1)
	child.Field.Set(newSlice)

	valueType := child.Type.Elem()

	for i := 0; i <= maxIndex; i++ {
		if !indices[i] {
			continue
		}

		sliceElem := child.Field.Index(i)
		indexStr := strconv.Itoa(i)

		if !isStructSection(valueType) {
			valKey := prefix + indexStr

			valStr, valFound := lookupString(*target, valKey)
			if !valFound {
				continue
			}

			err := reflectSetField(sliceElem, valueType, valStr)
			if err != nil {
				return true, fmt.Errorf("%w (key=%q)", err, valKey)
			}

			continue
		}

		// We must generate fresh metadata for the slice element instance
		// because the metadata in child.Children refers to the dummy zero value
		// created in reflectMeta, not this specific slice element.
		children, err := reflectMeta(sliceElem)
		if err != nil {
			return true, fmt.Errorf("%w (key=%q)", err, prefix+indexStr)
		}

		subMeta := ConfigItemMeta{
			Name:            indexStr,
			Field:           sliceElem,
			Type:            valueType,
			IsRequired:      child.IsRequired,
			HasDefaultValue: child.HasDefaultValue,
			DefaultValue:    child.DefaultValue,
			Children:        children,
		}

		err = reflectSet(&subMeta, prefix+indexStr+Separator, target)
		if err != nil {
			return true, err
		}
	}

	return true, nil
}

// reflectSetMap loads a map from the keys under key (DICT__NAME). Map keys are
// lowercased; a struct value loads from the keys under its entry
// (DICT__NAME__FIELD), any other value from the entry's own key.
func reflectSetMap(
	child *ConfigItemMeta,
	key string,
	target *map[string]any,
) error {
	keyType := child.Type.Key()
	if keyType.Kind() != reflect.String {
		return fmt.Errorf(
			"%w (key=%q, child_name=%q, child_type=%s): map keys must be strings",
			ErrUnsupportedConfigType,
			key,
			child.Name,
			child.Type.String(),
		)
	}

	// Create a new map
	newMap := reflect.MakeMap(child.Type)
	valueType := child.Type.Elem()

	// Find all keys that start with our prefix
	prefix := key + Separator
	for targetKey := range *target {
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
		mapKeyValue := reflect.ValueOf(mapKey).Convert(keyType)

		// Several flattened keys can name the same entry (DICT__KEY__A and
		// DICT__KEY__B), so an entry is built once.
		if newMap.MapIndex(mapKeyValue).IsValid() {
			continue
		}

		mapValue := reflect.New(valueType).Elem()

		if isStructSection(valueType) {
			children, err := reflectMeta(mapValue)
			if err != nil {
				return fmt.Errorf("%w (key=%q)", err, prefix+mapKey)
			}

			subMeta := ConfigItemMeta{
				Name:            mapKey,
				Field:           mapValue,
				Type:            valueType,
				IsRequired:      child.IsRequired,
				HasDefaultValue: child.HasDefaultValue,
				DefaultValue:    child.DefaultValue,
				Children:        children,
			}

			err = reflectSet(&subMeta, prefix+mapKey+Separator, target)
			if err != nil {
				return err
			}
		} else {
			// A value of any other type comes from the entry's own key
			// (DICT__KEY). An entry that only has nested keys under it
			// keeps the zero value.
			valueKey := prefix + mapKey

			valStr, valFound := lookupString(*target, valueKey)
			if valFound {
				err := reflectSetField(mapValue, valueType, valStr)
				if err != nil {
					return fmt.Errorf("%w (key=%q)", err, valueKey)
				}
			}
		}

		newMap.SetMapIndex(mapKeyValue, mapValue)
	}

	child.Field.Set(newMap)

	return nil
}

// reflectSetStructPointer loads a pointer to a struct section. A nil pointer
// stays nil unless a source sets the key or a key under it, so an absent
// optional section is not filled with its defaults. A non-nil pointer loads
// like a nested struct.
func reflectSetStructPointer(child *ConfigItemMeta, key string, target *map[string]any) error {
	section := child.Field

	if section.IsNil() {
		if !hasKeyAtOrUnder(*target, key) {
			if child.IsRequired {
				return missingRequiredError(child, key)
			}

			return nil
		}

		section = reflect.New(child.Type.Elem())
	}

	children, err := reflectMeta(section)
	if err != nil {
		return fmt.Errorf("%w (key=%q)", err, key)
	}

	sectionMeta := ConfigItemMeta{
		Name:            child.Name,
		Field:           section.Elem(),
		Type:            child.Type.Elem(),
		IsRequired:      child.IsRequired,
		HasDefaultValue: child.HasDefaultValue,
		DefaultValue:    child.DefaultValue,
		Children:        children,
	}

	err = reflectSet(&sectionMeta, key+Separator, target)
	if err != nil {
		return err
	}

	child.Field.Set(section)

	return nil
}

// lookupString returns the string value at key, matched case-insensitively.
// A value of another type counts as missing.
func lookupString(target map[string]any, key string) (string, bool) {
	valueAny, found := lib.CaseInsensitiveGet(target, key)
	if !found {
		return "", false
	}

	value, isString := valueAny.(string)

	return value, isString
}

// hasKeyAtOrUnder reports whether target has key itself or a key nested
// under it (key__...), matched case-insensitively.
func hasKeyAtOrUnder(target map[string]any, key string) bool {
	prefix := strings.ToLower(key + Separator)

	for targetKey := range target {
		if strings.EqualFold(targetKey, key) ||
			strings.HasPrefix(strings.ToLower(targetKey), prefix) {
			return true
		}
	}

	return false
}

func missingRequiredError(child *ConfigItemMeta, key string) error {
	return fmt.Errorf(
		"%w (key=%q, child_name=%q, child_type=%s)",
		ErrMissingRequiredConfigValue,
		key,
		child.Name,
		child.Type.String(),
	)
}

// reflectSetField converts value to fieldType and assigns it.
//
// Every conversion error is returned rather than discarded. It used to drop all
// of them into `_` and had no error return at all, so a malformed override was
// silently assigned the zero value AND beat the declared default: PORT=xyz
// produced port=0 with a nil error. Zero is not an inert placeholder in this
// codebase -- net/http reads a zero Read/WriteTimeout as "no timeout", and
// duration fields with real defaults exist across httpfx, httpclient, connfx,
// aifx and workerfx. A typo in a deploy environment silently removed the
// timeouts it was supposed to configure.
//
// A pointer type gets a newly allocated value, so a field such as Port *int
// stays nil until a source or a default sets it.
func reflectSetField(
	field reflect.Value,
	fieldType reflect.Type,
	value string,
) error {
	if fieldType.Kind() == reflect.Pointer {
		elem := reflect.New(fieldType.Elem())

		err := reflectSetField(elem.Elem(), fieldType.Elem(), value)
		if err != nil {
			return err
		}

		field.Set(elem)

		return nil
	}

	finalValue, err := parseConfigValue(fieldType, value)
	if err != nil {
		return err
	}

	// Callers pass a field reflectSet checked with CanSet, an element of a
	// slice held in one, or a map value they created, so Set cannot panic.
	field.Set(finalValue)

	return nil
}

// parseConfigValue converts value to a value of fieldType. A type that
// implements encoding.TextUnmarshaler parses itself, time.Duration takes Go
// duration syntax (30s), and other types convert by kind, so a named type
// such as `type Mode string` loads like its underlying type.
func parseConfigValue(
	fieldType reflect.Type,
	value string,
) (reflect.Value, error) {
	target := reflect.New(fieldType)

	if unmarshaler, ok := target.Interface().(encoding.TextUnmarshaler); ok {
		err := unmarshaler.UnmarshalText([]byte(value))
		if err != nil {
			return reflect.Value{}, invalidValueError(fieldType, value, err)
		}

		return target.Elem(), nil
	}

	result := target.Elem()

	if fieldType == reflect.TypeFor[time.Duration]() {
		durationValue, err := time.ParseDuration(value)
		if err != nil {
			return reflect.Value{}, invalidValueError(fieldType, value, err)
		}

		result.SetInt(int64(durationValue))

		return result, nil
	}

	switch fieldType.Kind() {
	case reflect.String:
		result.SetString(value)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		intValue, err := strconv.ParseInt(value, 10, fieldType.Bits())
		if err != nil {
			return reflect.Value{}, invalidValueError(fieldType, value, err)
		}

		result.SetInt(intValue)
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		uintValue, err := strconv.ParseUint(value, 10, fieldType.Bits())
		if err != nil {
			return reflect.Value{}, invalidValueError(fieldType, value, err)
		}

		result.SetUint(uintValue)
	case reflect.Float32, reflect.Float64:
		floatValue, err := strconv.ParseFloat(value, fieldType.Bits())
		if err != nil {
			return reflect.Value{}, invalidValueError(fieldType, value, err)
		}

		result.SetFloat(floatValue)
	case reflect.Bool:
		boolValue, err := strconv.ParseBool(value)
		if err != nil {
			return reflect.Value{}, invalidValueError(fieldType, value, err)
		}

		result.SetBool(boolValue)
	case reflect.Interface:
		// Only an empty interface (any) can hold the raw string.
		if fieldType.NumMethod() != 0 {
			return reflect.Value{}, unsupportedTypeError(fieldType)
		}

		result.Set(reflect.ValueOf(value))
	default:
		return reflect.Value{}, unsupportedTypeError(fieldType)
	}

	return result, nil
}

// unsupportedTypeError names a field type configfx cannot load from a string.
func unsupportedTypeError(fieldType reflect.Type) error {
	return fmt.Errorf(
		"%w (type=%s): use a string, bool, number, time.Duration or "+
			"encoding.TextUnmarshaler type, or a slice, map or pointer of one",
		ErrUnsupportedConfigType,
		fieldType.String(),
	)
}

// invalidValueError names the offending value and the type it could not become.
// The caller adds the key path, which is what an operator actually needs.
func invalidValueError(
	fieldType reflect.Type,
	value string,
	cause error,
) error {
	return fmt.Errorf(
		"%w (value=%q, expected_type=%s): %w",
		ErrInvalidConfigValue,
		value,
		fieldType.String(),
		cause,
	)
}
