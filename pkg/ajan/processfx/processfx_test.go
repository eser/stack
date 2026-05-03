// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package processfx_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/processfx"
)

// ---- heartbeat ----

func TestNewHeartbeatSender(t *testing.T) {
	t.Parallel()

	ch := make(chan processfx.Heartbeat, 1)
	sender := processfx.NewHeartbeatSender(ch, "w1")

	if sender == nil {
		t.Fatal("expected non-nil HeartbeatSender")
	}
}

func TestHeartbeatSender_Beat(t *testing.T) {
	t.Parallel()

	ch := make(chan processfx.Heartbeat, 1)
	sender := processfx.NewHeartbeatSender(ch, "w1")
	sender.Beat(context.Background())

	select {
	case hb := <-ch:
		if hb.Type != processfx.HeartbeatLiveness {
			t.Errorf("expected HeartbeatLiveness, got %v", hb.Type)
		}
		if hb.WorkerID != "w1" {
			t.Errorf("expected workerID w1, got %q", hb.WorkerID)
		}
		if hb.Progress != 0 {
			t.Errorf("expected progress 0, got %d", hb.Progress)
		}
	default:
		t.Fatal("expected heartbeat in channel")
	}
}

func TestHeartbeatSender_BeatWithProgress(t *testing.T) {
	t.Parallel()

	ch := make(chan processfx.Heartbeat, 1)
	sender := processfx.NewHeartbeatSender(ch, "w2")
	sender.BeatWithProgress(context.Background(), 42)

	select {
	case hb := <-ch:
		if hb.Type != processfx.HeartbeatProgress {
			t.Errorf("expected HeartbeatProgress, got %v", hb.Type)
		}
		if hb.Progress != 42 {
			t.Errorf("expected progress 42, got %d", hb.Progress)
		}
	default:
		t.Fatal("expected heartbeat in channel")
	}
}

func TestHeartbeatSender_SendHeartbeat_Direct(t *testing.T) {
	t.Parallel()

	ch := make(chan processfx.Heartbeat, 1)
	sender := processfx.NewHeartbeatSender(ch, "w3")
	hb := processfx.Heartbeat{
		Type:      processfx.HeartbeatLiveness,
		Timestamp: time.Now(),
		WorkerID:  "w3",
		Progress:  0,
	}

	err := sender.SendHeartbeat(context.Background(), hb)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	select {
	case <-ch:
	default:
		t.Fatal("expected heartbeat in channel")
	}
}

func TestHeartbeatSender_SendHeartbeat_ContextDone(t *testing.T) {
	t.Parallel()

	// Unbuffered channel with no reader. Context already canceled.
	ch := make(chan processfx.Heartbeat)
	sender := processfx.NewHeartbeatSender(ch, "w4")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// Must not block regardless of which select branch is chosen.
	hb := processfx.Heartbeat{Type: processfx.HeartbeatLiveness, Timestamp: time.Now()}
	_ = sender.SendHeartbeat(ctx, hb)
}

func TestHeartbeatSender_SendHeartbeat_ChannelFull(t *testing.T) {
	t.Parallel()

	ch := make(chan processfx.Heartbeat, 1)
	ch <- processfx.Heartbeat{} // fill the buffer

	sender := processfx.NewHeartbeatSender(ch, "w5")
	hb := processfx.Heartbeat{Type: processfx.HeartbeatLiveness, Timestamp: time.Now()}

	// default branch: channel full, return nil without blocking
	err := sender.SendHeartbeat(context.Background(), hb)
	if err != nil {
		t.Fatalf("expected nil when channel full, got %v", err)
	}
}

func TestContextWithHeartbeat_RoundTrip(t *testing.T) {
	t.Parallel()

	ch := make(chan processfx.Heartbeat, 1)
	sender := processfx.NewHeartbeatSender(ch, "ctx-w")
	ctx := processfx.ContextWithHeartbeat(context.Background(), sender)
	got := processfx.HeartbeatFromContext(ctx)

	if got == nil {
		t.Fatal("expected HeartbeatSender from context, got nil")
	}
}

func TestHeartbeatFromContext_NotSet(t *testing.T) {
	t.Parallel()

	got := processfx.HeartbeatFromContext(context.Background())
	if got == nil {
		t.Fatal("expected NoopHeartbeatSender, got nil")
	}

	// NoopHeartbeatSender must not panic on any method.
	got.Beat(context.Background())
	got.BeatWithProgress(context.Background(), 10)

	err := got.SendHeartbeat(context.Background(), processfx.Heartbeat{})
	if err != nil {
		t.Errorf("NoopHeartbeatSender.SendHeartbeat should return nil, got %v", err)
	}
}

// ---- process ----

func TestProcess_New(t *testing.T) {
	t.Parallel()

	p := processfx.New(context.Background(), nil)

	if p == nil {
		t.Fatal("expected non-nil Process")
	}

	if p.Ctx == nil {
		t.Fatal("expected non-nil Ctx")
	}

	if p.Cancel == nil {
		t.Fatal("expected non-nil Cancel")
	}

	if p.ShutdownTimeout <= 0 {
		t.Errorf("expected positive ShutdownTimeout, got %v", p.ShutdownTimeout)
	}
}

func TestProcess_StartGoroutine_Wait_Shutdown(t *testing.T) {
	t.Parallel()

	p := processfx.New(context.Background(), nil)

	started := make(chan struct{})
	stopped := make(chan struct{})

	p.StartGoroutine("test-worker", func(ctx context.Context) error {
		close(started)
		<-ctx.Done()
		close(stopped)

		return nil
	})

	// Wait for the goroutine to start.
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("goroutine did not start")
	}

	// Cancel the context, which triggers Wait to unblock.
	p.Cancel()
	p.Wait()

	// Shutdown should drain the goroutine gracefully.
	shutdownDone := make(chan struct{})

	go func() {
		p.Shutdown()
		close(shutdownDone)
	}()

	select {
	case <-shutdownDone:
	case <-time.After(5 * time.Second):
		t.Fatal("Shutdown timed out")
	}

	select {
	case <-stopped:
	case <-time.After(1 * time.Second):
		t.Fatal("goroutine did not stop cleanly")
	}
}

// ---- registry ----

func newTestSupervisor(t *testing.T, name string) *processfx.Supervisor {
	t.Helper()

	cfg := processfx.SupervisedWorkerConfig{
		Name:              name,
		HeartbeatTimeout:  10 * time.Second,
		MaxRestarts:       1,
		BackoffInitial:    1 * time.Second,
		BackoffMax:        2 * time.Second,
		BackoffMultiplier: 1.5,
	}

	return processfx.NewSupervisor(cfg, nil, nil)
}

func TestSupervisorRegistry_BasicCRUD(t *testing.T) {
	t.Parallel()

	r := processfx.NewSupervisorRegistry()

	if r.Count() != 0 {
		t.Fatalf("expected 0 supervisors, got %d", r.Count())
	}

	sup := newTestSupervisor(t, "worker-a")
	r.Register(sup)

	if r.Count() != 1 {
		t.Fatalf("expected 1 supervisor after register, got %d", r.Count())
	}

	got := r.Get("worker-a")
	if got == nil {
		t.Fatal("expected supervisor, got nil")
	}

	if got.Name() != "worker-a" {
		t.Errorf("expected name worker-a, got %q", got.Name())
	}

	r.Unregister("worker-a")

	if r.Count() != 0 {
		t.Fatalf("expected 0 supervisors after unregister, got %d", r.Count())
	}

	if r.Get("worker-a") != nil {
		t.Fatal("expected nil after unregister")
	}
}

func TestSupervisorRegistry_All(t *testing.T) {
	t.Parallel()

	r := processfx.NewSupervisorRegistry()
	r.Register(newTestSupervisor(t, "w1"))
	r.Register(newTestSupervisor(t, "w2"))

	all := r.All()

	if len(all) != 2 {
		t.Fatalf("expected 2 supervisors, got %d", len(all))
	}
}

func TestSupervisorRegistry_AllStatuses(t *testing.T) {
	t.Parallel()

	r := processfx.NewSupervisorRegistry()
	r.Register(newTestSupervisor(t, "wx"))

	statuses := r.AllStatuses()

	if len(statuses) != 1 {
		t.Fatalf("expected 1 status entry, got %d", len(statuses))
	}

	st, ok := statuses["wx"]
	if !ok {
		t.Fatal("expected status for wx")
	}

	if st.Name != "wx" {
		t.Errorf("expected name wx, got %q", st.Name)
	}
}

func TestSupervisorRegistry_IsHealthy_Empty(t *testing.T) {
	t.Parallel()

	r := processfx.NewSupervisorRegistry()

	if !r.IsHealthy() {
		t.Fatal("empty registry should be healthy")
	}
}

func TestSupervisorRegistry_IsHealthy_WithIdleSupervisor(t *testing.T) {
	t.Parallel()

	r := processfx.NewSupervisorRegistry()
	r.Register(newTestSupervisor(t, "idle-w"))

	if !r.IsHealthy() {
		t.Fatal("registry with idle supervisor should be healthy")
	}
}

func TestSupervisorRegistry_Summary_Healthy(t *testing.T) {
	t.Parallel()

	r := processfx.NewSupervisorRegistry()
	r.Register(newTestSupervisor(t, "s1"))

	sum := r.Summary()

	if sum.Total != 1 {
		t.Fatalf("expected total 1, got %d", sum.Total)
	}

	if sum.Healthy != 1 {
		t.Fatalf("expected healthy 1, got %d", sum.Healthy)
	}

	if !sum.IsHealthy {
		t.Fatal("summary with idle supervisor should be healthy")
	}
}

func TestSupervisorRegistry_Summary_WithFailedSupervisor(t *testing.T) {
	t.Parallel()

	cfg := processfx.SupervisedWorkerConfig{
		Name:              "fail-quickly",
		HeartbeatTimeout:  30 * time.Millisecond,
		MaxRestarts:       0,
		BackoffInitial:    1 * time.Millisecond,
		BackoffMax:        1 * time.Millisecond,
		BackoffMultiplier: 1.0,
	}
	sup := processfx.NewSupervisor(cfg, nil, nil)

	runDone := make(chan error, 1)

	go func() {
		err := sup.Run(context.Background(), func(workerCtx context.Context, _ processfx.HeartbeatSender) error {
			<-workerCtx.Done()

			return workerCtx.Err()
		})
		runDone <- err
	}()

	select {
	case err := <-runDone:
		if !errors.Is(err, processfx.ErrMaxRestartsExceeded) {
			t.Fatalf("expected ErrMaxRestartsExceeded, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("supervisor did not fail within timeout")
	}

	r := processfx.NewSupervisorRegistry()
	r.Register(sup)

	sum := r.Summary()

	if sum.Failed != 1 {
		t.Fatalf("expected failed=1, got %d", sum.Failed)
	}

	if sum.IsHealthy {
		t.Fatal("summary with failed supervisor should not be healthy")
	}
}

// ---- supervised ----

func TestDefaultSupervisedConfig(t *testing.T) {
	t.Parallel()

	cfg := processfx.DefaultSupervisedConfig("my-worker")

	if cfg.Name != "my-worker" {
		t.Errorf("expected name my-worker, got %q", cfg.Name)
	}

	if cfg.MaxRestarts <= 0 {
		t.Errorf("expected positive MaxRestarts, got %d", cfg.MaxRestarts)
	}

	if cfg.HeartbeatTimeout <= 0 {
		t.Errorf("expected positive HeartbeatTimeout, got %v", cfg.HeartbeatTimeout)
	}

	if cfg.BackoffMultiplier < 1.0 {
		t.Errorf("expected BackoffMultiplier >= 1.0, got %f", cfg.BackoffMultiplier)
	}

	if cfg.BackoffMax < cfg.BackoffInitial {
		t.Errorf("BackoffMax %v must be >= BackoffInitial %v", cfg.BackoffMax, cfg.BackoffInitial)
	}
}

func TestSupervisedWorkerConfig_Validate(t *testing.T) {
	t.Parallel()

	base := processfx.SupervisedWorkerConfig{
		Name:              "w",
		HeartbeatTimeout:  1 * time.Second,
		MaxRestarts:       1,
		BackoffInitial:    100 * time.Millisecond,
		BackoffMax:        1 * time.Second,
		BackoffMultiplier: 1.5,
	}

	tests := []struct {
		name    string
		mutate  func(*processfx.SupervisedWorkerConfig)
		wantErr error
	}{
		{"valid", func(*processfx.SupervisedWorkerConfig) {}, nil},
		{"empty name", func(c *processfx.SupervisedWorkerConfig) { c.Name = "" }, processfx.ErrWorkerNameRequired},
		{"zero heartbeat", func(c *processfx.SupervisedWorkerConfig) { c.HeartbeatTimeout = 0 }, processfx.ErrHeartbeatTimeoutPositive},
		{"negative max restarts", func(c *processfx.SupervisedWorkerConfig) { c.MaxRestarts = -1 }, processfx.ErrMaxRestartsNonNegative},
		{"zero backoff initial", func(c *processfx.SupervisedWorkerConfig) { c.BackoffInitial = 0 }, processfx.ErrBackoffInitialPositive},
		{"backoff max too small", func(c *processfx.SupervisedWorkerConfig) { c.BackoffMax = 50 * time.Millisecond }, processfx.ErrBackoffMaxTooSmall},
		{"backoff multiplier too low", func(c *processfx.SupervisedWorkerConfig) { c.BackoffMultiplier = 0.5 }, processfx.ErrBackoffMultiplierTooLow},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cfg := base
			tt.mutate(&cfg)
			err := cfg.Validate()

			if tt.wantErr == nil {
				if err != nil {
					t.Fatalf("expected nil error, got %v", err)
				}

				return
			}

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("expected %v, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestWorkerState_String(t *testing.T) {
	t.Parallel()

	tests := []struct {
		state processfx.WorkerState
		want  string
	}{
		{processfx.WorkerStateIdle, "idle"},
		{processfx.WorkerStateRunning, "running"},
		{processfx.WorkerStateStuck, "stuck"},
		{processfx.WorkerStateRestarting, "restarting"},
		{processfx.WorkerStateFailed, "failed"},
		{processfx.WorkerState(99), "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			t.Parallel()

			if got := tt.state.String(); got != tt.want {
				t.Errorf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestWorkerState_IsHealthy(t *testing.T) {
	t.Parallel()

	healthy := []processfx.WorkerState{processfx.WorkerStateIdle, processfx.WorkerStateRunning}
	unhealthy := []processfx.WorkerState{processfx.WorkerStateStuck, processfx.WorkerStateRestarting, processfx.WorkerStateFailed}

	for _, s := range healthy {
		if !s.IsHealthy() {
			t.Errorf("%v should be healthy", s)
		}
	}

	for _, s := range unhealthy {
		if s.IsHealthy() {
			t.Errorf("%v should not be healthy", s)
		}
	}
}

func TestWorkerStatus_Uptime_Zero(t *testing.T) {
	t.Parallel()

	s := processfx.WorkerStatus{}

	if d := s.Uptime(); d != 0 {
		t.Errorf("expected 0 for zero StartedAt, got %v", d)
	}
}

func TestWorkerStatus_Uptime_NonZero(t *testing.T) {
	t.Parallel()

	s := processfx.WorkerStatus{StartedAt: time.Now().Add(-100 * time.Millisecond)}

	if d := s.Uptime(); d <= 0 {
		t.Errorf("expected positive uptime, got %v", d)
	}
}

func TestWorkerStatus_TimeSinceLastHeartbeat_Zero(t *testing.T) {
	t.Parallel()

	s := processfx.WorkerStatus{}

	if d := s.TimeSinceLastHeartbeat(); d != 0 {
		t.Errorf("expected 0 for zero LastHeartbeat, got %v", d)
	}
}

func TestWorkerStatus_TimeSinceLastHeartbeat_NonZero(t *testing.T) {
	t.Parallel()

	s := processfx.WorkerStatus{LastHeartbeat: time.Now().Add(-50 * time.Millisecond)}

	if d := s.TimeSinceLastHeartbeat(); d <= 0 {
		t.Errorf("expected positive duration, got %v", d)
	}
}

// ---- supervisor ----

func TestNewSupervisor_NilMetrics(t *testing.T) {
	t.Parallel()

	cfg := processfx.DefaultSupervisedConfig("sup-nil")
	sup := processfx.NewSupervisor(cfg, nil, nil)

	if sup == nil {
		t.Fatal("expected non-nil Supervisor")
	}
}

func TestSupervisor_Name_IsHealthy(t *testing.T) {
	t.Parallel()

	cfg := processfx.DefaultSupervisedConfig("sup-x")
	sup := processfx.NewSupervisor(cfg, nil, nil)

	if sup.Name() != "sup-x" {
		t.Errorf("expected name sup-x, got %q", sup.Name())
	}

	if !sup.IsHealthy() {
		t.Error("idle supervisor should be healthy")
	}
}

func TestSupervisor_Status(t *testing.T) {
	t.Parallel()

	cfg := processfx.DefaultSupervisedConfig("status-w")
	sup := processfx.NewSupervisor(cfg, nil, nil)

	s := sup.Status()

	if s.Name != "status-w" {
		t.Errorf("expected name status-w, got %q", s.Name)
	}

	if s.State != processfx.WorkerStateIdle {
		t.Errorf("expected idle state, got %v", s.State)
	}
}

func TestSupervisor_Run_InvalidConfig(t *testing.T) {
	t.Parallel()

	cfg := processfx.SupervisedWorkerConfig{} // empty name → fails Validate
	sup := processfx.NewSupervisor(cfg, nil, nil)

	err := sup.Run(context.Background(), func(_ context.Context, _ processfx.HeartbeatSender) error {
		return nil
	})

	if err == nil {
		t.Fatal("expected error for invalid config, got nil")
	}
}

func TestSupervisor_Run_ContextCanceled(t *testing.T) {
	t.Parallel()

	cfg := processfx.SupervisedWorkerConfig{
		Name:              "beat-worker",
		HeartbeatTimeout:  200 * time.Millisecond,
		MaxRestarts:       5,
		BackoffInitial:    10 * time.Millisecond,
		BackoffMax:        50 * time.Millisecond,
		BackoffMultiplier: 1.5,
	}
	sup := processfx.NewSupervisor(cfg, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := sup.Run(ctx, func(workerCtx context.Context, hb processfx.HeartbeatSender) error {
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-workerCtx.Done():
				return workerCtx.Err()
			case <-ticker.C:
				hb.Beat(workerCtx)
			}
		}
	})

	if err == nil {
		t.Fatal("expected context error, got nil")
	}

	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, context.Canceled) {
		t.Errorf("expected context error, got %v", err)
	}
}

func TestSupervisor_Run_MaxRestartsExceeded(t *testing.T) {
	t.Parallel()

	cfg := processfx.SupervisedWorkerConfig{
		Name:              "stuck-worker",
		HeartbeatTimeout:  50 * time.Millisecond,
		MaxRestarts:       0,
		BackoffInitial:    1 * time.Millisecond,
		BackoffMax:        1 * time.Millisecond,
		BackoffMultiplier: 1.0,
	}
	sup := processfx.NewSupervisor(cfg, nil, nil)

	err := sup.Run(context.Background(), func(workerCtx context.Context, _ processfx.HeartbeatSender) error {
		<-workerCtx.Done()

		return workerCtx.Err()
	})

	if !errors.Is(err, processfx.ErrMaxRestartsExceeded) {
		t.Fatalf("expected ErrMaxRestartsExceeded, got %v", err)
	}
}
