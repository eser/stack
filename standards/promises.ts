export type Promisable<T> = Promise<T> | T;
export type Generatable<T> = AsyncGenerator<T> | Generator<T>;
