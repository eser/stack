// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter

import (
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// mapPost converts a Twitter API tweet to the domain Post type.
// userByID is the includes.users map indexed by ID for author enrichment.
func mapPost(t *apiTweet, userByID map[string]*apiUser) *postsfx.Post {
	post := &postsfx.Post{
		ID:       postsfx.PostID(t.ID),
		Text:     t.Text,
		Platform: postsfx.PlatformTwitter,
	}

	if t.AuthorID != "" {
		if u, ok := userByID[t.AuthorID]; ok {
			post.AuthorHandle = postsfx.Handle(u.Username)
		}
	}

	if t.CreatedAt != "" {
		if ts, err := time.Parse(time.RFC3339, t.CreatedAt); err == nil {
			post.CreatedAt = ts
		}
	}

	if t.ConversationID != "" && t.ConversationID != t.ID {
		cid := postsfx.PostID(t.ConversationID)
		post.ConversationID = &cid
	}

	for _, ref := range t.ReferencedTweets {
		post.ReferencedPosts = append(post.ReferencedPosts, postsfx.ReferencedPost{
			Type: mapRefType(ref.Type),
			ID:   postsfx.PostID(ref.ID),
		})

		if ref.Type == "replied_to" {
			pid := postsfx.PostID(ref.ID)
			post.InReplyToID = &pid
		}
	}

	return post
}

// mapUser converts a Twitter API user to the domain User type.
func mapUser(u *apiUser) *postsfx.User {
	return &postsfx.User{
		ID:               u.ID,
		Handle:           postsfx.Handle(u.Username),
		DisplayName:      u.Name,
		Platform:         postsfx.PlatformTwitter,
		SubscriptionTier: mapSubscription(u.SubscriptionType),
	}
}

func mapRefType(t string) postsfx.ReferencedPostType {
	switch t {
	case "replied_to":
		return postsfx.ReferencedPostRepliedTo
	case "quoted":
		return postsfx.ReferencedPostQuoted
	case "retweeted":
		return postsfx.ReferencedPostReposted
	default:
		return postsfx.ReferencedPostType(t)
	}
}

func mapSubscription(s string) postsfx.SubscriptionTier {
	switch s {
	case "premium":
		return postsfx.SubscriptionPremium
	case "premium_plus":
		return postsfx.SubscriptionPremiumPlus
	case "business":
		return postsfx.SubscriptionBusiness
	default:
		return postsfx.SubscriptionFree
	}
}

// buildUserIndex creates an id→user map from the includes list.
func buildUserIndex(users []apiUser) map[string]*apiUser {
	m := make(map[string]*apiUser, len(users))
	for i := range users {
		m[users[i].ID] = &users[i]
	}

	return m
}
