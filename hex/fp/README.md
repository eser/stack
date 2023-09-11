# 🧱 [cool/hex/fp](./)

## Package Information

cool/hex/fp is a set of helper methods in order to construct a new version of
data without mutating/updating existing data structure in-place.

Compared to its alternatives, cool/hex/fp only provides utility functions
instead of delivering new data types/structures as a solution.

Additionally, as a library, cool/hex/fp is completely tree-shaking-friendly.
Your favorite module bundler can easily inline the functionality you need with
no extra configuration, instead of bundling the whole cool/hex/fp package.

For further details such as requirements, license information and support guide,
please see [main cool repository](https://github.com/eser/cool).

## Usage

### appendToArray(source, ...items)

appends new item(s) to an array or a generator.

```js
import { appendToArray } from "$cool/hex/fp/append-to-array";

const source = ["a", "b"];
const newOne = appendToArray(source, "c");

// output: Result: ['a','b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### appendToObject(source, ...items)

appends new item(s) to an object.

```js
import { appendToObject } from "$cool/hex/fp/append-to-object";

const source = { a: 1, b: 2 };
const newOne = appendToObject(source, { c: 3 });

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### associateArray(source, selectorFn)

.

```js
import { associateArray } from "$cool/hex/fp/associate-array";

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

.

```js
import { associateObject } from "$cool/hex/fp/associate-object";

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

passes the output of one function as an input to another one, but unlike `pipe`
it executes the functions in reverse order.

```js
import { compose } from "$cool/hex/fp/compose";

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

.

```js
import { curry } from "$cool/hex/fp/curry";

// curry - sum sample
const sum = (a, b) => a + b;

const sumWith5 = curry(sum, 5);

const result = sumWith5(3);

// outputs 'result: 8'
console.log(`result: ${result}`);
```

### curryRight(targetFunction, ...argumentsToBeAppended)

.

```js
import { curryRight } from "$cool/hex/fp/curry-right";

// curryRight - sum sample
const dec = (a, b) => a - b;

const decWith5 = curry(dec, 5);

const result = decWith5(3);

// outputs 'result: -2'
console.log(`result: ${result}`);
```

### decorate(functionToDecorate, decoratorFunction)

.

```js
import { decorate } from "$cool/hex/fp/decorate";

// decorate - calculator sample
let generator = () => 5;
generator = decorate(generator, (func) => func() * 2);
generator = decorate(generator, (func) => func() + 1);

// outputs: 'generated: 11'
console.log(`generated: ${generator()}`);
```

### deepCopy(source)

copies an instance with its constructor.

```js
import { deepCopy } from "$cool/hex/fp/deep-copy";

class dummy {}

const source = new dummy();
const newOne = deepCopy(source);

// output: Result: class dummy {}
console.log("Result:", newOne.constructor);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### deepMerge(source, other)

merges two instances with source's constructor.

```js
import { deepMerge } from "$cool/hex/fp/deep-merge";

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

### dispatcher(initialState, mutators) (awaitable)

.

```js
import { dispatcher } from "$cool/hex/fp/dispatcher";

// dispatcher - state mutation sample
const initialState = { quarter: 1, year: 2018, sum: 1 };

const actionAdd5 = (state, next) => next({ ...state, sum: state.sum + 5 });
const actionDiv2 = (state, next) => next({ ...state, sum: state.sum / 2 });

// outputs 'new state is: {"quarter":1,"year":2018,"sum":3}'
dispatcher(initialState, [actionAdd5, actionDiv2])
  .then((state) => console.log(`new state is: ${JSON.stringify(state)}`));
```

### dispatcher(initialState, mutators, subscribers) (awaitable)

.

```js
import { dispatcher } from "$cool/hex/fp/dispatcher";

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

TODO

### distinctObject(source, selectorFn)

TODO

### dropFromArray(source, number)

skips first n items from an array or a generator.

```js
import { dropFromArray } from "$cool/hex/fp/drop-from-array";

const source = ["a", "b", "c"];
const newOne = dropFromArray(source, 1);

// output: Result: ['b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### dropFromObject(source, number)

skips first n items from an object.

```js
import { dropFromObject } from "$cool/hex/fp/drop-from-object";

const source = { a: 1, b: 2, c: 3 };
const newOne = dropFromObject(source, 1);

// output: Result: {'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### emitter(events, eventName, eventParameters) (awaitable)

.

```js
import { emitter } from "$cool/hex/fp/emitter";

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

.

```js
import { emitter } from "$cool/hex/fp/emitter";

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

### filterArray(instance, predicate)

returns matching items from an array or a generator.

```js
import { filterArray } from "$cool/hex/fp/filter-array";

const source = [1, 2, 3, 4, 5];
const newOne = filterArray(source, (x) => x <= 3);

// output: Result: [1,2,3]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### filterObject(instance, predicate)

returns matching items from an object.

```js
import { filterObject } from "$cool/hex/fp/filter-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = filterObject(source, (x) => x <= 3);

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### iterate(iterable, func) (awaitable)

.

```js
import { iterate } from "$cool/hex/fp/iterate";
import { compose } from "$cool/hex/fp/compose";

// iterate - url fetcher example
const generator = function* () {
  yield "http://localhost/samples/1"; // { value: 1 }
  yield "http://localhost/samples/2"; // { value: 2 }
  yield "http://localhost/samples/3"; // { value: 3 }
};

const fetchUrl = async function (url) {
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

creates a new array with the results of calling a provided function on every
element in the calling array.

```js
import { mapArray } from "$cool/hex/fp/map-array";

const source = [1, 2, 3, 4, 5];
const newOne = mapArray(source, (x) => x - 1);

// output: Result: [0,1,2,3,4]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mapObject(instance, predicate)

creates a new object with the results of calling a provided function on every
element in the calling object.

```js
import { mapObject } from "$cool/hex/fp/map-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = mapObject(source, (value, key) => ({ [key]: value - 1 }));

// output: Result: {'a':0,'b':1,'c':2,'d':3,'e':4}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mergeArrays(...sources)

merges two or more arrays into one.

```js
import { mergeArrays } from "$cool/hex/fp/merge-arrays";

const source1 = [1, 2, 3];
const source2 = [4, 5];
const newOne = mergeArrays(source1, source2);

// output: Result: [1,2,3,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mergeObjects(...sources)

merges two or more objects into one.

```js
import { mergeObjects } from "$cool/hex/fp/merge-objects";

const source1 = { a: 1, b: 2, c: 3 };
const source2 = { d: 4, e: 5 };
const newOne = mergeObjects(source1, source2);

// output: Result: {'a':1,'b':2,'c':3,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mutate(source, modificationFn)

copies an instance with its constructor, with specific mutation.

```js
import { mutate } from "$cool/hex/fp/mutate";

class dummy {
  constructor() {
    this.items = [];
  }
}

const source = new dummy();
const newOne = mutate(source, (x) => x.items.push(6));

// output: Result: class dummy {}
console.log("Result:", newOne.constructor);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pickFromArray(source, items)

returns matching and not matching items from an array or a generator.

```js
import { pickFromArray } from "$cool/hex/fp/pick-from-array";

const source = [1, 2, 3, 4, 5];
const newOne = pickFromArray(source, [2, 3, 6]);

// output: Result: {'items':[2,3],'rest':[1,4,5]}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pickFromObject(source, keys)

returns matching and not matching items from an object.

```js
import { pickFromObject } from "$cool/hex/fp/pick-from-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = pickFromObject(source, ["b", "c", "f"]);

// output: Result: {'items':{'b':2,'c':3},'rest':{'a':1,'d':4,'e':5}}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pipe(...functionsForComposition)

passes the output of one function as an input to another function.

```js
import { pipe } from "$cool/hex/fp/pipe";

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

prepends new item(s) to an array or a generator.

```js
import { prependToArray } from "$cool/hex/fp/prepend-to-array";

const source = ["b", "c"];
const newOne = prependToArray(source, "a");

// output: Result: ['a','b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### prependToObject(source, ...items)

prepends new item(s) to an object.

```js
import { prependToObject } from "$cool/hex/fp/prepend-to-object";

const source = { b: 2, c: 3 };
const newOne = prependToObject(source, { a: 1 });

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeFirstMatchFromArray(source, predicate)

removes first matching item from an array or a generator.

```js
import { removeFirstMatchFromArray } from "$cool/hex/fp/remove-first-match-from-array";

const source = [1, 5, 2, 3, 4, 5];
const newOne = removeFirstMatchFromArray(source, (x) => x === 5);

// output: Result: [1,2,3,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeFirstMatchFromObject(source, predicate)

removes first matching item from an object.

```js
import { removeFirstMatchFromObject } from "$cool/hex/fp/remove-first-match-from-object";

const source = { a: 1, f: 5, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeFirstMatchFromObject(source, (x) => x === 5);

// output: Result: {'a':1,'b':2,'c':3,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeIndexFromArray(source, ...items)

removes specified item index(es) from an array or a generator.

```js
import { removeIndexFromArray } from "$cool/hex/fp/remove-index-from-array";

const source = [1, 2, 3, 4, 5];
const newOne = removeIndexFromArray(source, 2, 3);

// output: Result: [1,2,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeValueFromArray(source, ...items)

removes specified item(s) from an array or a generator.

```js
import { removeValueFromArray } from "$cool/hex/fp/remove-value-from-array";

const source = [1, 2, 3, 4, 5];
const newOne = removeValueFromArray(source, 2, 3);

// output: Result: [1,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeKeyFromObject(source, ...keys)

removes items with specified key(s) from an object.

```js
import { removeKeyFromObject } from "$cool/hex/fp/remove-key-from-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeKeyFromObject(source, "b", "c");

// output: Result: {'a':1,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeValueFromObject(source, ...values)

removes items with specified value(s) from an object or a generator.

```js
import { removeValueFromObject } from "$cool/hex/fp/remove-value-from-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeValueFromObject(source, 2, 3);

// output: Result: {'a':1,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### reverseArray(source)

reverses an array or a generator content.

```js
import { reverseArray } from "$cool/hex/fp/reverse-array";

const source = [1, 2, 3, 4, 5];
const newOne = reverseArray(source);

// output: Result: [5,4,3,2,1]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### reverseObject(source)

reverses an object content.

```js
import { reverseObject } from "$cool/hex/fp/reverse-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = reverseObject(source);

// output: Result: {'e':5,'d':4,'c':3,'b':2,'a':1}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### splitArray(source, number)

splits an array or a generator content from specified index.

```js
import { splitArray } from "$cool/hex/fp/split-array";

const source = [1, 2, 3, 4, 5];
const newOne = splitArray(source, 3);

// output: Result: {'items':[1,2,3],'rest':[4,5]}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### splitObject(source, number)

splits an object content from specified index.

```js
import { splitObject } from "$cool/hex/fp/split-object";

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = splitObject(source, 3);

// output: Result: {'items':{'a':1,'b':2,'c':3},'rest':{'d':4,'e':5}}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### takeFromArray(source, number)

takes first n items from an array or a generator.

```js
import { takeFromArray } from "$cool/hex/fp/take-from-array";

const source = ["a", "b", "c"];
const newOne = takeFromArray(source, 2);

// output: Result: ['a','b']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### takeFromObject(source, number)

takes first n items from an object.

```js
import { takeFromObject } from "$cool/hex/fp/take-from0bject";

const source = { a: 1, b: 2, c: 3 };
const newOne = takeFromObject(source, 2);

// output: Result: {'a':1,'b':2}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```
