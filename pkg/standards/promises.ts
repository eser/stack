// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type Promisable<T> = Promise<T> | T;
export type Generatable<T> = AsyncGenerator<T> | Generator<T>;
