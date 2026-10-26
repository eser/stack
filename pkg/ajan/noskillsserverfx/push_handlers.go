package noskillsserverfx

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/lib/netlib"
)

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

	// Push services are public HTTPS endpoints; anything else would let an
	// authenticated user aim the server's signed POSTs at internal addresses.
	if err := netlib.ValidateExternalURL(req.Endpoint, true); err != nil {
		return ctx.Results.BadRequest(httpfx.WithPlainText("invalid push endpoint"))
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

	msg, err := json.Marshal(map[string]string{
		"kind":    "test",
		"summary": "Push notifications are working!",
	})
	if err != nil {
		return ctx.Results.Error(http.StatusInternalServerError, httpfx.WithSanitizedError(err))
	}

	select {
	case s.push.queue <- pushJob{ctx: ctx.Request.Context(), sub: target, msg: msg}:
	default:
		return ctx.Results.Error(http.StatusServiceUnavailable, httpfx.WithPlainText("push queue full"))
	}

	return ctx.Results.JSON(map[string]bool{"ok": true})
}
