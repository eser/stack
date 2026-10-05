package workerfx_test

import (
	"slices"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/workerfx"
)

func newRunner(name string) *workerfx.Runner {
	worker := &fakeWorker{name: name, interval: time.Minute}

	return workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))
}

func TestRegistryGet(t *testing.T) {
	t.Parallel()

	feeds := newRunner("sync-feeds")
	digests := newRunner("send-digests")

	registry := workerfx.NewRegistry()
	registry.Register(feeds)
	registry.Register(digests)

	cases := []struct {
		name   string
		lookup string
		want   *workerfx.Runner
		wantOK bool
	}{
		{name: "registered worker", lookup: "sync-feeds", want: feeds, wantOK: true},
		{name: "another registered worker", lookup: "send-digests", want: digests, wantOK: true},
		{name: "unknown worker", lookup: "rebuild-index", want: nil, wantOK: false},
		{name: "name differs in case", lookup: "Sync-Feeds", want: nil, wantOK: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, ok := registry.Get(tc.lookup)
			if got != tc.want || ok != tc.wantOK {
				t.Errorf("Get(%q) = (%p, %v), want (%p, %v)", tc.lookup, got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

func TestRegistryListReturnsEveryStatus(t *testing.T) {
	t.Parallel()

	registry := workerfx.NewRegistry()

	if got := registry.List(); got == nil || len(got) != 0 {
		t.Fatalf("List() on an empty registry = %#v, want an empty slice", got)
	}

	registry.Register(newRunner("sync-feeds"))
	registry.Register(newRunner("send-digests"))

	names := make([]string, 0, 2)
	for _, status := range registry.List() {
		names = append(names, status.Name)
	}

	slices.Sort(names)

	if want := []string{"send-digests", "sync-feeds"}; !slices.Equal(names, want) {
		t.Errorf("List() names = %v, want %v", names, want)
	}
}

func TestRegistryRegisterReplacesASameNamedRunner(t *testing.T) {
	t.Parallel()

	first := newRunner("sync-feeds")
	second := newRunner("sync-feeds")

	registry := workerfx.NewRegistry()
	registry.Register(first)
	registry.Register(second)

	if got, _ := registry.Get("sync-feeds"); got != second {
		t.Errorf("Get(%q) = %p, want the later runner %p", "sync-feeds", got, second)
	}

	if got := len(registry.List()); got != 1 {
		t.Errorf("len(List()) = %d, want 1", got)
	}
}
