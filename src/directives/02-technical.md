# 📓 [hex/directives/technical](https://github.com/eserozvataf/hex/tree/development/src/directives/technical)

## Technical Directives

**hex** is the name of the ecosystem, which consists of many sub-components.
Although each component of hex has its own nature, we believe that similar
philosophy can be shared across the ecosystem.

### Architectural Rules

- **DO** use ES Modules instead of its alternatives.
- **CONSIDER** using buildless alternatives.
- **AVOID** transpiling and compile-time macro generation.

### Coding Mindset Rules

- **DO** make your functions do one thing only.
- **DO** use early returns whenever possible.
- **DO** prefer composition over inheritance.
- **DO** prefer promises over callbacks.
- **DO** prefer template strings over string concatenation.
- **DO** use plain `for loops` if there's a case for `break`/`continue`.
- **DO NOT** use global variables.
- **CONSIDER** not mutating objects.
- **AVOID** side-effect generation in non-pure functions.
- **AVOID** using classes.

### Defensive Coding Rules

- **DO** use strict equal checking.
- **DO** add semicolons always.
- **DO** prefer `for..of loops` to go over the values of the array.
- **DO** prefer `Number()` for string to number conversions.
- **DO NOT** use `eval`.
- **DO NOT** use `prototype`.
- **DO NOT** use `Object.defineProperty`.
- **DO NOT** use `var`. Instead, use `const` and `let`.
- **DO NOT** use `||` for undefined and null checks. Instead, use nullish
  coalescing (`??`) operator.
- **DO NOT** use `arguments` object in functions. Instead, use rest (`...`)
  operator.
- **DO NOT** use `window` object. Instead, use `globalThis`.
- **DO NOT** use `typeof` operator. Instead, use `instanceof` or `.constructor`
  property.
- **CONSIDER** initializing variables with `null` instead of `undefined`.
- **CONSIDER** using `try..catch` for `JSON.stringify` and `JSON.parse`.
- **AVOID** the `new` keyword.
- **AVOID** nesting or chaining loops.
- **AVOID** truthy and falsy checks unless the variable/return type is a
  boolean. Instead, use full condition. (ex: `array.length === 0`)
- **AVOID** `import *`. Instead, just use whatever needed.
