# 🔄 [@eserstack/formats](./)

`@eserstack/formats` converts data to and from JSON, JSONL, YAML, CSV and TOML
through one API. Each format is a plain object with a writer and a streaming
reader, kept in a registry you can extend with your own formats. When the
`@eserstack/ajan` native library is available, `serialize` and `deserialize` use
its Go encoders and fall back to the TypeScript formats otherwise.

Install it with `pnpm add jsr:@eserstack/formats`.

## Quick Start

Register the built-in formats once, then serialize and deserialize by format
name or file extension:

```typescript
import * as formats from "@eserstack/formats";

formats.registerBuiltinFormats();

const json = await formats.serialize({ name: "app", replicas: 3 }, "json");
// '{"name":"app","replicas":3}\n'

const items = await formats.deserialize(json, "json");
// [{ name: "app", replicas: 3 }]
```

Importing the package registers nothing; `registerBuiltinFormats()` is opt-in.

## Serializing and Deserializing

`serialize(data, format, options?)` returns the encoded text. An array becomes a
list of its items: a JSON array, YAML sequence entries or YAML documents (see Go
and TypeScript Output below), CSV rows, JSONL lines, or TOML tables separated by
`+++` lines. Any other value becomes a single document:
`serialize({ name: "app" }, "json")` returns `{"name":"app"}` and a newline, the
same call with `"yaml"` returns the mapping `name: app`, and with `"toml"` the
table `name = "app"`.

```typescript
import * as formats from "@eserstack/formats";

formats.registerBuiltinFormats();

const rows = [
  { name: "app1", version: "1.0.0" },
  { name: "app2", version: "2.0.0" },
];

const csv = await formats.serialize(rows, "csv");
const json = await formats.serialize(rows, "json", { pretty: true });
```

`deserialize(input, format, options?)` always returns an array of items. CSV
reads the first row as headers unless you pass `headers`:

```typescript
import * as formats from "@eserstack/formats";

formats.registerBuiltinFormats();

const parsed = await formats.deserialize(
  "app1,1.0.0\napp2,2.0.0\n",
  "csv",
  { headers: ["name", "version"] },
);
```

| Option      | Formats    | Description                                                                                                                             |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pretty`    | JSON, TOML | JSON: indent the output, two spaces unless `indent` says otherwise. TOML, TypeScript formats only: `false` stops aligning the `=` signs |
| `indent`    | JSON, YAML | Indentation width, two spaces by default; JSON applies it only when `pretty` is on                                                      |
| `headers`   | CSV        | Column names to write or to read rows with                                                                                              |
| `delimiter` | CSV        | Field separator, `,` by default                                                                                                         |

An unknown format name throws `FormatNotFoundError`; a value a format cannot
encode or decode throws `SerializationError` or `DeserializationError`. All
three extend `FormatError` and carry the format name in `format`.

### Go and TypeScript Output

The Go encoders and the TypeScript formats write the same data, but the text
differs in these cases:

| Case                      | Go encoders (native library)         | TypeScript formats                            |
| ------------------------- | ------------------------------------ | --------------------------------------------- |
| YAML, array               | One sequence, `-` per item           | One document per item, `---` between          |
| Map key order             | Sorted                               | Insertion order                               |
| TOML keys                 | `key = value`                        | `=` signs aligned, unless `pretty` is `false` |
| TOML arrays               | `[80, 443]`                          | `[80,443]`                                    |
| TOML table of tables only | An empty `[a]` header before `[a.b]` | `[a.b]` alone                                 |
| CSV line endings          | `\n`                                 | `\r\n`                                        |

## Registry

The package keeps one global registry. A format is found by its name or by any
of its extensions (`yml` finds `yaml`, `ndjson` finds `jsonl`):

```typescript
import * as formats from "@eserstack/formats";

formats.registerBuiltinFormats();

formats.hasFormat("yml"); // true
formats.listFormats().map((format) => format.name);
// ["json", "jsonl", "yaml", "csv", "toml"]
```

To register only some formats, pass the format objects yourself, and use
`createRegistry()` for a registry of your own:

```typescript
import * as formats from "@eserstack/formats";

formats.registerFormat(formats.jsonFormat);

const registry = formats.createRegistry();
registry.register(formats.csvFormat);
registry.get("csv"); // the CSV format
```

| Function                   | Description                              |
| -------------------------- | ---------------------------------------- |
| `registerBuiltinFormats()` | Register JSON, JSONL, YAML, CSV and TOML |
| `registerFormat(format)`   | Add a format to the global registry      |
| `unregisterFormat(name)`   | Remove a format and its extensions       |
| `getFormat(nameOrExt)`     | Return a format, or `undefined`          |
| `hasFormat(nameOrExt)`     | Check whether a format is registered     |
| `listFormats()`            | List each registered format once         |
| `createRegistry()`         | Create an empty, independent registry    |

| Format        | Name    | Extensions        | Streamable |
| ------------- | ------- | ----------------- | ---------- |
| `jsonFormat`  | `json`  | `json`            | No         |
| `jsonlFormat` | `jsonl` | `jsonl`, `ndjson` | Yes        |
| `yamlFormat`  | `yaml`  | `yaml`, `yml`     | No         |
| `csvFormat`   | `csv`   | `csv`             | Yes        |
| `tomlFormat`  | `toml`  | `toml`            | No         |

## Custom Formats

A format implements `Format`: a name, its extensions, `writeItem` for output and
`createReader` for input. `writeStart` and `writeEnd` are optional:

```typescript
import * as formats from "@eserstack/formats";

const linesFormat: formats.Format = {
  name: "lines",
  extensions: ["txt"],
  streamable: true,
  writeItem: (data) => `${String(data)}\n`,
  createReader: () => {
    let buffer = "";
    return {
      push: (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        return lines;
      },
      flush: () => (buffer === "" ? [] : [buffer]),
    };
  },
};

formats.registerFormat(linesFormat);
```

## Stream Layers

`formats.streamLayers` turns a format into a `@eserstack/streams` layer:
`writerLayer(format)` serializes each chunk, and `readerLayer(format)` parses
string chunks into items as they arrive.

```typescript
import * as formats from "@eserstack/formats";
import * as streams from "@eserstack/streams";

formats.registerBuiltinFormats();

const lines = await streams.pipeline()
  .from(streams.sources.values({ id: 1 }, { id: 2 }))
  .through(formats.streamLayers.writerLayer("jsonl"))
  .collect<string>();
// ['{"id":1}\n', '{"id":2}\n']
```

## Native Adapter

`ffiFormats` calls the Go encoders in `@eserstack/ajan` directly, with no
TypeScript fallback, behind the `Loader` port. Its errors are `FormatFfiError`
with a `code` of `FORMAT_ENCODE_FAILED`, `FORMAT_DECODE_FAILED`,
`FORMAT_NOT_FOUND` or `FORMAT_LIST_FAILED`.

```typescript
import * as formats from "@eserstack/formats";

const toml = await formats.encodeDocumentWith(formats.ffiFormats, "toml", [
  { name: "app" },
]);
const supported = await formats.listFormatsWith(formats.ffiFormats);
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `serialize()` with a value that is not an array writes one document instead of
  a one-item list: JSON `{"a":1}\n` instead of `[{"a":1}\n]\n`, and YAML a
  mapping instead of a sequence. Pass an array to get a list:
  `formats.serialize([value], "json")`.
- Pretty JSON arrays match `JSON.stringify(items, null, indent)`, with items
  indented and no blank line before `]`. Through the native library, YAML now
  indents 2 spaces, TOML whole numbers are integers, and `<`, `>` and `&` are no
  longer escaped, as in the TypeScript formats. Update golden files that compare
  exact text.

## 🔗 Links

- [JSR package](https://jsr.io/@eserstack/formats): the API reference generated
  from source
- [eser/stack on GitHub](https://github.com/eser/stack)
