# 📓 [cool/directives/technical](./02-technical.md)

## Technical Directives

**cool** is the name of the ecosystem, encompassing numerous sub-products. While
each component of **cool** has its distinct nature, we believe a common
philosophy can be adopted across the ecosystem.

### Architectural Rules

- **DO** use ES Modules rather than its alternatives.
- **DO** follow a consistent directory and file structure.
- **DO** document architectural design records (ADRs) along with trade-offs.
- **DO** write tests for your code, prefer automated testing with CI.
- **CONSIDER** using buildless alternatives as long as they are suitable.
- **AVOID** transpiling and compile-time macro generation.

### Coding Mindset Rules

- **DO** write self-documenting code by using meaningful variable and class, and
  function names.
- **DO** use comments to explain the 'why' and 'how' if the code is not
  self-explanatory.
- **DO NOT** repeat yourself. Abstract common functionality into reusable
  modules or functions.

### Code Design Rules

- **DO** prefer pure (stateless) functions/components over stateful ones.
- **DO** prefer immutable data structures.
- **DO** keep your functions short and focused on doing a single task only.
- **DO** use early returns whenever possible.
- **DO** prefer composition over inheritance.
- **DO** prefer promises over callbacks.
- **DO** prefer template strings over string concatenation.
- **DO** use plain `for loops` if there's a case for `break`/`continue`.
- **DO NOT** use global variables.
- **CONSIDER** separate data and methods of classes.
- **CONSIDER** using plain objects like records instead of anemic classes.
- **CONSIDER** using functions instead of classes where its applicable.
- **CONSIDER** using classes only for stateful service classes.
- **AVOID** mutating objects.
- **AVOID** side-effect generation in non-pure functions, store state objects
  closest to where they are used.
- **AVOID** using getter/setters.

### Defensive Coding Rules

- **DO** validate input data.
- **DO** handle all possible error cases.
- **DO** use `Error` objects for throwing errors.
- **DO** use assertions to document and verify pre-conditions, post-conditions,
  and invariants.
- **DO** use logging for tracing and debugging purposes.
- **DO** use strict equal checking.
- **DO** add semicolons always.
- **DO** prefer `for..of loops` to go over the values of the array.
- **DO** prefer `Number()` for string to number conversions.
- **DO NOT** ignore returned errors.
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
- **CONSIDER** using result objects instead of throwing errors.
- **CONSIDER** initializing variables with `null` instead of `undefined`.
- **CONSIDER** using `try..catch` for `JSON.stringify` and `JSON.parse`.
- **AVOID** circular dependencies.
- **AVOID** the use of magic numbers or strings. Use named constants instead.
- **AVOID** setting and returning `undefined`, use `null` instead.
- **AVOID** nesting or chaining loops.
- **AVOID** truthy and falsy checks unless the variable/return type is a
  boolean. Instead, use full condition. (ex: `array.length === 0`)
- **AVOID** `import *`. Instead, just use whatever needed.
- **AVOID** throwing generic errors. Instead, throw specific error types that
  provide more information.
