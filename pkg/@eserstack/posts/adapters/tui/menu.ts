// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TuiMenu — multi-platform terminal UI adapter.
 * Drives InboundPostService + per-platform AuthProviders.
 * Uses @eserstack/shell/tui for prompts and @eserstack/streams/span for output.
 * Never touches Deno or Node APIs directly.
 */

import * as primitiveResults from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import type { OAuthTokens } from "../../domain/entities/user.ts";
import type { Platform } from "../../domain/values/platform.ts";
import type { AuthProvider } from "../../application/auth-provider.ts";
import type { TokenStore } from "../../application/token-store.ts";
import * as appErrors from "../../application/thread-post-error.ts";
import * as fanOutErrors from "../../application/fan-out-partial-error.ts";
import type { TuiTriggers } from "./triggers.ts";
import * as tui from "@eserstack/shell/tui";
import * as span from "@eserstack/streams/span";
import * as callbackServer from "./callback-server.ts";
import * as costs from "./costs.ts";

type MenuAction =
  | "login"
  | "logout"
  | "account"
  | "compose"
  | "reply"
  | "thread"
  | "repost"
  | "quote"
  | "undo_repost"
  | "search"
  | "view_bookmarks"
  | "bookmark"
  | "remove_bookmark"
  | "timeline"
  | "translate_post"
  | "usage"
  | "schedule"
  | "exit";

/** Terminal UI adapter — multi-platform auth-aware menu loop. */
export class TuiMenu {
  private readonly ctx: tui.TuiContext;
  private readonly triggers: TuiTriggers;
  private readonly auths: Map<Platform, AuthProvider>;
  private readonly twitterRedirectUri: string;
  private readonly tokenStore: TokenStore | undefined;
  private readonly tokens: Map<Platform, OAuthTokens>;

  constructor(
    triggers: TuiTriggers,
    auths: Map<Platform, AuthProvider>,
    twitterRedirectUri: string,
    tokenStore?: TokenStore,
    ctx?: tui.TuiContext,
  ) {
    this.triggers = triggers;
    this.auths = auths;
    this.twitterRedirectUri = twitterRedirectUri;
    this.tokenStore = tokenStore;
    this.tokens = new Map();
    this.ctx = ctx ?? tui.createTuiContext();
  }

  /** Start the interactive menu loop. */
  async run(): Promise<void> {
    tui.intro(
      this.ctx,
      "posts — manage your social presence from the terminal",
    );

    await this.restoreSavedTokens();

    let running = true;
    while (running) {
      const anyLoggedIn = this.tokens.size > 0;

      const action = await tui.select<MenuAction>(this.ctx, {
        message: "What would you like to do?",
        options: [
          {
            value: "login",
            label: anyLoggedIn ? "Login / Re-authenticate" : "Login",
          },
          ...(anyLoggedIn
            ? [{ value: "logout" as const, label: "Logout" }]
            : []),
          { value: "account", label: "Account status" },
          { value: "compose", label: "Post" },
          { value: "reply", label: "Reply to a post" },
          { value: "thread", label: "Post a thread" },
          { value: "repost", label: "Repost" },
          { value: "quote", label: "Quote post" },
          { value: "undo_repost", label: "Undo repost" },
          { value: "search", label: "Search posts" },
          { value: "view_bookmarks", label: "View bookmarks" },
          { value: "bookmark", label: "Bookmark a post" },
          { value: "remove_bookmark", label: "Remove bookmark" },
          { value: "timeline", label: "View unified timeline" },
          { value: "translate_post", label: "Translate & post" },
          { value: "usage", label: "Usage & costs" },
          { value: "schedule", label: "Schedule a post" },
          { value: "exit", label: "Exit" },
        ],
      });

      if (tui.isCancel(action)) {
        running = false;
        break;
      }

      switch (action) {
        case "login":
          await this.loginFlow();
          break;
        case "logout":
          await this.logoutFlow();
          break;
        case "account":
          this.accountFlow();
          break;
        case "compose":
          await this.composeFlow();
          break;
        case "reply":
          await this.replyFlow();
          break;
        case "thread":
          await this.threadFlow();
          break;
        case "repost":
          await this.repostFlow();
          break;
        case "quote":
          await this.quoteFlow();
          break;
        case "undo_repost":
          await this.undoRepostFlow();
          break;
        case "search":
          await this.searchFlow();
          break;
        case "view_bookmarks":
          await this.viewBookmarksFlow();
          break;
        case "bookmark":
          await this.bookmarkFlow();
          break;
        case "remove_bookmark":
          await this.removeBookmarkFlow();
          break;
        case "timeline":
          await this.timelineFlow();
          break;
        case "translate_post":
          await this.translateFlow();
          break;
        case "usage":
          await this.usageFlow();
          break;
        case "schedule":
          this.scheduleFlow();
          break;
        case "exit":
          running = false;
          break;
      }
    }

    tui.outro(this.ctx, "Goodbye!");
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async restoreSavedTokens(): Promise<void> {
    if (this.tokenStore === undefined) return;
    const restored: Platform[] = [];
    for (const [platform, auth] of this.auths) {
      try {
        const saved = await this.tokenStore.load(platform);
        if (saved !== null) {
          auth.setTokens(saved);
          if (auth.isAuthenticated()) {
            this.tokens.set(platform, saved);
            restored.push(platform);
          }
        }
      } catch (err) {
        tui.log.warn(
          this.ctx,
          `Could not load saved ${costs.PLATFORM_LABELS[platform]} tokens: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    if (restored.length > 0) {
      tui.log.info(
        this.ctx,
        `Session restored for: ${
          restored.map((p) => costs.PLATFORM_LABELS[p]).join(", ")
        }`,
      );
    }
  }

  /** Prompt the user to choose a platform from those available. */
  private async choosePlatform(message: string): Promise<Platform | null> {
    const options = Array.from(this.auths.keys()).map((p) => ({
      value: p,
      label: costs.PLATFORM_LABELS[p],
    }));
    if (options.length === 1 && options[0] !== undefined) {
      return options[0].value;
    }
    const choice = await tui.select<Platform>(this.ctx, { message, options });
    if (tui.isCancel(choice)) return null;
    return choice;
  }

  /** Prompt for platform from only authenticated platforms. */
  private async chooseAuthenticatedPlatform(
    message: string,
  ): Promise<Platform | null> {
    const options = Array.from(this.tokens.keys()).map((p) => ({
      value: p,
      label: costs.PLATFORM_LABELS[p],
    }));
    if (options.length === 0) {
      tui.log.warn(this.ctx, "You must be logged in. Choose 'Login' first.");
      return null;
    }
    if (options.length === 1 && options[0] !== undefined) {
      return options[0].value;
    }
    const choice = await tui.select<Platform>(this.ctx, { message, options });
    if (tui.isCancel(choice)) return null;
    return choice;
  }

  // ── Login flow ─────────────────────────────────────────────────────────────

  private async loginFlow(): Promise<void> {
    const platform = await this.choosePlatform("Login to which platform?");
    if (platform === null) return;

    const auth = this.auths.get(platform);
    if (auth === undefined) return;

    if (auth.requiresBrowser) {
      await this.browserLoginFlow(platform, auth);
    } else {
      await this.credentialLoginFlow(platform, auth);
    }
  }

  private async browserLoginFlow(
    platform: Platform,
    auth: AuthProvider,
  ): Promise<void> {
    const { url, codeVerifier } = await auth.getAuthorizationUrl();

    tui.log.info(this.ctx, "Open this URL in your browser to authorize:");
    this.ctx.output.writeln(span.text(""));
    this.ctx.output.writeln(span.cyan(`  ${url}`));
    this.ctx.output.writeln(span.text(""));

    let code: string;
    try {
      const redirectUrl = new URL(this.twitterRedirectUri);
      const port = redirectUrl.port !== ""
        ? parseInt(redirectUrl.port, 10)
        : 80;
      tui.log.info(this.ctx, `Waiting for callback on port ${port}…`);
      const result = await callbackServer.waitForOAuthCallback(port);
      code = result.code;
    } catch {
      const result = await callbackServer.manualCodeEntry(this.ctx);
      code = result.code;
    }

    try {
      const newTokens = await auth.exchangeCode({ code, codeVerifier });
      this.tokens.set(platform, newTokens);
      tui.log.success(
        this.ctx,
        `Logged in to ${costs.PLATFORM_LABELS[platform]} successfully!`,
      );
      await this.saveTokens(platform, newTokens);
    } catch (err) {
      tui.log.error(
        this.ctx,
        `Login failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async credentialLoginFlow(
    platform: Platform,
    auth: AuthProvider,
  ): Promise<void> {
    tui.log.info(this.ctx, `Log in to ${costs.PLATFORM_LABELS[platform]}`);

    const identifier = await tui.text(this.ctx, {
      message: "Handle (e.g. you.bsky.social)",
      placeholder: "handle.bsky.social",
      validate: (
        v,
      ) => (v.trim().length === 0 ? "Handle cannot be empty." : undefined),
    });
    if (tui.isCancel(identifier)) return;

    const password = await tui.text(this.ctx, {
      message:
        "App password (from Settings → App passwords — NOT your main password)",
      placeholder: "xxxx-xxxx-xxxx-xxxx",
      validate: (
        v,
      ) => (v.trim().length === 0 ? "Password cannot be empty." : undefined),
    });
    if (tui.isCancel(password)) return;

    try {
      const newTokens = await auth.loginWithCredentials({
        identifier: identifier.trim(),
        password: password.trim(),
      });
      this.tokens.set(platform, newTokens);
      tui.log.success(
        this.ctx,
        `Logged in to ${costs.PLATFORM_LABELS[platform]} successfully!`,
      );
      await this.saveTokens(platform, newTokens);
    } catch (err) {
      tui.log.error(
        this.ctx,
        `Login failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async saveTokens(
    platform: Platform,
    tokens: OAuthTokens,
  ): Promise<void> {
    if (this.tokenStore === undefined) return;
    try {
      await this.tokenStore.save(platform, tokens);
      tui.log.info(
        this.ctx,
        "Session saved — you won't need to log in next time.",
      );
    } catch (err) {
      tui.log.warn(
        this.ctx,
        `Could not save tokens: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ── Logout flow ────────────────────────────────────────────────────────────

  private async logoutFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Logout from which platform?",
    );
    if (platform === null) return;

    const auth = this.auths.get(platform);
    if (auth !== undefined) auth.clearTokens();
    this.tokens.delete(platform);

    if (this.tokenStore !== undefined) {
      try {
        await this.tokenStore.clear(platform);
      } catch (err) {
        tui.log.warn(
          this.ctx,
          `Could not clear saved tokens: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    tui.log.success(
      this.ctx,
      `Logged out of ${costs.PLATFORM_LABELS[platform]}.`,
    );
  }

  // ── Account flow ───────────────────────────────────────────────────────────

  private accountFlow(): void {
    tui.gap(this.ctx);
    for (const [platform, auth] of this.auths) {
      const tokens = this.tokens.get(platform);
      const label = costs.PLATFORM_LABELS[platform];

      if (!auth.isAuthenticated() || tokens === undefined) {
        this.ctx.output.writeln(
          span.bold(label),
          span.text("  "),
          span.dim("Not connected"),
        );
        continue;
      }

      this.ctx.output.writeln(
        span.bold(label),
        span.text("  "),
        span.green("Logged in"),
      );

      if (tokens.expiresAt !== undefined) {
        const expired = tokens.expiresAt < new Date();
        this.ctx.output.writeln(
          span.dim("  Token expires: "),
          expired
            ? span.red(tokens.expiresAt.toLocaleString())
            : span.text(tokens.expiresAt.toLocaleString()),
        );
      }
      if (tokens.refreshToken !== undefined) {
        this.ctx.output.writeln(span.dim("  Refresh token: present"));
      }
      if (tokens.platformData?.["did"] !== undefined) {
        this.ctx.output.writeln(
          span.dim("  DID: "),
          span.text(tokens.platformData["did"]),
        );
      }
    }
    if (this.tokenStore !== undefined) {
      this.ctx.output.writeln(span.dim("  Persistence: enabled"));
    }
    tui.gap(this.ctx);
  }

  // ── Compose flow ───────────────────────────────────────────────────────────

  private async composeFlow(): Promise<void> {
    if (this.tokens.size === 0) {
      tui.log.warn(this.ctx, "You must be logged in. Choose 'Login' first.");
      return;
    }

    type PostTarget = Platform | "all";
    const platformOptions = Array.from(this.tokens.keys()).map((p) => ({
      value: p as PostTarget,
      label: costs.PLATFORM_LABELS[p],
    }));
    const options = this.tokens.size > 1
      ? [...platformOptions, {
        value: "all" as const,
        label: "Both (cross-post)",
      }]
      : platformOptions;

    let target: PostTarget | null = null;
    if (options.length === 1 && options[0] !== undefined) {
      target = options[0].value;
    } else {
      const choice = await tui.select<PostTarget>(this.ctx, {
        message: "Post to which platform?",
        options,
      });
      if (tui.isCancel(choice)) return;
      target = choice;
    }

    const charLimit = target === "all"
      ? Math.min(
        ...Array.from(this.tokens.keys()).map((p) =>
          costs.PLATFORM_CHAR_LIMITS[p]
        ),
      )
      : costs.PLATFORM_CHAR_LIMITS[target];

    const content = await tui.text(this.ctx, {
      message: `Post text (max ${charLimit} chars)`,
      placeholder: "What's on your mind?",
      validate: (value) => {
        if (value.trim().length === 0) return "Post cannot be empty.";
        if (value.length > charLimit) {
          return `Post cannot exceed ${charLimit} characters.`;
        }
        return undefined;
      },
    });
    if (tui.isCancel(content)) return;

    if (target === "all") {
      const result = await task.runTask(
        this.triggers.composePostToAll({ rawText: content }),
      );
      primitiveResults.match(result, {
        ok: (posts) => {
          for (const post of posts) {
            tui.log.success(
              this.ctx,
              `Posted to ${
                costs.PLATFORM_LABELS[post.platform]
              }! ID: ${post.id}`,
            );
          }
        },
        fail: (error) => {
          if (error instanceof fanOutErrors.FanOutPartialError) {
            for (const post of error.posted) {
              tui.log.success(
                this.ctx,
                `  ✓ ${costs.PLATFORM_LABELS[post.platform]}: ${post.id}`,
              );
            }
            for (const f of error.failed) {
              tui.log.error(
                this.ctx,
                `  ✗ ${costs.PLATFORM_LABELS[f.platform]}: ${f.error.message}`,
              );
            }
          } else if (error instanceof Error) {
            tui.log.error(this.ctx, `Failed to post: ${error.message}`);
          } else {
            tui.log.warn(this.ctx, error.message);
          }
        },
      });
    } else {
      const result = await task.runTask(
        this.triggers.composeTweet({ rawText: content, platform: target }),
      );
      primitiveResults.match(result, {
        ok: (post) => {
          tui.log.success(this.ctx, `Posted! ID: ${post.id}`);
        },
        fail: (error) => {
          if (error instanceof Error) {
            tui.log.error(this.ctx, `Failed to post: ${error.message}`);
          } else {
            tui.log.warn(this.ctx, error.message);
          }
        },
      });
    }
  }

  // ── Timeline flow ──────────────────────────────────────────────────────────

  private async timelineFlow(): Promise<void> {
    if (this.tokens.size === 0) {
      tui.log.warn(this.ctx, "You must be logged in. Choose 'Login' first.");
      return;
    }

    const result = await task.runTask(
      this.triggers.getUnifiedTimeline({ maxResults: 10 }),
    );
    primitiveResults.match(result, {
      ok: (posts) => {
        if (posts.length === 0) {
          tui.log.info(this.ctx, "No posts found.");
          return;
        }
        tui.gap(this.ctx);
        for (const post of posts) {
          const badge = costs.PLATFORM_BADGES[post.platform];
          this.ctx.output.writeln(
            post.platform === "twitter" ? span.cyan(badge) : span.text(badge),
            span.text(" "),
            span.bold(`@${post.authorHandle}`),
            span.text("  "),
            span.dim(post.createdAt.toLocaleDateString()),
          );
          this.ctx.output.writeln(span.text(`  ${post.text}`));
          this.ctx.output.writeln(
            span.dim("  ─────────────────────────────────────"),
          );
        }
        tui.gap(this.ctx);
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to load timeline: ${error.message}`);
      },
    });
  }

  // ── Translate & post flow ──────────────────────────────────────────────────

  private async translateFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Translate & post to which platform?",
    );
    if (platform === null) return;

    const content = await tui.text(this.ctx, {
      message: "Text to translate",
      placeholder: "Enter text in source language",
    });
    if (tui.isCancel(content)) return;

    const from = await tui.text(this.ctx, {
      message: "Source language (BCP 47, e.g. tr)",
      initialValue: "tr",
    });
    if (tui.isCancel(from)) return;

    const to = await tui.text(this.ctx, {
      message: "Target language (BCP 47, e.g. en)",
      initialValue: "en",
    });
    if (tui.isCancel(to)) return;

    const result = await task.runTask(
      this.triggers.translateAndPost({ rawText: content, from, to, platform }),
    );
    primitiveResults.match(result, {
      ok: (post) => {
        tui.log.success(this.ctx, `Translated and posted! ID: ${post.id}`);
      },
      fail: (error) => {
        if (error instanceof Error) {
          tui.log.error(this.ctx, `Failed: ${error.message}`);
        } else {
          tui.log.warn(this.ctx, error.message);
        }
      },
    });
  }

  // ── Reply flow ─────────────────────────────────────────────────────────────

  private async replyFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Reply to a post on which platform?",
    );
    if (platform === null) return;

    const rawId = await tui.text(this.ctx, {
      message: "Post ID to reply to",
      placeholder: platform === "twitter"
        ? "1234567890"
        : "at://did:plc:.../...",
      validate: (value) => {
        if (value.trim().length === 0) return "Post ID cannot be empty.";
        return undefined;
      },
    });
    if (tui.isCancel(rawId)) return;

    const postIdStr = rawId.trim();
    const originalResult = await task.runTask(
      this.triggers.getPost({ postId: postIdStr, platform }),
    );
    if (primitiveResults.isFail(originalResult)) {
      const err = originalResult.error;
      if (err instanceof Error) {
        tui.log.error(this.ctx, `Failed to fetch post: ${err.message}`);
      } else {
        tui.log.warn(this.ctx, err.message);
      }
      return;
    }
    const original = originalResult.value;

    tui.gap(this.ctx);
    const badge = costs.PLATFORM_BADGES[platform];
    this.ctx.output.writeln(span.dim("  Replying to:"));
    this.ctx.output.writeln(
      span.dim(`  ${badge} `),
      span.bold(`@${original.authorHandle}`),
      span.text("  "),
      span.dim(original.createdAt.toLocaleDateString()),
    );
    this.ctx.output.writeln(span.text(`  ${original.text}`));
    tui.gap(this.ctx);

    const charLimit = costs.PLATFORM_CHAR_LIMITS[platform];
    const replyText = await tui.text(this.ctx, {
      message: `Your reply (max ${charLimit} chars)`,
      placeholder: "Write your reply…",
      validate: (value) => {
        if (value.trim().length === 0) return "Reply cannot be empty.";
        if (value.length > charLimit) {
          return `Reply cannot exceed ${charLimit} characters.`;
        }
        return undefined;
      },
    });
    if (tui.isCancel(replyText)) return;

    const confirmed = await tui.confirm(this.ctx, {
      message: "Post this reply?",
    });
    if (tui.isCancel(confirmed) || !confirmed) return;

    const result = await task.runTask(
      this.triggers.reply({ rawText: replyText, postId: postIdStr, platform }),
    );
    primitiveResults.match(result, {
      ok: (post) => {
        tui.log.success(this.ctx, `Reply posted! ID: ${post.id}`);
      },
      fail: (error) => {
        if (error instanceof Error) {
          tui.log.error(this.ctx, `Failed: ${error.message}`);
        } else {
          tui.log.warn(this.ctx, error.message);
        }
      },
    });
  }

  // ── Thread flow ────────────────────────────────────────────────────────────

  private async threadFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Post a thread on which platform?",
    );
    if (platform === null) return;

    const charLimit = costs.PLATFORM_CHAR_LIMITS[platform];

    tui.log.info(
      this.ctx,
      `Build your thread post by post. Each post replies to the previous one. Minimum 2 posts. (max ${charLimit} chars each)`,
    );

    const posts: string[] = [];

    while (true) {
      const n = posts.length + 1;
      const content = await tui.text(this.ctx, {
        message: `Post ${n}`,
        placeholder: n === 1 ? "Start your thread…" : "Continue the thread…",
        validate: (value) => {
          if (value.length > charLimit) {
            return `Post cannot exceed ${charLimit} characters.`;
          }
          return undefined;
        },
      });
      if (tui.isCancel(content)) return;

      if (content.trim().length === 0) {
        if (posts.length < 2) {
          tui.log.warn(
            this.ctx,
            "A thread needs at least 2 posts. Keep going.",
          );
          continue;
        }
        break;
      }

      posts.push(content);

      if (posts.length >= 2) {
        const more = await tui.confirm(this.ctx, {
          message: "Add another post?",
          initialValue: true,
        });
        if (tui.isCancel(more) || !more) break;
      }
    }

    if (posts.length < 2) {
      tui.log.warn(this.ctx, "Thread cancelled — need at least 2 posts.");
      return;
    }

    tui.gap(this.ctx);
    this.ctx.output.writeln(
      span.bold("Thread preview"),
      span.dim(`  ${posts.length} posts  `),
      span.dim(`(${costs.PLATFORM_LABELS[platform]})`),
    );
    for (const [i, post] of posts.entries()) {
      this.ctx.output.writeln(
        span.dim(`  ${i + 1}. `),
        span.text(post),
        span.dim(`  (${post.length}/${charLimit})`),
      );
    }
    tui.gap(this.ctx);

    const confirmed = await tui.confirm(this.ctx, {
      message: "Post this thread?",
    });
    if (tui.isCancel(confirmed) || !confirmed) return;

    const result = await task.runTask(
      this.triggers.postThread({ texts: posts, platform }),
    );
    primitiveResults.match(result, {
      ok: (posted) => {
        tui.log.success(
          this.ctx,
          `Thread posted! ${posted.length} posts published.`,
        );
        for (const [i, post] of posted.entries()) {
          tui.log.info(this.ctx, `  ${i + 1}. ID: ${post.id}`);
        }
      },
      fail: (error) => {
        if (error instanceof appErrors.ThreadPartialError) {
          tui.log.error(
            this.ctx,
            `Thread partially posted: ${error.postedTweets.length}/${error.totalCount} posts succeeded.`,
          );
          tui.log.error(
            this.ctx,
            `Failed at post ${error.failedIndex + 1}: ${error.message}`,
          );
          if (error.postedTweets.length > 0) {
            tui.log.info(this.ctx, "Successfully posted:");
            for (const [i, post] of error.postedTweets.entries()) {
              tui.log.info(this.ctx, `  ${i + 1}. ID: ${post.id}`);
            }
          }
        } else {
          tui.log.error(this.ctx, `Failed to post thread: ${error.message}`);
        }
      },
    });
  }

  // ── Repost flow ────────────────────────────────────────────────────────────

  private async repostFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Repost on which platform?",
    );
    if (platform === null) return;

    const postIdInput = await tui.text(this.ctx, {
      message: "Post ID to repost:",
    });
    if (tui.isCancel(postIdInput)) return;

    const postIdStr = postIdInput.trim();

    const previewResult = await task.runTask(
      this.triggers.getPost({ postId: postIdStr, platform }),
    );
    if (primitiveResults.isOk(previewResult)) {
      const preview = previewResult.value;
      tui.log.info(
        this.ctx,
        `Preview: "${preview.text.slice(0, 80)}${
          preview.text.length > 80 ? "…" : ""
        }"`,
      );
    } else {
      tui.log.warn(this.ctx, "Could not fetch post preview.");
    }

    const confirmed = await tui.confirm(this.ctx, { message: "Repost this?" });
    if (tui.isCancel(confirmed) || !confirmed) return;

    const result = await task.runTask(
      this.triggers.repost({ postId: postIdStr, platform }),
    );
    primitiveResults.match(result, {
      ok: () => {
        tui.log.success(
          this.ctx,
          `Reposted on ${costs.PLATFORM_LABELS[platform]}!`,
        );
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to repost: ${error.message}`);
      },
    });
  }

  // ── Quote flow ─────────────────────────────────────────────────────────────

  private async quoteFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Quote post on which platform?",
    );
    if (platform === null) return;

    const postIdInput = await tui.text(this.ctx, {
      message: "Post ID to quote:",
    });
    if (tui.isCancel(postIdInput)) return;

    const postIdStr = postIdInput.trim();

    const previewResult = await task.runTask(
      this.triggers.getPost({ postId: postIdStr, platform }),
    );
    if (primitiveResults.isOk(previewResult)) {
      const preview = previewResult.value;
      tui.log.info(
        this.ctx,
        `Quoting: "${preview.text.slice(0, 80)}${
          preview.text.length > 80 ? "…" : ""
        }"`,
      );
    } else {
      tui.log.warn(this.ctx, "Could not fetch post preview.");
    }

    const commentary = await tui.text(this.ctx, {
      message: "Your commentary:",
      validate: (value) => {
        if (value.trim().length === 0) return "Commentary cannot be empty.";
        return undefined;
      },
    });
    if (tui.isCancel(commentary)) return;

    const result = await task.runTask(
      this.triggers.quotePost({
        rawText: commentary,
        postId: postIdStr,
        platform,
      }),
    );
    primitiveResults.match(result, {
      ok: (post) => {
        tui.log.success(
          this.ctx,
          `Quoted on ${costs.PLATFORM_LABELS[platform]}! ID: ${post.id}`,
        );
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to quote: ${error.message}`);
      },
    });
  }

  // ── Undo repost flow ───────────────────────────────────────────────────────

  private async undoRepostFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Undo repost on which platform?",
    );
    if (platform === null) return;

    const postIdInput = await tui.text(this.ctx, {
      message: "Post ID to un-repost:",
    });
    if (tui.isCancel(postIdInput)) return;

    const postIdStr = postIdInput.trim();
    const confirmed = await tui.confirm(this.ctx, {
      message: "Remove this repost?",
    });
    if (tui.isCancel(confirmed) || !confirmed) return;

    const result = await task.runTask(
      this.triggers.undoRepost({ postId: postIdStr, platform }),
    );
    primitiveResults.match(result, {
      ok: () => {
        tui.log.success(
          this.ctx,
          `Repost removed on ${costs.PLATFORM_LABELS[platform]}.`,
        );
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to undo repost: ${error.message}`);
      },
    });
  }

  // ── Search flow ────────────────────────────────────────────────────────────

  private async searchFlow(): Promise<void> {
    const query = await tui.text(this.ctx, {
      message: "Search query:",
      placeholder: "Enter keywords or hashtags",
      validate: (
        value,
      ) => (value.trim().length === 0 ? "Query cannot be empty." : undefined),
    });
    if (tui.isCancel(query)) return;

    const searchAll = this.tokens.size > 1
      ? await tui.confirm(this.ctx, {
        message: "Search all authenticated platforms?",
      })
      : false;
    if (tui.isCancel(searchAll)) return;

    let searchResult;
    if (searchAll) {
      searchResult = await task.runTask(
        this.triggers.searchPostsAll({ rawText: query.trim(), maxResults: 10 }),
      );
    } else {
      const platform = await this.chooseAuthenticatedPlatform(
        "Search on which platform?",
      );
      if (platform === null) return;
      searchResult = await task.runTask(
        this.triggers.searchPosts({
          rawText: query.trim(),
          platform,
          maxResults: 20,
        }),
      );
    }

    primitiveResults.match(searchResult, {
      ok: (posts) => {
        if (posts.length === 0) {
          tui.log.info(this.ctx, "No results found.");
          return;
        }
        tui.gap(this.ctx);
        for (const post of posts) {
          const badge = costs.PLATFORM_BADGES[post.platform];
          this.ctx.output.writeln(
            post.platform === "twitter" ? span.cyan(badge) : span.text(badge),
            span.text(" "),
            span.bold(`@${post.authorHandle}`),
            span.text("  "),
            span.dim(post.createdAt.toLocaleDateString()),
          );
          this.ctx.output.writeln(span.text(`  ${post.text}`));
          this.ctx.output.writeln(
            span.dim("  ─────────────────────────────────────"),
          );
        }
        tui.gap(this.ctx);
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Search failed: ${error.message}`);
      },
    });
  }

  // ── View bookmarks flow ────────────────────────────────────────────────────

  private async viewBookmarksFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "View bookmarks on which platform?",
    );
    if (platform === null) return;

    const result = await task.runTask(
      this.triggers.getBookmarks({ platform, maxResults: 20 }),
    );
    primitiveResults.match(result, {
      ok: (posts) => {
        if (posts.length === 0) {
          tui.log.info(this.ctx, "No bookmarks found.");
          return;
        }
        tui.gap(this.ctx);
        for (const post of posts) {
          const badge = costs.PLATFORM_BADGES[post.platform];
          this.ctx.output.writeln(
            post.platform === "twitter" ? span.cyan(badge) : span.text(badge),
            span.text(" "),
            span.bold(`@${post.authorHandle}`),
            span.text("  "),
            span.dim(post.createdAt.toLocaleDateString()),
          );
          this.ctx.output.writeln(span.text(`  ${post.text}`));
          this.ctx.output.writeln(
            span.dim("  ─────────────────────────────────────"),
          );
        }
        tui.gap(this.ctx);
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to load bookmarks: ${error.message}`);
      },
    });
  }

  // ── Bookmark flow ──────────────────────────────────────────────────────────

  private async bookmarkFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Bookmark a post on which platform?",
    );
    if (platform === null) return;

    const postIdInput = await tui.text(this.ctx, {
      message: "Post ID to bookmark:",
    });
    if (tui.isCancel(postIdInput)) return;

    const postIdStr = postIdInput.trim();

    const previewResult = await task.runTask(
      this.triggers.getPost({ postId: postIdStr, platform }),
    );
    if (primitiveResults.isOk(previewResult)) {
      const preview = previewResult.value;
      tui.log.info(
        this.ctx,
        `"${preview.text.slice(0, 80)}${preview.text.length > 80 ? "…" : ""}"`,
      );
    } else {
      tui.log.warn(this.ctx, "Could not fetch post preview.");
    }

    const confirmed = await tui.confirm(this.ctx, {
      message: "Bookmark this post?",
    });
    if (tui.isCancel(confirmed) || !confirmed) return;

    const result = await task.runTask(
      this.triggers.bookmarkPost({ postId: postIdStr, platform }),
    );
    primitiveResults.match(result, {
      ok: () => {
        tui.log.success(
          this.ctx,
          `Bookmarked on ${costs.PLATFORM_LABELS[platform]}!`,
        );
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to bookmark: ${error.message}`);
      },
    });
  }

  // ── Remove bookmark flow ───────────────────────────────────────────────────

  private async removeBookmarkFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Remove bookmark on which platform?",
    );
    if (platform === null) return;

    const postIdInput = await tui.text(this.ctx, {
      message: "Post ID to remove from bookmarks:",
    });
    if (tui.isCancel(postIdInput)) return;

    const postIdStr = postIdInput.trim();
    const confirmed = await tui.confirm(this.ctx, {
      message: "Remove this bookmark?",
    });
    if (tui.isCancel(confirmed) || !confirmed) return;

    const result = await task.runTask(
      this.triggers.removeBookmark({ postId: postIdStr, platform }),
    );
    primitiveResults.match(result, {
      ok: () => {
        tui.log.success(
          this.ctx,
          `Bookmark removed on ${costs.PLATFORM_LABELS[platform]}.`,
        );
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to remove bookmark: ${error.message}`);
      },
    });
  }

  // ── Usage flow ─────────────────────────────────────────────────────────────

  private async usageFlow(): Promise<void> {
    const platform = await this.chooseAuthenticatedPlatform(
      "Show usage for which platform?",
    );
    if (platform === null) return;

    const cost = costs.DEFAULT_COSTS["getUsage"];
    const note = cost?.platformNotes?.[platform];
    if (note !== undefined) {
      tui.log.warn(this.ctx, `Note: ${note}`);
    }

    const result = await task.runTask(
      this.triggers.getUsage({ platform }),
    );
    const label = costs.PLATFORM_LABELS[platform];
    primitiveResults.match(result, {
      ok: (usage) => {
        tui.gap(this.ctx);
        this.ctx.output.writeln(
          span.bold(`${label} Usage`),
          usage.appName !== undefined
            ? span.dim(`  ${usage.appName}`)
            : span.text(""),
        );

        if (usage.totalCalls === 0 && usage.daily.length === 0) {
          this.ctx.output.writeln(
            span.dim("  No usage data available for this platform."),
          );
        } else {
          this.ctx.output.writeln(
            span.dim("  Total calls this period: "),
            span.text(String(usage.totalCalls)),
          );
          if (usage.daily.length > 0) {
            this.ctx.output.writeln(span.dim("  Daily breakdown:"));
            for (const day of usage.daily) {
              this.ctx.output.writeln(
                span.dim(`    ${day.date.toLocaleDateString()}  `),
                span.text(String(day.callCount)),
                span.dim("  calls"),
              );
            }
          }
        }
        tui.gap(this.ctx);
      },
      fail: (error) => {
        tui.log.error(this.ctx, `Failed to load usage: ${error.message}`);
      },
    });
  }

  // ── Schedule flow ──────────────────────────────────────────────────────────

  private scheduleFlow(): void {
    if (this.tokens.size === 0) {
      tui.log.warn(this.ctx, "You must be logged in. Choose 'Login' first.");
      return;
    }
    tui.log.warn(
      this.ctx,
      "Post scheduling is not yet available. A persistent scheduler adapter is coming soon.",
    );
  }
}
