package noskillsserverfx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

const (
	pushQueueCap       = 256
	pushWorkerCount    = 4
	pushCoalescePeriod = time.Minute
	pushTTLSeconds     = 30
	pushSubscriber     = "mailto:noskills@local"
)

// ── VAPID key management ──────────────────────────────────────────────────────

type vapidKeyPair struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

// loadOrGenerateVAPIDKeys loads an existing keypair from dataDir/push/vapid.json
// or generates a new one. The file is written with 0600 perms.
func loadOrGenerateVAPIDKeys(dataDir string) (*vapidKeyPair, error) {
	path := filepath.Join(dataDir, "push", "vapid.json")

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("push dir: %w", err)
	}

	if data, err := os.ReadFile(path); err == nil { //nolint:gosec // path from pushDir helper, not user-supplied
		var kp vapidKeyPair
		if json.Unmarshal(data, &kp) == nil && kp.PublicKey != "" {
			return &kp, nil
		}
	}

	// GenerateVAPIDKeys returns (privateKey, publicKey, err).
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return nil, fmt.Errorf("generate VAPID keys: %w", err)
	}

	kp := &vapidKeyPair{PublicKey: pub, PrivateKey: priv}

	encoded, _ := json.MarshalIndent(kp, "", "  ") //nolint:gosec // VAPID private key must be persisted to disk
	if err := os.WriteFile(path, encoded, 0o600); err != nil {
		return nil, fmt.Errorf("save VAPID keys: %w", err)
	}

	return kp, nil
}

// ── Subscription store ────────────────────────────────────────────────────────

type pushKeys struct {
	Auth   string `json:"auth"`
	P256dh string `json:"p256dh"`
}

type pushSubscription struct {
	ID             string    `json:"id"`
	Endpoint       string    `json:"endpoint"`
	Keys           pushKeys  `json:"keys"`
	SessionFilters []string  `json:"sessionFilters,omitempty"`
	AlertOnErrors  bool      `json:"alertOnErrors,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
	LastSeen       time.Time `json:"lastSeen,omitempty"`
}

type subscriptionStore struct {
	mu   sync.Mutex
	path string
	subs []*pushSubscription
}

func openSubscriptionStore(dataDir string) (*subscriptionStore, error) {
	path := filepath.Join(dataDir, "push", "subscriptions.json")

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("push dir: %w", err)
	}

	st := &subscriptionStore{path: path, subs: make([]*pushSubscription, 0)}

	if data, err := os.ReadFile(path); err == nil { //nolint:gosec // path from pushDir helper, not user-supplied
		_ = json.Unmarshal(data, &st.subs)
	}

	return st, nil
}

func (st *subscriptionStore) add(sub *pushSubscription) error {
	st.mu.Lock()
	defer st.mu.Unlock()

	st.subs = append(st.subs, sub)

	return st.save()
}

func (st *subscriptionStore) remove(id string) error {
	st.mu.Lock()
	defer st.mu.Unlock()

	kept := st.subs[:0]
	for _, s := range st.subs {
		if s.ID != id {
			kept = append(kept, s)
		}
	}

	st.subs = kept

	return st.save()
}

// forSession returns subscriptions matching sid (or with no session filter).
func (st *subscriptionStore) forSession(sid string) []*pushSubscription {
	st.mu.Lock()
	defer st.mu.Unlock()

	var result []*pushSubscription

	for _, s := range st.subs {
		if len(s.SessionFilters) == 0 {
			result = append(result, s)

			continue
		}

		for _, f := range s.SessionFilters {
			if f == sid {
				result = append(result, s)

				break
			}
		}
	}

	return result
}

func (st *subscriptionStore) save() error {
	data, err := json.MarshalIndent(st.subs, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal subscriptions: %w", err)
	}

	tmp := st.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write subscriptions: %w", err)
	}

	return os.Rename(tmp, st.path)
}

// ── PushDispatcher ────────────────────────────────────────────────────────────

type pushJob struct {
	ctx context.Context
	sub *pushSubscription
	msg []byte
}

// PushDispatcher sends Web Push notifications triggered by session events.
// A bounded pool of pushWorkerCount goroutines drains the queue so slow push
// endpoints never block the daemon's event pump.
type PushDispatcher struct {
	mu       sync.Mutex
	vapid    *vapidKeyPair
	store    *subscriptionStore
	queue    chan pushJob
	coalesce map[string]time.Time // key: "sid:kind"
	logger   *logfx.Logger
}

// newPushDispatcher loads/generates VAPID keys, opens the subscription store,
// and starts background worker goroutines. Goroutines run until ctx is done.
func newPushDispatcher(ctx context.Context, dataDir string, logger *logfx.Logger) (*PushDispatcher, error) {
	vapid, err := loadOrGenerateVAPIDKeys(dataDir)
	if err != nil {
		return nil, fmt.Errorf("VAPID keys: %w", err)
	}

	store, err := openSubscriptionStore(dataDir)
	if err != nil {
		return nil, fmt.Errorf("subscription store: %w", err)
	}

	pd := &PushDispatcher{
		vapid:    vapid,
		store:    store,
		queue:    make(chan pushJob, pushQueueCap),
		coalesce: make(map[string]time.Time),
		logger:   logger,
	}

	for range pushWorkerCount {
		go pd.worker(ctx)
	}

	return pd, nil
}

func (pd *PushDispatcher) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-pd.queue:
			if !ok {
				return
			}

			pd.sendOne(job)
		}
	}
}

func (pd *PushDispatcher) sendOne(job pushJob) {
	resp, err := webpush.SendNotificationWithContext(job.ctx, job.msg, &webpush.Subscription{
		Endpoint: job.sub.Endpoint,
		Keys: webpush.Keys{
			Auth:   job.sub.Keys.Auth,
			P256dh: job.sub.Keys.P256dh,
		},
	}, &webpush.Options{ //nolint:exhaustruct
		Subscriber:      pushSubscriber,
		VAPIDPublicKey:  pd.vapid.PublicKey,
		VAPIDPrivateKey: pd.vapid.PrivateKey,
		TTL:             pushTTLSeconds,
	})
	if err != nil {
		pd.logger.Warn("push: send failed",
			"sub_id", job.sub.ID,
			"err", err,
		)

		return
	}
	defer func() { _ = resp.Body.Close() }()

	// 410 Gone or 404 → subscription expired; prune lazily.
	if resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusNotFound {
		_ = pd.store.remove(job.sub.ID)
		pd.logger.Info("push: removed stale subscription", "id", job.sub.ID, "status", resp.StatusCode)
	}
}

// MaybeTrigger inspects a worker event and fires push notifications when the
// event qualifies and the coalesce window allows it.
//
// Triggers:
//   - permission_request: push only when no WT client is currently attached.
//   - query_error: always push.
func (pd *PushDispatcher) MaybeTrigger(entry *SessionEntry, evt WorkerEvent) {
	var kind, summary string

	switch evt.Type {
	case "permission_request":
		if entry.Broadcaster.ClientCount() > 0 {
			return // a live client is watching — no push needed
		}

		kind = "permission_request"
		summary = "Permission request"
	case "query_error":
		kind = "error"
		summary = "Claude encountered an error"
	default:
		return
	}

	pd.Dispatch(context.Background(), entry.SID, entry.Slug, kind, summary)
}

// Dispatch sends a push to all subscriptions matching sid, subject to coalescing
// (max 1 push per (sid, kind) per minute).
// Payload contains only non-sensitive metadata — no transcript content.
func (pd *PushDispatcher) Dispatch(ctx context.Context, sid, slug, kind, summary string) {
	coalKey := sid + ":" + kind

	pd.mu.Lock()
	if last, ok := pd.coalesce[coalKey]; ok && time.Since(last) < pushCoalescePeriod {
		pd.mu.Unlock()

		return
	}

	pd.coalesce[coalKey] = time.Now()
	pd.mu.Unlock()

	subs := pd.store.forSession(sid)
	if len(subs) == 0 {
		return
	}

	msg, _ := json.Marshal(map[string]string{
		"kind":        kind,
		"sessionId":   sid,
		"projectSlug": slug,
		"summary":     summary,
	})

	for _, sub := range subs {
		select {
		case pd.queue <- pushJob{ctx: ctx, sub: sub, msg: msg}:
		default:
			pd.logger.Warn("push: queue full, dropping notification", "sid", sid, "kind", kind)
		}
	}
}

// VAPIDPublicKey returns the base64url-encoded public key for browser clients.
func (pd *PushDispatcher) VAPIDPublicKey() string {
	return pd.vapid.PublicKey
}

// ── Push REST handlers ────────────────────────────────────────────────────────

type vapidKeyResponse struct {
	PublicKey string `json:"publicKey"`
}

func (s *Server) handleVAPIDPublicKey(ctx *httpfx.Context) httpfx.Result {
	if s.push == nil {
		return ctx.Results.Error(http.StatusServiceUnavailable, httpfx.WithPlainText("push not configured"))
	}

	return ctx.Results.JSON(&vapidKeyResponse{PublicKey: s.push.VAPIDPublicKey()})
}

type subscribeRequest struct {
	Endpoint       string   `json:"endpoint"`
	Keys           pushKeys `json:"keys"`
	SessionFilters []string `json:"sessionFilters,omitempty"`
	AlertOnErrors  bool     `json:"alertOnErrors,omitempty"`
}

type subscribeResponse struct {
	SubscriptionID string `json:"subscriptionId"`
}

func (s *Server) handleSubscribe(ctx *httpfx.Context) httpfx.Result {
	if s.push == nil {
		return ctx.Results.Error(http.StatusServiceUnavailable, httpfx.WithPlainText("push not configured"))
	}

	var req subscribeRequest
	if err := ctx.ParseJSONBody(&req); err != nil {
		return ctx.Results.BadRequest(httpfx.WithPlainText("invalid JSON body"))
	}

	if req.Endpoint == "" || req.Keys.Auth == "" || req.Keys.P256dh == "" {
		return ctx.Results.BadRequest(httpfx.WithPlainText("endpoint, keys.auth, and keys.p256dh are required"))
	}

	sub := &pushSubscription{
		ID:             newSessionID(),
		Endpoint:       req.Endpoint,
		Keys:           req.Keys,
		SessionFilters: req.SessionFilters,
		AlertOnErrors:  req.AlertOnErrors,
		CreatedAt:      time.Now(),
	}

	if err := s.push.store.add(sub); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError, httpfx.WithSanitizedError(err))
	}

	return ctx.Results.JSON(&subscribeResponse{SubscriptionID: sub.ID})
}

func (s *Server) handleUnsubscribe(ctx *httpfx.Context) httpfx.Result {
	if s.push == nil {
		return ctx.Results.Error(http.StatusServiceUnavailable, httpfx.WithPlainText("push not configured"))
	}

	id := ctx.Request.PathValue("id")
	if id == "" {
		return ctx.Results.BadRequest(httpfx.WithPlainText("subscription id required"))
	}

	if err := s.push.store.remove(id); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError, httpfx.WithSanitizedError(err))
	}

	return ctx.Results.JSON(map[string]bool{"ok": true})
}

type testPushRequest struct {
	SubscriptionID string `json:"subscriptionId"`
}

func (s *Server) handleTestPush(ctx *httpfx.Context) httpfx.Result {
	if s.push == nil {
		return ctx.Results.Error(http.StatusServiceUnavailable, httpfx.WithPlainText("push not configured"))
	}

	var req testPushRequest
	if err := ctx.ParseJSONBody(&req); err != nil {
		return ctx.Results.BadRequest(httpfx.WithPlainText("invalid JSON body"))
	}

	s.push.store.mu.Lock()

	var target *pushSubscription

	for _, sub := range s.push.store.subs {
		if sub.ID == req.SubscriptionID {
			target = sub

			break
		}
	}

	s.push.store.mu.Unlock()

	if target == nil {
		return ctx.Results.Error(http.StatusNotFound, httpfx.WithPlainText("subscription not found"))
	}

	msg, _ := json.Marshal(map[string]string{
		"kind":    "test",
		"summary": "Push notifications are working!",
	})

	select {
	case s.push.queue <- pushJob{ctx: ctx.Request.Context(), sub: target, msg: msg}:
	default:
		return ctx.Results.Error(http.StatusServiceUnavailable, httpfx.WithPlainText("push queue full"))
	}

	return ctx.Results.JSON(map[string]bool{"ok": true})
}
