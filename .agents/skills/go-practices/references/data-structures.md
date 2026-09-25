# Go Data Structures

Which structure to use and the traps that come with slices, maps, buffers and
generic containers. The principle is design-principles: Choose Data Structures
by Access Pattern; performance claims follow coding-practices: Performance
Claims Need Measurement.

## Contents

- Summary
- Clone at the Boundary
- Maps
- Containers and Buffers
- Generic Containers
- `unsafe`, `weak` and `unique`
- Third-Party Collections
- Common Mistakes

---

## Summary

1. Preallocate when the size is known or estimable: `make([]T, n)` with indexed
   writes for an exact size, `make([]T, 0, n)` or `slices.Grow` for an estimate,
   `make(map[K]V, n)` for maps. The `prealloc` linter flags the obvious cases.
2. Arrays only for sizes fixed by the problem (`type Digest [32]byte`); slices
   for everything that grows or comes from input.
3. Do not depend on when `append` reallocates; the growth policy is a runtime
   detail.
4. Slices and maps share their data on assignment. Clone at the boundary where
   independence matters.
5. A plain slice beats `container/list` and `container/ring` for most workloads;
   use `container/heap` for priority queues.
6. `strings.Builder` to build a string; `bytes.Buffer` when the same bytes are
   also read or reused.
7. Generic containers take the tightest constraint that works: `comparable` for
   keys, `cmp.Ordered` for ordering, a method interface for domain behavior.
8. Avoid `unsafe` outside the FFI bridge.

---

## Clone at the Boundary

A function that returns internal state returns a copy, so a caller cannot change
it behind the owner's back. A struct holding a slice or map is copied shallowly:
both copies still share that slice or map.

```go
func (r *Registry) IDs() []string {
    r.mu.RLock()
    defer r.mu.RUnlock()
    return slices.Clone(r.ids) // callers get their own slice
}
```

When a sub-slice is handed out and must not be appended into (appending could
overwrite the owner's next elements), cap it with a full slice expression:
`head := s[:n:n]`.

---

## Maps

- Iteration order is unspecified; sort the keys when order matters
  (`slices.Sorted(maps.Keys(m))`).
- Reading a map value copies it. For large values store pointers (`map[K]*V`);
  for small values a value map is usually faster, since each pointer adds GC
  work (language.md: Value vs Pointer Parameters).
- Maps do not shrink after deletes. Rebuild a long-lived map that has shrunk for
  good.
- Go 1.24 changed the map implementation; do not rely on its internals.

---

## Containers and Buffers

`container/list` and `container/ring` store `any`; wrap them in a small generic
type rather than asserting at every use (language.md: Types: Narrow Conversions
and Generics). A fixed-size rolling window is a slice and an index, fully typed:

```go
type Window struct {
    values []float64
    next   int
    filled bool
}

func (w *Window) Add(v float64) {
    w.values[w.next] = v
    w.next = (w.next + 1) % len(w.values)
    w.filled = w.filled || w.next == 0
}
```

- `bufio.Writer` holds data until `Flush`; call it and check its error, or the
  tail of the output is lost.
- `bufio.Scanner` stops at tokens over 64 KiB. Set `scanner.Buffer` when lines
  can be long, and check `scanner.Err()` after the loop.

---

## Generic Containers

```go
type Set[T comparable] map[T]struct{}

func NewSet[T comparable](values ...T) Set[T] {
    s := make(Set[T], len(values))
    for _, v := range values {
        s[v] = struct{}{}
    }
    return s
}

func (s Set[T]) Add(v T)           { s[v] = struct{}{} }
func (s Set[T]) Contains(v T) bool { _, ok := s[v]; return ok }

func InsertSorted[T cmp.Ordered](s []T, v T) []T {
    i, _ := slices.BinarySearch(s, v)
    return slices.Insert(s, i, v)
}
```

A type parameter earns its place when the same logic serves several types. When
a function has one concrete type, or the body type-switches on the parameter,
write it for that type or use an interface.

---

## `unsafe`, `weak` and `unique`

- `unsafe` is for the FFI bridge (`pkg/@eserstack/ajan`) and memory layout only.
  Never keep a pointer in a `uintptr` across statements; use `unsafe.Add`,
  `unsafe.Slice`, `unsafe.String` and `unsafe.SliceData`, which keep the value
  visible to the collector.
- `unique.Make` (Go 1.23+) canonicalizes comparable values.
- `weak.Pointer` (Go 1.24+) is only for a cache whose entries may disappear;
  pair it with `runtime.AddCleanup`, not `runtime.SetFinalizer`.

---

## Third-Party Collections

The standard library plus a small generic type covers sets, queues, heaps and
windows. A collection library is a new dependency and goes through
tooling-standards: Adding a Dependency first.

---

## Common Mistakes

| Mistake                                             | Fix                                                  |
| --------------------------------------------------- | ---------------------------------------------------- |
| Appending in a loop with a known final size         | `make([]T, 0, n)` or `slices.Grow`                   |
| Handing out an internal slice or map                | Return `slices.Clone` or `maps.Clone`                |
| Appending into a sub-slice that aliases another     | Cap the view with `s[:n:n]`                          |
| Relying on map iteration order                      | Sort the keys                                        |
| `container/list` where a slice would do             | Use a slice; measure before switching                |
| `bytes.Buffer` only to build a string               | `strings.Builder`                                    |
| Forgetting `Flush` on a `bufio.Writer`              | Flush and return its error                           |
| Keeping a small sub-slice or substring of big input | `bytes.Clone`, `strings.Clone`, so the rest is freed |
| Keeping a pointer in a `uintptr` between statements | `unsafe.Add` in one expression, or avoid `unsafe`    |

Allocation and layout work for hot paths (reuse, pooling, field order) is in
[performance.md](performance.md).
