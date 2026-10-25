// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The test doubles the repository's tests use, in one place (decision-3).
 * Tests import this module instead of `@std/testing/mock`.
 *
 * Each export has the signature and behavior of the `@std/testing/mock`
 * export of the same name.
 *
 * @example
 * ```typescript
 * import * as mock from "@eserstack/test-kit/mock";
 *
 * const onSave = mock.spy((value: number) => value * 2);
 * onSave(21);
 * mock.assertSpyCalls(onSave, 1);
 * ```
 *
 * @module
 */

export { assertSpyCalls, spy, stub } from "@std/testing/mock";
export type { Spy, Stub } from "@std/testing/mock";
