// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"context"
	"errors"
	"slices"
	"sync"
)

// ErrScopeClosed is returned when a finalizer is added to a scope that has
// closed. The message is the one createScope has in resources.ts.
var ErrScopeClosed = errors.New("Cannot add finalizer to closed scope") //nolint:staticcheck // the text pairs with the TypeScript message

// The release functions of this file take no context: a resource is released
// when its use ended, which is often because the context did, and the release
// must still run.

// Bracket acquires a resource, uses it and releases it. The release runs after
// the use however it ended: with a value, with an error, or with a panic. A
// failed acquire runs neither. It pairs with bracket, and with using, which is
// bracket with a release that cannot fail.
func Bracket[R, T any](acquire Task[R], use func(R) Task[T], release func(R)) Task[T] {
	return func(ctx context.Context) (T, error) {
		var zero T

		resource, err := acquire(ctx)
		if err != nil {
			return zero, err
		}

		defer release(resource)

		return use(resource)(ctx)
	}
}

// BracketWithReleaseError is Bracket with a release that can fail. A failed
// release is the answer, even when the use failed too, and it replaces a value.
// It pairs with bracketWithReleaseError.
func BracketWithReleaseError[R, T any](acquire Task[R], use func(R) Task[T], release func(R) error) Task[T] {
	return func(ctx context.Context) (T, error) {
		var zero T

		resource, err := acquire(ctx)
		if err != nil {
			return zero, err
		}

		value, useErr := useReleasingOnPanic(ctx, resource, use, release)

		if releaseErr := release(resource); releaseErr != nil {
			return zero, releaseErr
		}

		return value, useErr
	}
}

// useReleasingOnPanic runs the use and releases the resource if it panics, then
// lets the panic go on, as bracketWithReleaseError releases before it rethrows.
func useReleasingOnPanic[R, T any](ctx context.Context, resource R, use func(R) Task[T], release func(R) error) (T, error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			_ = release(resource)

			panic(recovered)
		}
	}()

	return use(resource)(ctx)
}

// Finalizer releases one resource of a Scope.
type Finalizer func() error

// Scope is a group of resources released together. Finalizers run in reverse
// order of their addition (LIFO), so a resource is released before the ones
// acquired ahead of it. It is safe for concurrent use. It pairs with the Scope
// of createScope.
type Scope struct {
	finalizers []Finalizer // guarded by mu
	mu         sync.Mutex
	closed     bool // guarded by mu
}

// NewScope creates an open scope. It pairs with createScope.
func NewScope() *Scope {
	return &Scope{finalizers: nil, mu: sync.Mutex{}, closed: false}
}

// AddFinalizer registers a release. It is ErrScopeClosed once the scope has
// closed.
func (s *Scope) AddFinalizer(finalizer Finalizer) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return ErrScopeClosed
	}

	s.finalizers = append(s.finalizers, finalizer)

	return nil
}

// Close runs every finalizer, the last added first, and answers the errors of
// the ones that failed, joined: a failing finalizer does not stop the others. It
// runs them once; a second Close does nothing and answers nil.
func (s *Scope) Close() error {
	s.mu.Lock()

	if s.closed {
		s.mu.Unlock()

		return nil
	}

	s.closed = true
	finalizers := s.finalizers
	s.finalizers = nil

	s.mu.Unlock()

	var errs []error

	for _, finalizer := range slices.Backward(finalizers) {
		if err := finalizer(); err != nil {
			errs = append(errs, err)
		}
	}

	return errors.Join(errs...)
}

// Scoped runs the task fn builds with a new scope and closes the scope when the
// task ends, however it ended. A failure to close is joined to the task's own
// error. It pairs with scoped, and with the use of a scope.
func Scoped[T any](fn func(*Scope) Task[T]) Task[T] {
	return func(ctx context.Context) (T, error) {
		scope := NewScope()

		value, err := runClosingOnPanic(ctx, scope, fn)

		if closeErr := scope.Close(); closeErr != nil {
			var zero T

			return zero, errors.Join(err, closeErr)
		}

		return value, err
	}
}

func runClosingOnPanic[T any](ctx context.Context, scope *Scope, fn func(*Scope) Task[T]) (T, error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			_ = scope.Close()

			panic(recovered)
		}
	}()

	return fn(scope)(ctx)
}

// AcquireRelease acquires a resource and registers its release with the scope,
// when the acquire succeeded. It pairs with acquireRelease.
func AcquireRelease[R any](scope *Scope, acquire Task[R], release func(R) error) Task[R] {
	return func(ctx context.Context) (R, error) {
		resource, err := acquire(ctx)
		if err != nil {
			return resource, err
		}

		if addErr := scope.AddFinalizer(func() error { return release(resource) }); addErr != nil {
			// The scope is closed, so nothing will release the resource.
			return resource, errors.Join(addErr, release(resource))
		}

		return resource, nil
	}
}

// Ensure runs the finalizer after the task however it ended. A failing
// finalizer is joined to the task's error. It pairs with ensure.
func Ensure[T any](t Task[T], finalizer Finalizer) Task[T] {
	return func(ctx context.Context) (value T, err error) {
		defer func() {
			if finalizerErr := finalizer(); finalizerErr != nil {
				err = errors.Join(err, finalizerErr)
			}
		}()

		return t(ctx)
	}
}
