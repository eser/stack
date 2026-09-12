package connfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/connfx"
	"github.com/stretchr/testify/assert"
)

// TestRepositoryPortIsImplemented records that the Repository port is real.
//
// An audit recommended deleting the whole Repository/Queue port layer as
// "satisfiable by no adapter". That is wrong, and this test is the evidence:
// RedisAdapter implements Repository in full. Deleting the layer would have
// thrown away a working implementation.
//
// What is actually broken is reachability. Registry.GetRepository is handed
// conn.GetRawConnection(), which every adapter implements by returning the
// vendor handle (*redis.Client), while the Repository methods live on the
// adapter. So the lookup could never find them, and the port looked dead.
//
// If a future change moves these methods off RedisAdapter, this fails and
// forces the delete-or-wire decision to be made deliberately.
func TestRepositoryPortIsImplemented(t *testing.T) {
	t.Parallel()

	var adapter any = &connfx.RedisAdapter{} //nolint:exhaustruct

	_, ok := adapter.(connfx.Repository)

	assert.True(
		t,
		ok,
		"RedisAdapter must satisfy connfx.Repository; if this is no longer "+
			"true, the port layer has no implementation and the delete-it "+
			"recommendation becomes correct",
	)
}
