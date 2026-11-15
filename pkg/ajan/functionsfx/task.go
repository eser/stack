// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import "context"

// Task is a lazy computation: nothing runs until Run is called. It pairs with
// Task in @eserstack/functions, with two differences. The requirements
// parameter R has no Go type, because dependencies reach a task through the
// constructor of the type that builds it. And the Result of TypeScript is the
// (value, error) pair of Go.
type Task[T any] func(ctx context.Context) (T, error)

// Run executes the task. It pairs with runTask.
func (t Task[T]) Run(ctx context.Context) (T, error) {
	return t(ctx)
}

// Succeed returns a task that answers value. It pairs with succeed.
func Succeed[T any](value T) Task[T] {
	return func(context.Context) (T, error) {
		return value, nil
	}
}

// Fail returns a task that answers err. It pairs with failTask.
func Fail[T any](err error) Task[T] {
	return func(context.Context) (T, error) {
		var zero T

		return zero, err
	}
}
