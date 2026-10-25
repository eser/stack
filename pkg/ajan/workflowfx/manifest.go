// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
	"gopkg.in/yaml.v3"
)

// ManifestFilenames are the manifest paths LoadManifest tries, relative to
// the project directory, in priority order: the first one found wins.
var ManifestFilenames = []string{ //nolint:gochecknoglobals
	".eser/manifest.yml",
	".eser/manifest.yaml",
	".manifest.yml",  // legacy fallback
	".manifest.yaml", // legacy fallback
}

// MaxStepTimeout is the longest step timeout a manifest may give: the
// longest delay the TypeScript engine's timers hold (2^31-1 ms), in whole
// seconds, so one manifest means the same on both engines.
const MaxStepTimeout = 2_147_483 * time.Second

var (
	// ErrManifestNotFound is returned by LoadManifest when the directory has
	// none of ManifestFilenames.
	ErrManifestNotFound = errors.New("no manifest found")
	// ErrInvalidManifest wraps every ManifestError.
	ErrInvalidManifest = errors.New("invalid manifest")
)

// manifestSchemaJSON is docs/schema/manifest.json; a test keeps the two equal.
//
//go:embed manifest_schema.json
var manifestSchemaJSON string

// ManifestError is a problem at one place in a manifest file. Path is the
// YAML path of the value, such as "workflows[0].steps[3].shell.timeout", and
// Line its 1-based line, or 0 when unknown.
type ManifestError struct {
	File    string
	Path    string
	Line    int
	Message string
}

func (e *ManifestError) Error() string {
	location := e.File
	if e.Line > 0 {
		location += ":" + strconv.Itoa(e.Line)
	}

	path := e.Path
	if path == "" {
		path = "(root)"
	}

	return fmt.Sprintf("%s: %s: %s", location, path, e.Message)
}

func (e *ManifestError) Unwrap() error { return ErrInvalidManifest }

// ScriptConfig is one entry of the manifest's scripts map. A script given as
// a plain string has only Command.
type ScriptConfig struct {
	Command          string
	Description      string
	WorkingDirectory string
	Depends          []string
}

// LoadManifest reads the first of ManifestFilenames found in dir and parses
// it with ParseManifest. It returns ErrManifestNotFound when there is none.
func LoadManifest(dir string) (*WorkflowsConfig, error) {
	for _, name := range ManifestFilenames {
		path := filepath.Join(dir, name)

		content, err := os.ReadFile(path) //nolint:gosec // G304: the caller's project dir joined with a fixed manifest name
		if errors.Is(err, os.ErrNotExist) {
			continue
		}

		if err != nil {
			return nil, fmt.Errorf("read manifest %s: %w", path, err)
		}

		return ParseManifest(path, content)
	}

	return nil, fmt.Errorf("%w in %s (tried %s)", ErrManifestNotFound, dir, strings.Join(ManifestFilenames, ", "))
}

// ParseManifest parses manifest YAML, validates it against the manifest
// schema (docs/schema/manifest.json), and turns its workflows into
// definitions and its scripts into ScriptConfig values. file names the
// manifest in errors. Every problem found comes back as a *ManifestError
// (joined with errors.Join when there are several), naming the file, the
// YAML path and the line.
func ParseManifest(file string, content []byte) (*WorkflowsConfig, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal(content, &doc); err != nil {
		return nil, yamlSyntaxError(file, err)
	}

	root := documentRoot(&doc)
	if root == nil {
		return &WorkflowsConfig{}, nil //nolint:exhaustruct
	}

	var raw any
	if err := root.Decode(&raw); err != nil {
		return nil, &ManifestError{File: file, Line: root.Line, Message: err.Error()} //nolint:exhaustruct
	}

	if err := validateManifestSchema(file, root, raw); err != nil {
		return nil, err
	}

	return buildManifest(file, root, raw)
}

func yamlSyntaxError(file string, err error) error {
	var typeErr *yaml.TypeError
	if errors.As(err, &typeErr) {
		return &ManifestError{File: file, Message: strings.Join(typeErr.Errors, "; ")} //nolint:exhaustruct
	}

	// yaml.v3 reports syntax errors as "yaml: line N: message".
	msg := strings.TrimPrefix(err.Error(), "yaml: ")
	line := 0

	if rest, ok := strings.CutPrefix(msg, "line "); ok {
		if n, after, found := strings.Cut(rest, ": "); found {
			if parsed, convErr := strconv.Atoi(n); convErr == nil {
				line, msg = parsed, after
			}
		}
	}

	return &ManifestError{File: file, Line: line, Message: "YAML syntax: " + msg} //nolint:exhaustruct
}

func documentRoot(doc *yaml.Node) *yaml.Node {
	if doc.Kind == yaml.DocumentNode && len(doc.Content) > 0 {
		return doc.Content[0]
	}

	if doc.Kind == 0 {
		return nil
	}

	return doc
}

var compiledManifestSchema = sync.OnceValues(func() (*jsonschema.Schema, error) { //nolint:gochecknoglobals
	schemaDoc, err := jsonschema.UnmarshalJSON(strings.NewReader(manifestSchemaJSON))
	if err != nil {
		return nil, fmt.Errorf("manifest schema: %w", err)
	}

	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource("manifest.json", schemaDoc); err != nil {
		return nil, fmt.Errorf("manifest schema: %w", err)
	}

	return compiler.Compile("manifest.json")
})

func validateManifestSchema(file string, root *yaml.Node, raw any) error {
	schema, err := compiledManifestSchema()
	if err != nil {
		return err
	}

	// A JSON round trip gives the validator the value types it expects
	// (float64 numbers, map[string]any objects).
	data, err := json.Marshal(raw)
	if err != nil {
		return &ManifestError{File: file, Line: root.Line, Message: err.Error()} //nolint:exhaustruct
	}

	instance, err := jsonschema.UnmarshalJSON(strings.NewReader(string(data)))
	if err != nil {
		return &ManifestError{File: file, Line: root.Line, Message: err.Error()} //nolint:exhaustruct
	}

	validationErr := schema.Validate(instance)
	if validationErr == nil {
		return nil
	}

	var verr *jsonschema.ValidationError
	if !errors.As(validationErr, &verr) {
		return &ManifestError{File: file, Message: validationErr.Error()} //nolint:exhaustruct
	}

	printer := message.NewPrinter(language.English)

	var errs []error

	seen := make(map[string]bool)

	add := func(path string, line int, msg string) {
		key := path + "\x00" + msg
		if !seen[key] {
			seen[key] = true

			errs = append(errs, &ManifestError{File: file, Path: path, Line: line, Message: msg})
		}
	}

	for _, leaf := range validationLeaves(verr) {
		node, path := nodeAt(root, leaf.InstanceLocation)

		// An unknown key is reported at the key, not at the object holding it.
		if extra, ok := leaf.ErrorKind.(*kind.AdditionalProperties); ok {
			for _, property := range extra.Properties {
				add(joinPath(path, property), keyLine(node, property), "unknown key '"+property+"'")
			}

			continue
		}

		add(path, node.Line, leaf.ErrorKind.LocalizedString(printer))
	}

	return errors.Join(errs...)
}

func joinPath(path, key string) string {
	if path == "" {
		return key
	}

	return path + "." + key
}

// keyLine returns the line of key in a mapping node, or the node's own line.
func keyLine(node *yaml.Node, key string) int {
	if node.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(node.Content); i += 2 {
			if node.Content[i].Value == key {
				return node.Content[i].Line
			}
		}
	}

	return node.Line
}

// validationLeaves returns the innermost causes, which name the exact value
// that failed; a oneOf failure keeps the deepest alternative's causes.
func validationLeaves(err *jsonschema.ValidationError) []*jsonschema.ValidationError {
	if len(err.Causes) == 0 {
		return []*jsonschema.ValidationError{err}
	}

	var all []*jsonschema.ValidationError

	deepest := 0

	for _, cause := range err.Causes {
		for _, leaf := range validationLeaves(cause) {
			all = append(all, leaf)
			deepest = max(deepest, len(leaf.InstanceLocation))
		}
	}

	return slices.DeleteFunc(all, func(leaf *jsonschema.ValidationError) bool {
		return len(leaf.InstanceLocation) < deepest
	})
}

// nodeAt follows a JSON instance location through the YAML tree and returns
// the deepest node reached and its YAML path.
func nodeAt(root *yaml.Node, location []string) (*yaml.Node, string) {
	node := root

	var path strings.Builder

	for _, token := range location {
		next := childNode(node, token)
		if next == nil {
			break
		}

		if node.Kind == yaml.SequenceNode {
			path.WriteString("[" + token + "]")
		} else {
			if path.Len() > 0 {
				path.WriteString(".")
			}

			path.WriteString(token)
		}

		node = next
	}

	return node, path.String()
}

func childNode(node *yaml.Node, token string) *yaml.Node {
	switch node.Kind { //nolint:exhaustive
	case yaml.MappingNode:
		for i := 0; i+1 < len(node.Content); i += 2 {
			if node.Content[i].Value == token {
				return node.Content[i+1]
			}
		}
	case yaml.SequenceNode:
		index, err := strconv.Atoi(token)
		if err == nil && index >= 0 && index < len(node.Content) {
			return node.Content[index]
		}
	case yaml.AliasNode:
		return childNode(node.Alias, token)
	}

	return nil
}

// stepDirectives are the step option keys the engine consumes; the tool never
// sees them.
var stepDirectives = []string{"continueOnError", "timeout", "if", "bypass", "loop", "inputSchema"} //nolint:gochecknoglobals

func buildManifest(file string, root *yaml.Node, raw any) (*WorkflowsConfig, error) {
	top, _ := raw.(map[string]any)
	config := &WorkflowsConfig{} //nolint:exhaustruct

	for _, item := range asSlice(top["stack"]) {
		config.Stack = append(config.Stack, item.(string)) //nolint:forcetypeassert // the schema allows strings only
	}

	var errs []error

	for i, item := range asSlice(top["workflows"]) {
		def, err := buildWorkflow(file, root, i, item.(map[string]any)) //nolint:forcetypeassert // the schema allows objects only
		if err != nil {
			errs = append(errs, err)

			continue
		}

		config.Workflows = append(config.Workflows, def)
	}

	if scripts, ok := top["scripts"].(map[string]any); ok {
		config.Scripts = make(map[string]ScriptConfig, len(scripts))

		for name, value := range scripts {
			config.Scripts[name] = buildScript(value)
		}
	}

	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}

	return config, nil
}

func buildWorkflow(file string, root *yaml.Node, index int, raw map[string]any) (*WorkflowDefinition, error) {
	def := &WorkflowDefinition{ //nolint:exhaustruct
		ID: raw["id"].(string), //nolint:forcetypeassert // required string in the schema
	}

	for _, event := range asSlice(raw["on"]) {
		def.On = append(def.On, event.(string)) //nolint:forcetypeassert // the schema allows strings only
	}

	for _, include := range asSlice(raw["includes"]) {
		def.Includes = append(def.Includes, include.(string)) //nolint:forcetypeassert // the schema allows strings only
	}

	var errs []error

	for j, step := range asSlice(raw["steps"]) {
		location := []string{"workflows", strconv.Itoa(index), "steps", strconv.Itoa(j)}

		cfg, err := buildStep(step)
		if err != nil {
			node, path := nodeAt(root, location)
			errs = append(errs, &ManifestError{File: file, Path: path, Line: node.Line, Message: err.Error()})

			continue
		}

		def.Steps = append(def.Steps, cfg)
	}

	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}

	return def, nil
}

// buildStep turns one schema-valid step into a StepConfig: a string names a
// tool with no options; a one-key map names the tool and holds its options,
// from which the engine directives are taken out.
func buildStep(step any) (StepConfig, error) {
	if name, ok := step.(string); ok {
		return StepConfig{Name: name, Options: map[string]any{}}, nil //nolint:exhaustruct
	}

	entry := step.(map[string]any) //nolint:forcetypeassert // the schema allows a string or a one-key object

	var (
		name    string
		options map[string]any
	)

	for key, value := range entry {
		name = key
		options, _ = value.(map[string]any)
	}

	cfg := StepConfig{Name: name, Options: make(map[string]any, len(options))} //nolint:exhaustruct

	for key, value := range options {
		if !slices.Contains(stepDirectives, key) {
			cfg.Options[key] = value

			continue
		}

		switch key {
		case "continueOnError":
			cfg.ContinueOnError, _ = value.(bool)
		case "bypass":
			cfg.Bypass, _ = value.(bool)
		case "if":
			cfg.If, _ = value.(string)
		case "timeout":
			cfg.Timeout = secondsToDuration(value)
		case "loop":
			loop, _ := value.(map[string]any)
			cfg.Loop = &LoopConfig{} //nolint:exhaustruct
			cfg.Loop.Over, _ = loop["over"].(string)
			cfg.Loop.As, _ = loop["as"].(string)
			cfg.Loop.AsIndex, _ = loop["asIndex"].(string)
		case "inputSchema":
			schema, err := json.Marshal(value)
			if err != nil {
				return StepConfig{}, fmt.Errorf("inputSchema: %w", err) //nolint:exhaustruct
			}

			cfg.InputSchema = schema
		}
	}

	return cfg, nil
}

// secondsToDuration converts a schema-checked number of seconds (above 0,
// at most MaxStepTimeout) to a duration.
func secondsToDuration(value any) time.Duration {
	switch seconds := value.(type) {
	case int:
		return time.Duration(seconds) * time.Second
	case float64:
		return time.Duration(seconds * float64(time.Second))
	default:
		return 0
	}
}

func buildScript(value any) ScriptConfig {
	if command, ok := value.(string); ok {
		return ScriptConfig{Command: command} //nolint:exhaustruct
	}

	entry, _ := value.(map[string]any)
	script := ScriptConfig{} //nolint:exhaustruct
	script.Command, _ = entry["command"].(string)
	script.Description, _ = entry["description"].(string)
	script.WorkingDirectory, _ = entry["workingDirectory"].(string)

	for _, dep := range asSlice(entry["depends"]) {
		script.Depends = append(script.Depends, dep.(string)) //nolint:forcetypeassert // the schema allows strings only
	}

	return script
}

func asSlice(value any) []any {
	items, _ := value.([]any)

	return items
}
