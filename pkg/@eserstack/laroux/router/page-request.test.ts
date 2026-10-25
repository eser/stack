// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as pageRequest from "./page-request.ts";

const cookieCases: ReadonlyArray<{
  readonly name: string;
  readonly header: string | null;
  readonly expected: ReadonlyArray<readonly [string, string]>;
}> = [
  { name: "gives no cookies without a header", header: null, expected: [] },
  { name: "gives no cookies for an empty header", header: "", expected: [] },
  {
    name: "reads every pair and trims the spaces around it",
    header: " theme=dark ;user=ada ",
    expected: [["theme", "dark"], ["user", "ada"]],
  },
  {
    name: "keeps an = inside the value",
    header: "token=a=b==",
    expected: [["token", "a=b=="]],
  },
  {
    name: "decodes percent escapes and removes surrounding quotes",
    header: 'user=ada%20lovelace; note="hello world"',
    expected: [["user", "ada lovelace"], ["note", "hello world"]],
  },
  {
    name: "keeps a value with a malformed escape as sent",
    header: "discount=100%",
    expected: [["discount", "100%"]],
  },
  {
    name: "keeps the first value of a repeated name",
    header: "session=path-specific; session=site-wide",
    expected: [["session", "path-specific"]],
  },
  {
    name: "skips pairs without a name or an =",
    header: "=orphan; flag; user=ada",
    expected: [["user", "ada"]],
  },
  {
    name: "keeps an empty value",
    header: "empty=",
    expected: [["empty", ""]],
  },
];

for (const { name, header, expected } of cookieCases) {
  Deno.test(`parseCookieHeader ${name}`, () => {
    assert.assertEquals(
      [...pageRequest.parseCookieHeader(header)],
      [...expected],
    );
  });
}

Deno.test("createPageRequest fills in what the input leaves out", () => {
  const request = pageRequest.createPageRequest({});

  assert.assertEquals(request.cookies.size, 0);
  assert.assertEquals(request.host, null);
  assert.assertEquals(request.locale, null);
});

Deno.test("createPageRequest parses the cookies and keeps host and locale", () => {
  const request = pageRequest.createPageRequest({
    cookieHeader: "user=ada",
    host: "shop.test",
    locale: "tr",
  });

  assert.assertEquals(request.cookies.get("user"), "ada");
  assert.assertEquals(request.host, "shop.test");
  assert.assertEquals(request.locale, "tr");
});
