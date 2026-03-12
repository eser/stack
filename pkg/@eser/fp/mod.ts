// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export { appendToArray } from "./append-to-array.ts";
export { appendToObject } from "./append-to-object.ts";
export { associateArray } from "./associate-array.ts";
export { associateObject } from "./associate-object.ts";
export { chunk } from "./chunk.ts";
export { compose } from "./compose.ts";
export { curryRight } from "./curry-right.ts";
export { curry } from "./curry.ts";
export { decorate, type Decorated } from "./decorate.ts";
export {
  DEEP_COPY_DEFAULT_MAX_DEPTH,
  deepCopy,
  deepCopy2,
  DeepCopyError,
  type DeepCopyOptions,
} from "./deep-copy.ts";
export {
  DEEP_MERGE_DEFAULT_MAX_DEPTH,
  deepMerge,
  DeepMergeError,
  type DeepMergeOptions,
} from "./deep-merge.ts";
export {
  dispatcher,
  type LoggerType,
  type LogType,
  type MutatorType,
  type NextType,
} from "./dispatcher.ts";
export { distinctArray } from "./distinct-array.ts";
export { ensureArray } from "./ensure-array.ts";
export { distinctObject } from "./distinct-object.ts";
export { dropFromArray } from "./drop-from-array.ts";
export { dropFromObject } from "./drop-from-object.ts";
export { emitter, type EventType } from "./emitter.ts";
export { filterArray } from "./filter-array.ts";
export { filterObject } from "./filter-object.ts";
export { get } from "./get.ts";
export { groupBy } from "./group-by.ts";
export { iterate } from "./iterate.ts";
export { keyBy } from "./key-by.ts";
export { mapArray } from "./map-array.ts";
export { mapObject } from "./map-object.ts";
export { type Callback, match, type Pattern } from "./match.ts";
export { memoize, type MemoizedFn } from "./memoize.ts";
export { mergeArrays } from "./merge-arrays.ts";
export { mergeObjects } from "./merge-objects.ts";
export { mutate } from "./mutate.ts";
export { pickFromArray, type PickFromArrayResult } from "./pick-from-array.ts";
export {
  pickFromObject,
  type PickFromObjectResult,
} from "./pick-from-object.ts";
export { flow } from "./flow.ts";
export { pipe } from "./pipe.ts";
export { prependToArray } from "./prepend-to-array.ts";
export { prependToObject } from "./prepend-to-object.ts";
export { removeFirstMatchFromArray } from "./remove-first-match-from-array.ts";
export { removeFirstMatchFromObject } from "./remove-first-match-from-object.ts";
export { removeIndexFromArray } from "./remove-index-from-array.ts";
export { removeKeyFromObject } from "./remove-key-from-object.ts";
export { removeValueFromArray } from "./remove-value-from-array.ts";
export { removeValueFromObject } from "./remove-value-from-object.ts";
export { reverseArray } from "./reverse-array.ts";
export { reverseObject } from "./reverse-object.ts";
export { splitArray, type SplitArrayResult } from "./split-array.ts";
export { splitObject, type SplitObjectResult } from "./split-object.ts";
export { takeFromArray } from "./take-from-array.ts";
export { takeFromObject } from "./take-from-object.ts";
export { wth } from "./wth.ts";
export { wthout } from "./wthout.ts";
