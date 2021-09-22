# 🧱 [hex/fp](https://github.com/eserozvataf/hex/tree/development/src/fp)

## Package Information

hex/fp is a set of helper methods in order to construct a new version of data without mutating/updating existing data structure in-place.

Compared to its alternatives, hex/fp only provides utility functions instead of delivering new data types/structures as a solution.

Additionally, as a library, hex/fp is completely tree-shaking-friendly. Your favorite module bundler can easily inline the functionality you need with no extra configuration, instead of bundling the whole hex/fp package.

For further details such as requirements, license information and support guide, please see [main hex repository](https://github.com/eserozvataf/hex).


## Usage

### appendToArray(source, ...items)

appends new item(s) to an array or a generator.

```js
import appendToArray from 'hex/fp/append-to-array';

const source = [ 'a', 'b' ];
const newOne = appendToArray(source, 'c');

// output: Result: ['a','b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### appendToObject(source, ...items)

appends new item(s) to an object.

```js
import appendToObject from 'hex/fp/append-to-object';

const source = { a: 1, b: 2 };
const newOne = appendToObject(source, { c: 3 });

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### deepCopy(source)

copies an instance with its constructor.

```js
import deepCopy from 'hex/fp/deep-copy';

class dummy {}

const source = new dummy();
const newOne = deepCopy(source);

// output: Result: class dummy {}
console.log('Result:', newOne.constructor);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### dropFromArray(source, number)

skips first n items from an array or a generator.

```js
import dropFromArray from 'hex/fp/drop-from-array';

const source = [ 'a', 'b', 'c' ];
const newOne = dropFromArray(source, 1);

// output: Result: ['b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### dropFromObject(source, number)

skips first n items from an object.

```js
import dropFromObject from 'hex/fp/drop-from-object';

const source = { a: 1, b: 2, c: 3 };
const newOne = dropFromObject(source, 1);

// output: Result: {'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### filterArray(instance, predicate)

returns matching items from an array or a generator.

```js
import filterArray from 'hex/fp/filter-array';

const source = [ 1, 2, 3, 4, 5 ];
const newOne = filterArray(source, x => x <= 3);

// output: Result: [1,2,3]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### filterObject(instance, predicate)

returns matching items from an object.

```js
import filterObject from 'hex/fp/filter-object';

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = filterObject(source, x => x <= 3);

// output: Result: {'a':1,'b':2,'c':3}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mapArray(instance, predicate)

creates a new array with the results of calling a provided function on every element in the calling array.

```js
import mapArray from 'hex/fp/map-array';

const source = [ 1, 2, 3, 4, 5 ];
const newOne = mapArray(source, x => x - 1);

// output: Result: [0,1,2,3,4]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mapObject(instance, predicate)

creates a new object with the results of calling a provided function on every element in the calling object.

```js
import mapObject from 'hex/fp/map-object';

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
import mergeArrays from 'hex/fp/merge-arrays';

const source1 = [ 1, 2, 3 ];
const source2 = [ 4, 5 ];
const newOne = mergeArrays(source1, source2);

// output: Result: [1,2,3,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### mergeObjects(...sources)

merges two or more objects into one.

```js
import mergeObjects from 'hex/fp/merge-objects';

const source1 = { a: 1, b: 2, c: 3 };
const source2 = { d: 4, e: 5 };
const newOne = mergeObjects(source1, source2);

// output: Result: {'a':1,'b':2,'c':3,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pickFromArray(source, items)

returns matching and not matching items from an array or a generator.

```js
import pickFromArray from 'hex/fp/pick-from-array';

const source = [ 1, 2, 3, 4, 5 ];
const newOne = pickFromArray(source, [ 2, 3, 6 ]);

// output: Result: {'items':[2,3],'rest':[1,4,5]}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### pickFromObject(source, keys)

returns matching and not matching items from an object.

```js
import pickFromObject from 'hex/fp/pick-from-object';

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = pickFromObject(source, [ 'b', 'c', 'f' ]);

// output: Result: {'items':{'b':2,'c':3},'rest':{'a':1,'d':4,'e':5}}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### prependToArray(source, ...items)

prepends new item(s) to an array or a generator.

```js
import prependToArray from 'hex/fp/prepend-to-array';

const source = [ 'b', 'c' ];
const newOne = prependToArray(source, 'a');

// output: Result: ['a','b','c']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### prependToObject(source, ...items)

prepends new item(s) to an object.

```js
import prependToObject from 'hex/fp/prepend-to-object';

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
import removeFirstMatchFromArray from 'hex/fp/remove-first-match-from-array';

const source = [ 1, 5, 2, 3, 4, 5 ];
const newOne = removeFirstMatchFromArray(source, x => x === 5);

// output: Result: [1,2,3,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeFirstMatchFromObject(source, predicate)

removes first matching item from an object.

```js
import removeFirstMatchFromObject from 'hex/fp/remove-first-match-from-object';

const source = { a: 1, f: 5, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeFirstMatchFromObject(source, x => x === 5);

// output: Result: {'a':1,'b':2,'c':3,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeFromArray(source, ...items)

removes specified item(s) from an array or a generator.

```js
import removeFromArray from 'hex/fp/remove-from-array';

const source = [ 1, 2, 3, 4, 5 ];
const newOne = removeFromArray(source, 2, 3);

// output: Result: [1,4,5]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeKeyFromObject(source, ...keys)

removes items with specified key(s) from an object.

```js
import removeKeyFromObject from 'hex/fp/remove-key-from-object';

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = removeKeyFromObject(source, 'b', 'c');

// output: Result: {'a':1,'d':4,'e':5}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### removeValueFromObject(source, ...values)

removes items with specified value(s) from an object or a generator.

```js
import removeValueFromObject from 'hex/fp/remove-value-from-object';

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
import reverseArray from 'hex/fp/reverse-array';

const source = [ 1, 2, 3, 4, 5 ];
const newOne = reverseArray(source);

// output: Result: [5,4,3,2,1]
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### reverseObject(source)

reverses an object content.

```js
import reverseObject from 'hex/fp/reverse-object';

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
import splitArray from 'hex/fp/split-array';

const source = [ 1, 2, 3, 4, 5 ];
const newOne = splitArray(source, 3);

// output: Result: {'items':[1,2,3],'rest':[4,5]}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### splitLastArray(source, number)

splits an array or a generator content from specified last index.

```js
import splitLastArray from 'hex/fp/split-last-array';

const source = [ 1, 2, 3, 4, 5 ];
const newOne = splitLastArray(source, 2);

// output: Result: {'items':[4,5],'rest':[1,2,3]}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### splitObject(source, number)

splits an object content from specified index.

```js
import splitObject from 'hex/fp/split-object';

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = splitObject(source, 3);

// output: Result: {'items':{'a':1,'b':2,'c':3},'rest':{'d':4,'e':5}}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### splitLastObject(source, number)

splits an object content from specified last index.

```js
import splitLastObject from 'hex/fp/split-last-object';

const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const newOne = splitLastObject(source, 2);

// output: Result: {'items':{'d':4,'e':5},'rest':{'a':1,'b':2,'c':3}}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### takeFromArray(source, number)

takes first n items from an array or a generator.

```js
import takeFromArray from 'hex/fp/take-from-array';

const source = [ 'a', 'b', 'c' ];
const newOne = takeFromArray(source, 2);

// output: Result: ['a','b']
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```

### takeFromObject(source, number)

takes first n items from an object.

```js
import takeFromObject from 'hex/fp/take-from0bject';

const source = { a: 1, b: 2, c: 3 };
const newOne = takeFromObject(source, 2);

// output: Result: {'a':1,'b':2}
console.log(`Result: ${JSON.stringify(newOne)}`);
// output: Is Same: false
console.log(`Is Same: ${source === newOne}`);
```
