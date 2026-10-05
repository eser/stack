package noskillsserverfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/eser/stack/pkg/ajan/logfx"
)

const (
	pushQueueCap       = 256
	pushWorkerCount    = 4
	pushCoalescePeriod = time.Minute
	pushTTLSeconds     = 30
	pushSendTimeout    = 15 * time.Second
	pushSubscriber     = "mailto:noskills@local"
)

// ── VAPID key management ──────────────────────────────────────────────────────

var errVAPIDKeysIncomplete = errors.New("incomplete VAPID keys")

type vapidKeyPair struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

// loadOrGenerateVAPIDKeys loads an existing keypair from dataDir/push/vapid.json
// or, when there is no file yet, generates one. The file is written with 0600
// perms.
//
// A file that exists but cannot be read or parsed is an error, not a reason to
// generate: every stored subscription is bound to the keypair, so replacing it
// would silently stop every push.
func loadOrGenerateVAPIDKeys(dataDir string) (*vapidKeyPair, error) {
	path := filepath.Join(dataDir, "push", "vapid.json")

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("push dir: %w", err)
	}

	data, err := os.ReadFile(path) //nolint:gosec // path from pushDir helper, not user-supplied
	if err == nil {
		var kp vapidKeyPair
		if err := json.Unmarshal(data, &kp); err != nil {
			return nil, fmt.Errorf(
				"parse VAPID keys %s: %w (fix the JSON, or remove the file and re-subscribe every browser)",
				path, err,
			)
		}

		if kp.PublicKey == "" || kp.PrivateKey == "" {
			return nil, fmt.Errorf(
				"%w: VAPID keys %s lack publicKey or privateKey (remove the file and re-subscribe every browser)",
				errVAPIDKeysIncomplete, path,
			)
		}

		return &kp, nil
	}

	if !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("read VAPID keys %s: %w", path, err)
	}

	// GenerateVAPIDKeys returns (privateKey, publicKey, err).
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return nil, fmt.Errorf("generate VAPID keys: %w", err)
	}

	kp := &vapidKeyPair{PublicKey: pub, PrivateKey: priv}

	encoded, err := json.MarshalIndent(kp, "", "  ") //nolint:gosec // VAPID private key must be persisted to disk
	if err != nil {
		return nil, fmt.Errorf("encode VAPID keys: %w", err)
	}

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

	data, err := os.ReadFile(path) //nolint:gosec // path from pushDir helper, not user-supplied
	if errors.Is(err, fs.ErrNotExist) {
		return st, nil
	}

	if err != nil {
		return nil, fmt.Errorf("read push subscriptions %s: %w", path, err)
	}

	// A file that does not parse is an error rather than an empty store: the
	// next save would otherwise overwrite every subscription in it.
	if err := json.Unmarshal(data, &st.subs); err != nil {
		return nil, fmt.Errorf(
			"parse push subscriptions %s: %w (fix the JSON or remove the file to start empty)",
			path, err,
		)
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

// pushCoalescer allows one push per key per period.
//
// A key whose period has passed means the same as a key never seen, so allow
// removes those entries as it goes. The map then holds only the keys that
// pushed within the last period, instead of every (session, kind) pair the
// daemon has seen since it started.
type pushCoalescer struct {
	mu     sync.Mutex
	period time.Duration
	last   map[string]time.Time
}

// newPushCoalescer returns a coalescer that allows one push per key per
// pushCoalescePeriod.
func newPushCoalescer() *pushCoalescer {
	return &pushCoalescer{period: pushCoalescePeriod, last: make(map[string]time.Time)}
}

// allow reports whether key may push at now, and if so records now as its
// last push. now comes from the caller, so one operation reads the clock once.
func (c *pushCoalescer) allow(key string, now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	maps.DeleteFunc(c.last, func(_ string, last time.Time) bool {
		return now.Sub(last) >= c.period
	})

	if _, ok := c.last[key]; ok {
		return false
	}

	c.last[key] = now

	return true
}

// PushDispatcher sends Web Push notifications triggered by session events.
// A bounded pool of pushWorkerCount goroutines drains the queue so slow push
// endpoints never block the daemon's event pump.
type PushDispatcher struct {
	vapid    *vapidKeyPair
	store    *subscriptionStore
	queue    chan pushJob
	coalesce *pushCoalescer // key: "sid:kind"
	logger   *logfx.Logger

	// workers tracks the sender goroutines; wait blocks on it.
	workers sync.WaitGroup
}

// newPushDispatcher loads/generates VAPID keys, opens the subscription store,
// and starts background worker goroutines. Goroutines run until ctx is done;
// wait returns once they have.
func newPushDispatcher(ctx context.Context, dataDir string, logger *logfx.Logger) (*PushDispatcher, error) {
	vapid, err := loadOrGenerateVAPIDKeys(dataDir)
	if err != nil {
		return nil, fmt.Errorf("VAPID keys: %w", err)
	}

	store, err := openSubscriptionStore(dataDir)
	if err != nil {
		return nil, fmt.Errorf("subscription store: %w", err)
	}

	pd := &PushDispatcher{ //nolint:exhaustruct
		vapid:    vapid,
		store:    store,
		queue:    make(chan pushJob, pushQueueCap),
		coalesce: newPushCoalescer(),
		logger:   logger,
	}

	for range pushWorkerCount {
		pd.workers.Go(func() { pd.worker(ctx) })
	}

	return pd, nil
}

// wait blocks until every sender goroutine has returned. They return once the
// context given to newPushDispatcher has ended and any send in flight is done.
func (pd *PushDispatcher) wait() {
	pd.workers.Wait()
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
	// Jobs are queued, so the originating request may be gone by now: keep its
	// values but not its cancellation, and bound the send on its own.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(job.ctx), pushSendTimeout)
	defer cancel()

	resp, err := webpush.SendNotificationWithContext(ctx, job.msg, &webpush.Subscription{
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
		pd.logger.WarnContext(ctx, "push: send failed",
			"sub_id", job.sub.ID,
			"err", err,
		)

		return
	}
	defer func() { _ = resp.Body.Close() }()

	// 410 Gone or 404 → subscription expired; prune lazily.
	if resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusNotFound {
		if err := pd.store.remove(job.sub.ID); err != nil {
			pd.logger.WarnContext(ctx, "push: remove stale subscription", "id", job.sub.ID, "err", err)

			return
		}

		pd.logger.InfoContext(ctx, "push: removed stale subscription", "id", job.sub.ID, "status", resp.StatusCode)
	}
}

// MaybeTrigger inspects a worker event and fires push notifications when the
// event qualifies and the coalesce window allows it. ctx is the caller's
// context, which the session pump gives as the server's lifetime context; the
// queued notification carries its values (trace ids) but not its
// cancellation, and each send has its own timeout.
//
// Triggers:
//   - permission_request: push only when no WT client is currently attached.
//   - query_error: always push.
func (pd *PushDispatcher) MaybeTrigger(ctx context.Context, entry *SessionEntry, evt WorkerEvent) {
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

	pd.Dispatch(ctx, entry.SID, entry.Slug, kind, summary)
}

// Dispatch sends a push to all subscriptions matching sid, subject to coalescing
// (max 1 push per (sid, kind) per minute).
// Payload contains only non-sensitive metadata — no transcript content.
func (pd *PushDispatcher) Dispatch(ctx context.Context, sid, slug, kind, summary string) {
	if !pd.coalesce.allow(sid+":"+kind, time.Now()) {
		return
	}

	subs := pd.store.forSession(sid)
	if len(subs) == 0 {
		return
	}

	msg, err := json.Marshal(map[string]string{
		"kind":        kind,
		"sessionId":   sid,
		"projectSlug": slug,
		"summary":     summary,
	})
	if err != nil {
		pd.logger.WarnContext(ctx, "push: encode notification", "sid", sid, "kind", kind, "err", err)

		return
	}

	for _, sub := range subs {
		select {
		case pd.queue <- pushJob{ctx: ctx, sub: sub, msg: msg}:
		default:
			pd.logger.WarnContext(ctx, "push: queue full, dropping notification", "sid", sid, "kind", kind)
		}
	}
}

// VAPIDPublicKey returns the base64url-encoded public key for browser clients.
func (pd *PushDispatcher) VAPIDPublicKey() string {
	return pd.vapid.PublicKey
}
