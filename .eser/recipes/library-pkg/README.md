# 🧱 [@eserstack/package-name](./)

`@eserstack/package-name` builds greetings. Replace this paragraph with what the
package does, who it is for and the design choice that shapes its API.

## Quick Start

Import the package as a namespace and call `greet`. It returns a `Result` from
`@eserstack/primitives`, so check it before reading the greeting:

```typescript
import * as packageName from "@eserstack/package-name";
import * as primitives from "@eserstack/primitives";

const result = packageName.greet("World");

if (primitives.results.isOk(result)) {
  console.log(result.value); // "Hello, World!"
}
```

## API

### `greet(name)`

Returns `Ok` with a greeting for `name`, with surrounding whitespace removed. An
empty name returns `Fail` with an `Error` instead of throwing.

```typescript
import * as packageName from "@eserstack/package-name";
import * as primitives from "@eserstack/primitives";

const result = packageName.greet("  ");

if (primitives.results.isFail(result)) {
  console.error(result.error.message); // "name is empty"
}
```

## 🔗 Links

- [JSR package](https://jsr.io/@eserstack/package-name): the API reference
  generated from source
- [eser/stack on GitHub](https://github.com/eser/stack)
