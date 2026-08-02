// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase C — retroactive bridge tests for log ShouldLog/Configure FFI.

package main

import (
	"encoding/json"
	"fmt"
	"testing"
)

// logHandleResp is a local mirror of the create-response shape.
type logHandleResp struct {
	Handle string `json:"handle"`
	Error  string `json:"error,omitempty"`
}

// ─── create ──────────────────────────────────────────────────────────────────

func TestBridgeLogCreate_Default(t *testing.T) {
	t.Parallel()

	got := bridgeLogCreate(`{}`)
	var resp logHandleResp
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.Handle == "" {
		t.Fatal("expected non-empty handle")
	}

	bridgeLogClose(resp.Handle)
}

func TestBridgeLogCreate_WithLevel(t *testing.T) {
	t.Parallel()

	got := bridgeLogCreate(`{"level":"TRACE"}`)
	var resp logHandleResp
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.Handle == "" {
		t.Fatal("expected non-empty handle")
	}

	bridgeLogClose(resp.Handle)
}

// ─── write ───────────────────────────────────────────────────────────────────

func TestBridgeLogWrite_Basic(t *testing.T) {
	t.Parallel()

	createResp := bridgeLogCreate(`{"level":"INFO"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	writeResp := bridgeLogWrite(fmt.Sprintf(`{"handle":%q,"level":"INFO","message":"test"}`, cr.Handle))
	if writeResp != "{}" {
		t.Fatalf("expected {}, got: %s", writeResp)
	}

	bridgeLogClose(cr.Handle)
}

func TestBridgeLogWrite_UnknownHandle(t *testing.T) {
	t.Parallel()

	got := bridgeLogWrite(`{"handle":"log-does-not-exist","level":"INFO","message":"x"}`)
	var resp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == "" {
		t.Fatal("expected error for unknown handle")
	}
}

// ─── shouldLog ───────────────────────────────────────────────────────────────

func TestBridgeLogShouldLog_InfoEnabledAtInfo(t *testing.T) {
	t.Parallel()

	createResp := bridgeLogCreate(`{"level":"INFO"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	got := bridgeLogShouldLog(fmt.Sprintf(`{"handle":%q,"level":"INFO"}`, cr.Handle))
	var resp logShouldLogResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if !resp.Allowed {
		t.Fatal("expected INFO to be allowed at INFO level")
	}

	bridgeLogClose(cr.Handle)
}

func TestBridgeLogShouldLog_DebugDisabledAtInfo(t *testing.T) {
	t.Parallel()

	createResp := bridgeLogCreate(`{"level":"INFO"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	got := bridgeLogShouldLog(fmt.Sprintf(`{"handle":%q,"level":"DEBUG"}`, cr.Handle))
	var resp logShouldLogResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if resp.Allowed {
		t.Fatal("expected DEBUG to be disabled at INFO level")
	}

	bridgeLogClose(cr.Handle)
}

func TestBridgeLogShouldLog_TraceEnabledAtTrace(t *testing.T) {
	t.Parallel()

	createResp := bridgeLogCreate(`{"level":"TRACE"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	got := bridgeLogShouldLog(fmt.Sprintf(`{"handle":%q,"level":"TRACE"}`, cr.Handle))
	var resp logShouldLogResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "" {
		t.Fatalf("unexpected error: %s", resp.Error)
	}
	if !resp.Allowed {
		t.Fatal("expected TRACE to be allowed at TRACE level")
	}

	bridgeLogClose(cr.Handle)
}

func TestBridgeLogShouldLog_UnknownHandle(t *testing.T) {
	t.Parallel()

	got := bridgeLogShouldLog(`{"handle":"log-does-not-exist","level":"INFO"}`)
	var resp logShouldLogResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == "" {
		t.Fatal("expected error for unknown handle")
	}
}

// ─── configure ───────────────────────────────────────────────────────────────

func TestBridgeLogConfigure_LowersLevel(t *testing.T) {
	t.Parallel()

	// Create at ERROR — TRACE should be disabled
	createResp := bridgeLogCreate(`{"level":"ERROR"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	shouldBefore := bridgeLogShouldLog(fmt.Sprintf(`{"handle":%q,"level":"TRACE"}`, cr.Handle))
	var before logShouldLogResponse
	if err := json.Unmarshal([]byte(shouldBefore), &before); err != nil {
		t.Fatalf("before unmarshal: %v", err)
	}
	if before.Allowed {
		t.Fatal("expected TRACE to be disabled before configure")
	}

	// Configure down to TRACE
	cfgResp := bridgeLogConfigure(fmt.Sprintf(`{"handle":%q,"level":"TRACE"}`, cr.Handle))
	if cfgResp != "{}" {
		t.Fatalf("configure expected {}, got: %s", cfgResp)
	}

	// Now TRACE must be allowed
	shouldAfter := bridgeLogShouldLog(fmt.Sprintf(`{"handle":%q,"level":"TRACE"}`, cr.Handle))
	var after logShouldLogResponse
	if err := json.Unmarshal([]byte(shouldAfter), &after); err != nil {
		t.Fatalf("after unmarshal: %v", err)
	}
	if !after.Allowed {
		t.Fatal("expected TRACE to be allowed after configure to TRACE")
	}

	bridgeLogClose(cr.Handle)
}

func TestBridgeLogConfigure_RaisesLevel(t *testing.T) {
	t.Parallel()

	// Create at TRACE, then raise to ERROR
	createResp := bridgeLogCreate(`{"level":"TRACE"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	bridgeLogConfigure(fmt.Sprintf(`{"handle":%q,"level":"ERROR"}`, cr.Handle))

	// DEBUG must now be disabled
	got := bridgeLogShouldLog(fmt.Sprintf(`{"handle":%q,"level":"DEBUG"}`, cr.Handle))
	var resp logShouldLogResponse
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Allowed {
		t.Fatal("expected DEBUG to be disabled after configure to ERROR")
	}

	bridgeLogClose(cr.Handle)
}

func TestBridgeLogConfigure_UnknownHandle(t *testing.T) {
	t.Parallel()

	got := bridgeLogConfigure(`{"handle":"log-does-not-exist","level":"DEBUG"}`)
	var resp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == "" {
		t.Fatal("expected error for unknown handle")
	}
}

// ─── filter ──────────────────────────────────────────────────────────────────

func TestBridgeLogConfigure_CategoryFilter_Drops(t *testing.T) {
	t.Parallel()

	// Create with scope "myapp" so category filter can inspect it.
	createResp := bridgeLogCreate(`{"scopeName":"myapp","level":"INFO"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	// Install a category filter that only allows "allowed" scope prefix.
	cfgPayload := fmt.Sprintf(
		`{"handle":%q,"filters":[{"type":"category","category":"allowed"}]}`,
		cr.Handle,
	)
	if got := bridgeLogConfigure(cfgPayload); got != "{}" {
		t.Fatalf("configure expected {}, got: %s", got)
	}

	// Write with scope "myapp" — must be filtered.
	writePayload := fmt.Sprintf(`{"handle":%q,"level":"INFO","message":"filtered record"}`, cr.Handle)
	got := bridgeLogWrite(writePayload)

	var resp map[string]any
	if err := json.Unmarshal([]byte(got), &resp); err != nil {
		t.Fatalf("write unmarshal: %v", err)
	}

	if filtered, _ := resp["filtered"].(bool); !filtered {
		t.Fatalf("expected filtered=true, got: %s", got)
	}

	bridgeLogClose(cr.Handle)
}

func TestBridgeLogConfigure_Formatter_Text(t *testing.T) {
	t.Parallel()

	createResp := bridgeLogCreate(`{"level":"INFO"}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	cfgPayload := fmt.Sprintf(`{"handle":%q,"formatter":"text"}`, cr.Handle)
	if got := bridgeLogConfigure(cfgPayload); got != "{}" {
		t.Fatalf("configure expected {}, got: %s", got)
	}

	// Write should succeed (formatter writes to stderr, returns {}).
	writePayload := fmt.Sprintf(`{"handle":%q,"level":"INFO","message":"formatted"}`, cr.Handle)
	if got := bridgeLogWrite(writePayload); got != "{}" {
		t.Fatalf("write expected {}, got: %s", got)
	}

	bridgeLogClose(cr.Handle)
}

// ─── close ───────────────────────────────────────────────────────────────────

func TestBridgeLogClose_RemovesHandle(t *testing.T) {
	t.Parallel()

	createResp := bridgeLogCreate(`{}`)
	var cr logHandleResp
	if err := json.Unmarshal([]byte(createResp), &cr); err != nil {
		t.Fatalf("create unmarshal: %v", err)
	}

	closeResp := bridgeLogClose(cr.Handle)
	if closeResp != "{}" {
		t.Fatalf("close expected {}, got: %s", closeResp)
	}

	// Writing after close must return an error
	writeResp := bridgeLogWrite(fmt.Sprintf(`{"handle":%q,"level":"INFO","message":"x"}`, cr.Handle))
	var resp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(writeResp), &resp); err != nil {
		t.Fatalf("write unmarshal: %v", err)
	}
	if resp.Error == "" {
		t.Fatal("expected error writing to closed handle")
	}
}
