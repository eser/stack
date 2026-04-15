// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Proxy types for laroux.js middleware

export type ProxyContext = {
  request: Request;
  pathname: string;
  params: Record<string, string>;
};

export type ProxyResult =
  | { type: "next" }
  | { type: "response"; response: Response }
  | { type: "redirect"; url: string; status?: number }
  | { type: "rewrite"; pathname: string };

export type Proxy = (
  context: ProxyContext,
) => ProxyResult | Promise<ProxyResult>;
