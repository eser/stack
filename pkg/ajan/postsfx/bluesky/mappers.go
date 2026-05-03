// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky

import (
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/postsfx"
)

// mapPost converts a Bluesky apiPostView to the domain Post type.
func mapPost(v *apiPostView) *postsfx.Post {
	post := &postsfx.Post{
		ID:           postsfx.PostID(v.URI),
		Text:         v.Record.Text,
		AuthorHandle: postsfx.Handle(v.Author.Handle),
		Platform:     postsfx.PlatformBluesky,
		PlatformRef: map[string]string{
			"uri": v.URI,
			"cid": v.CID,
		},
	}

	if v.Record.CreatedAt != "" {
		if ts, err := time.Parse(time.RFC3339, v.Record.CreatedAt); err == nil {
			post.CreatedAt = ts
		}
	} else if v.IndexedAt != "" {
		if ts, err := time.Parse(time.RFC3339, v.IndexedAt); err == nil {
			post.CreatedAt = ts
		}
	}

	return post
}

// mapUser converts a Bluesky apiProfile to the domain User type.
func mapUser(p *apiProfile) *postsfx.User {
	return &postsfx.User{
		ID:               p.DID,
		Handle:           postsfx.Handle(p.Handle),
		DisplayName:      p.DisplayName,
		Platform:         postsfx.PlatformBluesky,
		SubscriptionTier: postsfx.SubscriptionFree, // no billing API
	}
}

// rkeyFromURI extracts the rkey from an AT URI (at://did/collection/rkey).
// Returns empty string if the URI does not have the expected format.
func rkeyFromURI(uri string) string {
	parts := strings.Split(uri, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}

	return ""
}

// flattenThread recursively collects all posts in a thread view into a flat slice.
func flattenThread(view apiThreadView) []*postsfx.Post {
	var posts []*postsfx.Post //nolint:prealloc // recursive tree traversal; size unknown
	posts = append(posts, mapPost(&view.Post))

	for _, reply := range view.Replies {
		posts = append(posts, flattenThread(reply)...)
	}

	return posts
}
