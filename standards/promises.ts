// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

export type Promisable<T> = Promise<T> | T;
export type Generatable<T> = AsyncGenerator<T> | Generator<T>;
