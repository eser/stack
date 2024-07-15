# 🧱 [@eser/fp](./)

`@eser/fp` is a library designed for functional programming enthusiasts. It
covers a wide range of utility functions, making it a one-stop solution for many
functional programming needs.

If you're familiar with libraries like Lodash or Ramda, think of `@eser/fp` as
an alternative.

## 💫 Key features

- **Immutable Operations:** All methods in `@eser/fp` return a new instance,
  ensuring the original data remains unchanged. (see: _no mutation_)

- **No New Data Types:** Unlike some alternatives, `@eser/fp` doesn't introduce
  new data types or structures.

- **Pure Functions:** Embrace the predictability and reliability provided by the
  functional programming approach, as functions always produce the same output
  for the same input. (see: _determinism_)

- **No Dependencies:** `@eser/fp` is a standalone library with no external
  dependencies.

- **Type Support:** `Written in TypeScript,`@eser/fp` provides full-fledged
  support for TypeScript users.

## 📚 Key functions

- **Array and Object Manipulation**: Functions like
  [appendToArray](#appendtoarraysource-items),
  [appendToObject](#appendtoobjectsource-items),
  [associateArray](#associatearraysource-selectorfn),
  [associateObject](#associateobjectsource-selectorfn),
  [deepCopy](#deepcopysource), [deepMerge](#deepmergesource-other),
  [filterArray](#filterarrayinstance-predicatefn),
  [filterObject](#filterobjectinstance-predicatefn),
  [mapArray](#maparrayinstance-predicate),
  [mapObject](#mapobjectinstance-predicate), [mergeArrays](#mergearrayssources),
  [mergeObjects](#mergeobjectssources), [reverseArray](#reversearraysource),
  [reverseObject](#reverseobjectsource), [splitArray](#splitarraysource-index),
  [splitObject](#splitobjectsource-index),
  [takeFromArray](#takefromarraysource-n) and
  [takeFromObject](#takefromobjectsource-number) help in manipulating arrays and
  objects without mutating the original data.

- **Functional Composition**: [compose](#composefunctionsforcomposition) and
  [pipe](#pipefunctionsforcomposition) allow users to combine multiple functions
  into a single function, executing them in reverse order or straight order,
  respectively.

- **Decorators and Currying**:
  [decorate](#decoratefunctiontodecorate-decoratorfn),
  [curry](#currytargetfunction-argumentstobeprepended) and
  [curryRight](#curryrighttargetfunction-argumentstobeappended) transform a
  function into a curried or decorated version which has enhanced or altered
  behavior of the existing function.

- **State Management**:
  [dispatcher](#dispatcherinitialstate-mutatorfns-awaitable) manages state
  mutations in a controlled manner.

- **Event Emission**:
  [emitter](#emitterevents-eventname-eventparameters-awaitable) emits events to
  subscribed listeners.

- **Iteration**: [iterate](#iterateiterable-fn-awaitable) allows iteration over
  an iterable and applies a function to each item.

- **Mutation**: [mutate](#mutatesource-mutatorfn) creates a copy of a data
  structure and applies a mutator function to it.

- **Selection**: Functions like
  [distinctArray](#distinctarraysource-selectorfn),
  [distinctObject](#distinctobjectsource-selectorfn),
  [pickFromArray](#pickfromarraysource-items),
  [pickFromObject](#pickfromobjectsource-keys),
  [removeFirstMatchFromArray](#removefirstmatchfromarraysource-predicatefn),
  [removeFirstMatchFromObject](#removefirstmatchfromobjectsource-predicatefn),
  [removeIndexFromArray](#removeindexfromarraysource-items),
  [removeValueFromArray](#removevaluefromarraysource-items),
  [removeKeyFromObject](#removekeyfromobjectsource-keys) and
  [removeValueFromObject](#removevaluefromobjectsource-values) help in
  selecting, removing or filtering specific items.

... and more!

## 🚀 Getting Started with Functional Programming (FP)

Functional programming is a programming paradigm (a way of writing programs)
that emphasizes using functions as first-class citizens for designing our code.
It is a declarative programming approach in which functions take inputs and
return outputs, rather than a sequence of imperative statements.

By constructing your code with pure functions, you ensure that the same input
always produces the same output. This results in predictable, reliable and
testable code with no side effects during runtime.

[Learn more about Functional Programming](https://medium.com/javascript-scene/master-the-javascript-interview-what-is-functional-programming-7f218c68b3a0).

## 🛠 Usage and API Reference

Here you'll find a list of utility functions provided by `@eser/fp` along with
brief descriptions and usage examples. Dive in and explore the usage of
functional programming paradigms.

### appendToArray(source, ...items)

adds new item(s) to the end of an array or generator without mutating the
original.

```js
import { appendToArray } from "@eser/fp/append-to-array";

const source = ["a", "b"];
const newOne = appendToArray(source, "c");

// output: Result: ['a','b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### appendToObject(source, ...items)

adds new item(s) to an object without changing the original.

```js
import { appendToObject } from "@eser/fp/append-to-object";

const source = { a: 1, b: 2 };
const newOne = appendToObject(source, { c: 3 });

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### associateArray(source, selectorFn)

transforms an array or generator into an object with keys are determined by a
selector function (`selectorFn`).

```js
import { associateArray } from "@eser/fp/associate-array";

// associate array - basic sample
const categories = [
  { id: 1, name: "foo" },
  { id: 2, name: "bar" },
  { id: 3, name: "baz" },
];

const result = associateArray(categories, (category) => category.id);

/* outputs:
  {
    "1": { id: 1, name: "foo" },
    "2": { id: 2, name: "bar" },
    "3": { id: 3, name: "baz" }
  }
*/
console.dir(result);
```

### associateObject(source, selectorFn)

transforms an object into another object with keys are determined by a selector
function (`selectorFn`).

```js
import { associateObject } from "@eser/fp/associate-object";

// associate object - basic sample
const categories = {
  a: { id: 1, name: "foo" },
  b: { id: 2, name: "bar" },
  c: { id: 3, name: "baz" },
};

const result = associateObject(categories, (category) => category.id);

// outputs:
// {
//   "1": { id: 1, name: "foo" },
//   "2": { id: 2, name: "bar" },
//   "3": { id: 3, name: "baz" }
// }
console.dir(result);
```

### compose(...functionsForComposition)

composes multiple functions into a single function by passing the results of one
function as input to the next. unlike `pipe`, it executes the functions from
reverse order (right to left).

```js
import { compose } from "@eser/fp/compose";

// compose - slug sample
const lower = (x) => x.toLowerCase();
const chars = (x) => x.replace(/[^\w \-]+/g, "");
const spaces = (x) => x.split(" ");
const dashes = (x) => x.join("-");

const slug = compose(dashes, spaces, chars, lower);

const message = slug("Hello World!");

// outputs 'slug: hello-world'
console.log(`slug: ${message}`);
```

### curry(targetFunction, ...argumentsToBePrepended)

transforms a function into a curried version, allowing for partial application
of arguments from the left.

```js
import { curry } from "@eser/fp/curry";

// curry - sum sample
const sum = (a, b) => a + b;

const sumWith5 = curry(sum, 5);

const result = sumWith5(3);

// outputs 'result: 8'
console.log(`result: ${result}`);
```

### curryRight(targetFunction, ...argumentsToBeAppended)

transforms a function into a curried version, allowing for partial application
of arguments from the right.

```js
import { curryRight } from "@eser/fp/curry-right";

// curryRight - sum sample
const dec = (a, b) => a - b;

const decWith5 = curry(dec, 5);

const result = decWith5(3);

// outputs 'result: -2'
console.log(`result: ${result}`);
```

### decorate(functionToDecorate, decoratorFn)

enhances or alters a function's behavior using a decorator function
(`decoratorFn`).

```js
import { decorate } from "@eser/fp/decorate";

// decorate - calculator sample
let generator = () => 5;
generator = decorate(generator, (func) => func() * 2);
generator = decorate(generator, (func) => func() + 1);

// outputs: 'generated: 11'
console.log(`generated: ${generator()}`);
```

### deepCopy(source)

creates a deep copy of the given data structure while preserving its
constructor.

```js
import { deepCopy } from "@eser/fp/deep-copy";

class Dummy {}

const source = new Dummy();
const newOne = deepCopy(source);

// output: Result: class Dummy {}
console.log("Result:", newOne.constructor);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### deepMerge(source, other)

merges two data structures deeply to produce a new structure with combined
items.

```js
import { deepMerge } from "@eser/fp/deep-merge";

const source = {
  a: {
    b: [1, 2, 3],
    c: {
      d: 4,
    },
  },
};

const other = {
  a: {
    b: [55],
  },
  e: "hello",
};

const newOne = deepMerge(source, other);

// output: Result: {
//   a: {
//     b: [55],
//     c: {
//       d: 4,
//     },
//   },
//   e: "hello",
// }
console.log("Result:", newOne);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### dispatcher(initialState, mutatorFns) (awaitable)

manages state mutations in a controlled manner using an initial state and a set
of functions (`mutatorFns`).

```js
import { dispatcher } from "@eser/fp/dispatcher";

// dispatcher - state mutation sample
const initialState = { quarter: 1, year: 2018, sum: 1 };

const actionAdd5 = (state, next) => next({ ...state, sum: state.sum + 5 });
const actionDiv2 = (state, next) => next({ ...state, sum: state.sum / 2 });

// outputs 'new state is: {"quarter":1,"year":2018,"sum":3}'
dispatcher(initialState, [actionAdd5, actionDiv2])
  .then((state) => console.log(`new state is: ${JSON.stringify(state)}`));
```

### dispatcher(initialState, mutatorFns, subscribers) (awaitable)

manages state mutations in a controlled manner using an initial state and a set
of functions (`mutatorFns`). additionally, it notifies subscribers about the
state changes.

```js
import { dispatcher } from "@eser/fp/dispatcher";

// dispatcher - action logger sample
const initialState = { quarter: 1, year: 2018, sum: 1 };

const actionAdd5 = (state, next) => next({ ...state, sum: state.sum + 5 });
const actionDiv2 = (state, next) => next({ ...state, sum: state.sum / 2 });

const logger = (x) => console.log("INFO", x);

/* outputs:
   INFO { action: 'actionAdd5',
     previousState: { quarter: 1, year: 2018, sum: 1 },
     newState: { quarter: 1, year: 2018, sum: 6 } }
   INFO { action: 'actionDiv2',
     previousState: { quarter: 1, year: 2018, sum: 6 },
     newState: { quarter: 1, year: 2018, sum: 3 } }
   new state is: {"quarter":1,"year":2018,"sum":3}'
*/
dispatcher(initialState, [actionAdd5, actionDiv2], [logger])
  .then((state) => console.log(`new state is: ${JSON.stringify(state)}`));
```

### distinctArray(source, selectorFn)

filters out duplicate values in an array or generator based on a selector
function (`selectorFn`).

// TODO

### distinctObject(source, selectorFn)

filters out duplicate values in an object based on a selector function
(`selectorFn`).

// TODO

### dropFromArray(source, n)

skips the first `n` item(s) in an array or generator.

```js
import { dropFromArray } from "@eser/fp/drop-from-array";

const source = ["a", "b", "c"];
const newOne = dropFromArray(source, 1);

// output: Result: ['b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### dropFromObject(source, n)

Skips the first `n` item(s) in an object.

```js
import { dropFromObject } from "@eser/fp/drop-from-object";

const source = { a: 1, b: 2, c: 3 };
const newOne = dropFromObject(source, 1);

// output: Result: {'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### emitter(events, eventName, eventParameters) (awaitable)

emits events to subscribed listeners.

```js
import { emitter } from "@eser/fp/emitter";

// emitter - static pub/sub sample
const subscriberOne = (value) =>
  console.log(`subscriberOne had value ${value}`);
const subscriberTwo = (value) =>
  console.log(`subscriberTwo had value ${value}`);

const events = {
  printToConsole: [subscriberOne, subscriberTwo],
};

/* outputs:
   subscriberOne had value 5
   subscriberTwo had value 5
*/
emitter(events, "printToConsole", [5]);
```

### emitter(events, eventName, eventParameters, subscribers) (awaitable)

emits events to subscribed listeners. additionally, it notifies subscribers
about the event.

```js
import { emitter } from "@eser/fp/emitter";

// emitter - event logger sample
const subscriberOne = (value) =>
  console.log(`subscriberOne had value ${value}`);
const subscriberTwo = (value) =>
  console.log(`subscriberTwo had value ${value}`);

const logger = (x) => console.log("INFO", x);

const events = {
  printToConsole: [subscriberOne, subscriberTwo],
};

/* outputs:
   INFO { event: 'printToConsole',
     subscriber: 'subscriberOne',
     args: [ 5 ] }
   subscriberOne had value 5
   INFO { event: 'printToConsole',
     subscriber: 'subscriberTwo',
     args: [ 5 ] }
   subscriberTwo had value 5
*/
emitter(events, "printToConsole", [5], [logger]);
```

### filterArray(instance, predicateFn)

returns a new array containing only the items that satisfy the provided
predicate function (`predicateFn`).

```js
import { filterArray } from "@eser/fp/filter-array";

const source = [1, 2, 3, 4, 5];
const newOne = filterArray(source, (x) => x <= 3);

// output: Result: [1,2,3]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### filterObject(instance, predicateFn)

returns a new object containing only the items that satisfy the provided
predicate function (`predicateFn`).

```js
import { filterObject } from "@eser/fp/filter-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = filterObject(source, (x) => x <= 3);

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### iterate(iterable, fn) (awaitable)

iterates over an iterable (like a generator) and applies a function (`fn`) to
each item.

```js
import { iterate } from "@eser/fp/iterate";
import { compose } from "@eser/fp/compose";

// iterate - url fetcher example
const generator = function* () {
  yield "http://localhost/samples/1"; // { value: 1 }
  yield "http://localhost/samples/2"; // { value: 2 }
  yield "http://localhost/samples/3"; // { value: 3 }
};

const fetchUrl = async (url) => {
  const response = await fetch(url);
  const document = await response.json();

  return document.value;
};

const add5 = async (value) => await value + 5;
const printToConsole = async (value) => {
  console.log(await value);
};

/* outputs:
   value is 6
   value is 7
   value is 8
*/
iterate(
  generator(),
  compose(fetchUrl, add5, printToConsole),
);
```

### mapArray(instance, predicate)

transforms each item in an array or generator using a provided predicate
function (`predicateFn`).

```js
import { mapArray } from "@eser/fp/map-array";

const source = [1, 2, 3, 4, 5];
const newOne = mapArray(source, (x) => x - 1);

// output: Result: [0,1,2,3,4]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mapObject(instance, predicate)

transforms each property in an object using a provided predicate function
(`predicateFn`).

```js
import { mapObject } from "@eser/fp/map-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = mapObject(source, (value, key) => ({ [key]: value - 1 }));

// output: Result: {'a':0,'b':1,'c':2,'d':3,'e':4}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mergeArrays(...sources)

combines two or more arrays into a single array.

```js
import { mergeArrays } from "@eser/fp/merge-arrays";

const source1 = [1, 2, 3];
const source2 = [4, 5];
const newOne = mergeArrays(source1, source2);

// output: Result: [1,2,3,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mergeObjects(...sources)

combines two or more objects into a single object.

```js
import { mergeObjects } from "@eser/fp/merge-objects";

const source1 = { a: 1, b: 2, c: 3 };
const source2 = { d: 4, e: 5 };
const newOne = mergeObjects(source1, source2);

// output: Result: {'a':1,'b':2,'c':3,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mutate(source, mutatorFn)

creates a copy of a data structure and applies a mutator function (`mutatorFn`)
to it. copies an instance with its constructor, with specific mutation.

```js
import { mutate } from "@eser/fp/mutate";

class Dummy {
  constructor() {
    this.items = [];
  }
}

const source = new Dummy();
const newOne = mutate(source, (x) => x.items.push(6));

// output: Result: class Dummy {}
console.log("Result:", newOne.constructor);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pickFromArray(source, items)

Returns an object containing items that match and don't match the provided
criteria from an array or generator.

```js
import { pickFromArray } from "@eser/fp/pick-from-array";

const source = [1, 2, 3, 4, 5];
const newOne = pickFromArray(source, [2, 3, 6]);

// output: Result: {'items':[2,3],'rest':[1,4,5]}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pickFromObject(source, keys)

returns an object containing items that match and don't match the provided keys
from an object.

```js
import { pickFromObject } from "@eser/fp/pick-from-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = pickFromObject(source, ["b", "c", "f"]);

// output: Result: {'items':{'b':2,'c':3},'rest':{'a':1,'d':4,'e':5}}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pipe(...functionsForComposition)

composes multiple functions into a single function. it is done by passing the
results of a function as an input to another one. unlike `compose`, it executes
the functions from straight order (left to right).

```js
import { pipe } from "@eser/fp/pipe";

// pipe - slug sample
const lower = (x) => x.toLowerCase();
const chars = (x) => x.replace(/[^\w \-]+/g, "");
const spaces = (x) => x.split(" ");
const dashes = (x) => x.join("-");

const slug = pipe(lower, chars, spaces, dashes);

const message = slug("Hello World!");

// outputs 'slug: hello-world'
console.log(`slug: ${message}`);
```

### prependToArray(source, ...items)

adds new item(s) to the beginning of an array or generator without mutating the
original.

```js
import { prependToArray } from "@eser/fp/prepend-to-array";

const source = ["b", "c"];
const newOne = prependToArray(source, "a");

// output: Result: ['a','b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### prependToObject(source, ...items)

adds new item(s) to the beginning of an object without changing the original.

```js
import { prependToObject } from "@eser/fp/prepend-to-object";

const source = { b: 2, c: 3 };
const newOne = prependToObject(source, { a: 1 });

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeFirstMatchFromArray(source, predicateFn)

removes the first item in an array or generator that matches the provided
predicate function (`predicateFn`).

```js
import { removeFirstMatchFromArray } from "@eser/fp/remove-first-match-from-array";

const source = [1, 5, 2, 3, 4, 5];
const newOne = removeFirstMatchFromArray(source, (x) => x === 5);

// output: Result: [1,2,3,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeFirstMatchFromObject(source, predicateFn)

removes the first property in an object that matches the provided predicate
function (`predicateFn`).

```js
import { removeFirstMatchFromObject } from "@eser/fp/remove-first-match-from-object";

const source = { a: 1, f: 5, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeFirstMatchFromObject(source, (x) => x === 5);

// output: Result: {'a':1,'b':2,'c':3,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeIndexFromArray(source, ...items)

removes items from an array or generator based on their indices.

```js
import { removeIndexFromArray } from "@eser/fp/remove-index-from-array";

const source = [1, 2, 3, 4, 5];
const newOne = removeIndexFromArray(source, 2, 3);

// output: Result: [1,2,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeValueFromArray(source, ...items)

removes specified values from an array or generator.

```js
import { removeValueFromArray } from "@eser/fp/remove-value-from-array";

const source = [1, 2, 3, 4, 5];
const newOne = removeValueFromArray(source, 2, 3);

// output: Result: [1,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeKeyFromObject(source, ...keys)

removes items from an object based on their keys.

```js
import { removeKeyFromObject } from "@eser/fp/remove-key-from-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeKeyFromObject(source, "b", "c");

// output: Result: {'a':1,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeValueFromObject(source, ...values)

Removes items from an object based on their values.

```js
import { removeValueFromObject } from "@eser/fp/remove-value-from-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeValueFromObject(source, 2, 3);

// output: Result: {'a':1,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### reverseArray(source)

reverses the order of items in an array or generator.

```js
import { reverseArray } from "@eser/fp/reverse-array";

const source = [1, 2, 3, 4, 5];
const newOne = reverseArray(source);

// output: Result: [5,4,3,2,1]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### reverseObject(source)

reverses the order of items in an object.

```js
import { reverseObject } from "@eser/fp/reverse-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = reverseObject(source);

// output: Result: {'e':5,'d':4,'c':3,'b':2,'a':1}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### splitArray(source, index)

divides an array or generator into two parts based on the provided index.

```js
import { splitArray } from "@eser/fp/split-array";

const source = [1, 2, 3, 4, 5];
const newOne = splitArray(source, 3);

// output: Result: {'items':[1,2,3],'rest':[4,5]}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### splitObject(source, index)

divides an object into two parts based on the provided index.

```js
import { splitObject } from "@eser/fp/split-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = splitObject(source, 3);

// output: Result: {'items':{'a':1,'b':2,'c':3},'rest':{'d':4,'e':5}}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### takeFromArray(source, n)

returns the first `n` items from an array or generator.

```js
import { takeFromArray } from "@eser/fp/take-from-array";

const source = ["a", "b", "c"];
const newOne = takeFromArray(source, 2);

// output: Result: ['a','b']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### takeFromObject(source, number)

returns the first `n` items from an object.

```js
import { takeFromObject } from "@eser/fp/take-from-object";

const source = { a: 1, b: 2, c: 3 };
const newOne = takeFromObject(source, 2);

// output: Result: {'a':1,'b':2}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main cool repository](https://github.com/eser/cool).
