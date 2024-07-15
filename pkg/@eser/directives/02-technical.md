# 📓 [@eser/directives/technical](./02-technical.md)

## Technical Directives

`cool` is the name of the toolkit and/or ecosystem, encompassing numerous
components. While each component of `cool` has its distinct nature, we believe a
common philosophy can be adopted across the ecosystem.

### Architectural Rules

- **DO** use ES Modules rather than its alternatives.
  - Why: ES Modules is the official standard for JavaScript modules, supported
    by all modern browsers and WinterCG runtimes, whereas alternatives like
    CommonJS and AMD are not.
- **DO** follow a consistent directory and file structure.
  - Why: A consistent and predictable structure makes it easier for developers
    to locate and manage the files.
- **DO** document architectural design records (ADRs) along with trade-offs.
  - Why: ADRs are documents that capture important architectural decisions made
    along with their context and consequences. It helps in understanding the
    rationale behind certain decisions and the trade-offs considered.
- **DO** write tests for your code, prefer automated testing with CI.
  - Why: Testing ensures that the code works as expected and helps in
    identifying issues early in the development process. Automated testing with
    Continuous Integration (CI) ensures that tests are run regularly.
- **CONSIDER** using buildless alternatives as long as they are suitable.
  - Why: Buildless development skips the build step, making the development
    process faster and more straightforward since it doesn't require any
    additional tooling and configuration.
- **AVOID** transpiling and compile-time macro generation.
  - Why: Transpiling can make the code more complex and harder to debug. It also
    introduces an additional build step and can lead to unexpected behavior in
    the code.

### Coding Mindset Rules

- **DO** write self-documenting code by using meaningful variable and class, and
  function names.
  - Why: This makes your code easier to understand and maintain, both for others
    and for your future self.
- **DO** use comments to explain the 'why' and 'how' if the code is not
  self-explanatory.
  - Why: Comments help others (and you, when you come back to your code later)
    to understand the logic and the reasons behind your code. This is especially
    important for complex pieces of logic.
- **DO NOT** repeat yourself. Abstract common functionality into reusable
  modules or functions.
  - Why: Reusing code helps to keep your codebase DRY (Don’t Repeat Yourself),
    making it easier to maintain and modify.

### Code Design Rules

- **DO** prefer pure (stateless) functions/components over stateful ones.
  - Why: Pure functions are easier to reason about, test, and reuse because they
    don't depend on or alter any external state.
- **DO** prefer immutable data structures.
  - Why: Immutable data structures prevent unintended side effects and make the
    code easier to reason about.
- **DO** keep your functions short and focused on doing a single task only.
  - Why: Single-responsibility functions are easier to understand, test, and
    reuse.
- **DO** use early returns whenever possible.
  - Why: It reduces the nesting level and makes the code more readable.
- **DO** prefer composition over inheritance.
  - Why: Composition is more flexible and leads to a cleaner and more decoupled
    codebase.
- **DO** prefer promises over callbacks.
  - Why: Promises lead to cleaner, more readable, and more maintainable code.
- **DO** prefer template strings over string concatenation.
  - Why: Template strings are more readable and allow you to embed expressions.
- **DO** use plain `for loops` if there's a case for `break`/`continue`.
  - Why: The `break` and `continue` statements can only be used inside regular
    `for` and `while` loops, so if you need to use them, plain for loops are the
    way to go.
- **DO NOT** use global variables.
  - Why: Global variables can lead to unintended side effects and make the code
    harder to understand and maintain.
- **CONSIDER** separate data and methods of classes.
  - Why: It makes your code more modular and easier to understand and maintain.
- **CONSIDER** using plain objects like records instead of anemic classes.
  - Why: Plain objects are simpler and often all you need. Classes should be
    used when you need to encapsulate behavior and state.
- **CONSIDER** using functions instead of classes where its applicable.
  - Why: Functions are simpler and more flexible than classes. Use classes when
    you need to encapsulate state and behavior.
- **CONSIDER** using classes only for stateful service classes.
  - Why: Classes are a good fit for encapsulating state and behavior. Use them
    for services that maintain state.
- **AVOID** mutating objects.
  - Why: Mutating objects can lead to unintended side effects and make the code
    harder to understand and maintain.
- **AVOID** side-effect generation in non-pure functions, store state objects
  closest to where they are used.
  - Why: Side effects make the code harder to understand and maintain. Keeping
    state close to where it's used makes the code more modular and easier to
    understand.
- **AVOID** using getter/setters.
  - Why: Getter and setters can lead to unexpected side effects and make the
    code harder to understand and maintain.

### Defensive Coding Rules

- **DO** validate input data.
  - Why: Validating input data ensures that the program is robust and resilient
    against invalid data that could lead to bugs or security vulnerabilities.
- **DO** handle all possible error cases.
  - Why: Handling all possible error cases ensures that the program can recover
    gracefully from unexpected situations and provides a better user experience.
- **DO** use `Error` objects for throwing errors.
  - Why: Using `Error` objects for throwing errors provides a consistent
    interface for error handling and can provide more detailed error
    information, such as a stack trace.
- **DO** use assertions to document and verify pre-conditions, post-conditions,
  and invariants.
  - Why: Assertions help to document the assumptions made by the code and can
    help to catch bugs early during development by verifying that these
    assumptions hold at runtime.
- **DO** use logging for tracing and debugging purposes.
  - Why: Logging helps to understand the flow of the program and can be
    invaluable for debugging and monitoring the application.
- **DO** use strict equal checking.
  - Why: Strict equal checking (`===`) avoids implicit type coercion and ensures
    that values are compared in a more predictable manner.
- **DO** add semicolons always.
  - Why: Although JavaScript doesn't require semicolons, it can sometimes lead
    to unexpected results. Explicitly adding semicolons reduces the chance of
    bugs.
- **DO** prefer `for..of loops` to go over the values of the array.
  - Why: `for..of` loops are more readable and avoid the need to access array
    elements by their index.
- **DO** prefer `Number()` for string to number conversions.
  - Why: Using `Number()` for string to number conversions makes the intent of
    the code more clear compared to using the unary `+` operator.
- **DO NOT** ignore returned errors.
  - Why: Ignoring returned errors can lead to unexpected behavior and
    hard-to-debug issues. Always handle errors appropriately.
- **DO NOT** use `eval`.
  - Why: eval can execute arbitrary JavaScript code, which can lead to security
    vulnerabilities and makes the code harder to understand and maintain.
- **DO NOT** use `prototype`.
  - Why: Manipulating the prototype can lead to unexpected behavior and makes
    the code harder to understand and maintain.
- **DO NOT** use `Object.defineProperty`.
  - Why: Object.defineProperty can lead to unexpected behavior and makes the
    code harder to understand and maintain. Prefer using classes and object
    literals.
- **DO NOT** use `var`. Instead, use `const` and `let`.
  - Why: `var` has function scope and can lead to unexpected behavior. `const`
    and `let` have block scope and are more predictable.
- **DO NOT** use `||` for undefined and null checks. Instead, use nullish
  coalescing (`??`) operator.
  - Why: The `||` operator will return the right-hand side for all falsy values
    (e.g., `0`, `''`, `false`), not just `null` or `undefined`. The `??`
    operator only returns the right-hand side if the left-hand side is `null` or
    `undefined`.
- **DO NOT** use `arguments` object in functions. Instead, use rest (`...`)
  operator.
  - Why: The `arguments` object is not an array and does not have array methods.
    The rest operator provides a more consistent and readable way to access
    function arguments.
- **DO NOT** use `window` object. Instead, use `globalThis`.
  - Why: The `window` object is specific to the browser environment. Using
    `globalThis` ensures that the code works consistently across different
    environments (e.g., browser, Node.js).
- **DO NOT** use `typeof` operator. Instead, use `instanceof` or `.constructor`
  property.
  - Why: The `typeof` operator can return unexpected results for certain values
    (e.g., `typeof null === 'object'`). Using `instanceof` or `.constructor`
    property provides a more reliable way to determine the type of a value.
- **CONSIDER** using result objects instead of throwing errors.
  - Why: Returning result objects instead of throwing errors can make the code
    more predictable and easier to work with.
- **CONSIDER** initializing variables with `null` instead of `undefined`.
  - Why: Initializing variables with `null` makes it clear that the variable was
    explicitly initialized and can make the code more predictable.
- **CONSIDER** using `try..catch` for `JSON.stringify` and `JSON.parse`.
  - Why: `JSON.stringify` and `JSON.parse` can throw errors for invalid input.
    Using try..catch ensures that these errors are handled gracefully.
- **AVOID** circular dependencies.
  - Why: Circular dependencies can lead to unexpected behavior and make the code
    harder to understand and maintain.
- **AVOID** the use of magic numbers or strings. Use named constants instead.
  - Why: Magic numbers or strings can make the code harder to understand and
    maintain. Using named constants makes the code more readable and easier to
    update in the future.
- **AVOID** setting and returning `undefined`, use `null` instead.
  - Why: Using `null` makes it clear that the value was explicitly set to 'no
    value'. `undefined` is often used to indicate that a variable has not been
    initialized or a function does not return a value.
- **AVOID** nesting or chaining loops.
  - Why: Nesting or chaining loops can make the code harder to understand and
    maintain. Prefer using higher-order functions (e.g., `Array.prototype.map`,
    `Array.prototype.filter`) or breaking the code into smaller, more focused
    functions.
- **AVOID** truthy and falsy checks unless the variable/return type is a
  boolean. Instead, use full condition. (ex: `array.length === 0`)
  - Why: Truthy and falsy checks can lead to unexpected results because
    JavaScript considers several values to be falsy (e.g., `0`, `''`, `null`,
    `undefined`, `NaN`). Using a full condition makes the code more predictable.
- **AVOID** `import *`. Instead, just use whatever needed.
  - Why: Importing everything from a module can lead to unused code being
    included in the final bundle and makes it harder to understand which parts
    of the module are actually being used.
- **AVOID** throwing generic errors. Instead, throw specific error types that
  provide more information.
  - Why: Throwing specific error types makes it easier to handle errors
    appropriately and can provide more detailed error information to the caller.
