// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as registry from "./registry.ts";

// =============================================================================
// parseRegistryUrl
// =============================================================================

const ACCEPTED: readonly [name: string, url: string][] = [
  ["a public https host", "https://packs.example.com/registry.json"],
  ["a public IPv4 address over https", "https://203.0.113.7/registry.json"],
  ["a public IPv6 address over https", "https://[2001:db8::1]/registry.json"],
  ["http on 127.0.0.1", "http://127.0.0.1:8080/registry.json"],
  ["http on localhost", "http://localhost:8080/registry.json"],
  ["http on [::1]", "http://[::1]:8080/registry.json"],
  ["http on IPv4-mapped loopback", "http://[::ffff:127.0.0.1]/r.json"],
];

for (const [name, url] of ACCEPTED) {
  Deno.test(`parseRegistryUrl accepts ${name}`, () => {
    const parsed = registry.parseRegistryUrl(url);

    assert.assert(results.isOk(parsed), url);
    assert.assertEquals(parsed.value.href, new URL(url).href);
  });
}

const REFUSED: readonly [name: string, value: unknown, reason: string][] = [
  ["a value that is not a string", 42, "must be a URL string"],
  ["a relative URL", "/registry.json", "not an absolute URL"],
  ["http on a public host", "http://packs.example.com/r.json", "https://"],
  ["a file URL", "file:///etc/passwd", "https://"],
  ["an ftp URL", "ftp://packs.example.com/r.json", "https://"],
  [
    "credentials in the URL",
    "https://user:secret@packs.example.com/r.json",
    "user name or password",
  ],
  ["cloud metadata", "https://169.254.169.254/latest/meta-data", "link-local"],
  ["metadata as a decimal IPv4", "https://2852039166/", "link-local"],
  ["metadata as a hex IPv4", "https://0xa9fea9fe/", "link-local"],
  ["10/8", "https://10.0.0.1/r.json", "private"],
  ["172.16/12", "https://172.20.1.1/r.json", "private"],
  ["192.168/16", "https://192.168.1.10/r.json", "private"],
  ["shared address space", "https://100.64.0.1/r.json", "shared"],
  ["the unspecified address", "https://0.0.0.0/r.json", "unspecified"],
  ["multicast", "https://224.0.0.1/r.json", "multicast"],
  ["IPv6 link-local", "https://[fe80::1]/r.json", "link-local"],
  ["IPv6 unique local", "https://[fd00::1]/r.json", "private"],
  ["IPv6 unspecified", "https://[::]/r.json", "unspecified"],
  [
    "IPv4-mapped metadata",
    "https://[::ffff:169.254.169.254]/r.json",
    "link-local",
  ],
  ["NAT64 private", "https://[64:ff9b::10.0.0.1]/r.json", "private"],
];

for (const [name, value, reason] of REFUSED) {
  Deno.test(`parseRegistryUrl refuses ${name}`, () => {
    const parsed = registry.parseRegistryUrl(value);

    assert.assert(results.isFail(parsed), String(value));
    assert.assertStringIncludes(parsed.error.message, reason);
  });
}

Deno.test("parseRegistryUrl keeps credentials out of the error", () => {
  const parsed = registry.parseRegistryUrl(
    "https://user:secret@packs.example.com/r.json",
  );

  assert.assert(results.isFail(parsed));
  assert.assertEquals(parsed.error.message.includes("secret"), false);
  assert.assertEquals(parsed.error.url.includes("secret"), false);
});

Deno.test("internalAddressKind leaves host names to the request", () => {
  assert.assertEquals(registry.internalAddressKind("packs.example.com"), null);
  assert.assertEquals(registry.internalAddressKind("LOCALHOST."), "loopback");
  assert.assertEquals(registry.internalAddressKind("127.8.9.10"), "loopback");
  assert.assertEquals(registry.internalAddressKind("[::1]"), "loopback");
});

// =============================================================================
// parseRegistry
// =============================================================================

const ENTRY = {
  name: "typescript",
  description: "TypeScript rules",
  version: "1.0.0",
  source: "remote",
  tags: ["ts"],
};

Deno.test("parseRegistry accepts a well-formed document", () => {
  const parsed = registry.parseRegistry({ packs: [ENTRY] });

  assert.assert(results.isOk(parsed));
  assert.assertEquals(parsed.value.packs[0]?.name, "typescript");
});

const BAD_DOCUMENTS: readonly [name: string, data: unknown, reason: string][] =
  [
    ["no packs list", { items: [] }, `no "packs" list`],
    ["an entry that is not an object", { packs: ["x"] }, "packs[0]"],
    ["an empty name", { packs: [{ ...ENTRY, name: "" }] }, "packs[0].name"],
    [
      "a terminal escape in the description",
      {
        packs: [ENTRY, { ...ENTRY, description: "\u001b]52;c;cGF3bmVk\u0007" }],
      },
      "packs[1].description",
    ],
    ["an unknown source", { packs: [{ ...ENTRY, source: "x" }] }, "source"],
    ["tags that are not strings", { packs: [{ ...ENTRY, tags: [1] }] }, "tags"],
  ];

for (const [name, data, reason] of BAD_DOCUMENTS) {
  Deno.test(`parseRegistry refuses ${name}`, () => {
    const parsed = registry.parseRegistry(data);

    assert.assert(results.isFail(parsed));
    assert.assertStringIncludes(parsed.error, reason);
  });
}

// =============================================================================
// fetchRegistry against a local server
// =============================================================================

const withServer = async (
  handler: (request: Request) => Response,
  body: (baseUrl: URL) => Promise<void>,
): Promise<void> => {
  const stop = new AbortController();
  const server = await runtime.http.serve(
    { hostname: "127.0.0.1", port: 0, signal: stop.signal },
    handler,
  );
  try {
    await body(new URL(`http://127.0.0.1:${server.port}/`));
  } finally {
    stop.abort();
    await server.finished;
  }
};

Deno.test("fetchRegistry reads a registry from an accepted URL", async () => {
  await withServer(
    () => Response.json({ packs: [ENTRY] }),
    async (baseUrl) => {
      const fetched = await registry.fetchRegistry(baseUrl);

      assert.assert(results.isOk(fetched));
      assert.assertEquals(fetched.value.packs.length, 1);
    },
  );
});

const FAILING_SERVERS: readonly [
  name: string,
  handler: (request: Request) => Response,
  reason: string,
][] = [
  [
    "a redirect",
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    "redirects to http://169.254.169.254/latest/meta-data",
  ],
  ["an error status", () => new Response("down", { status: 503 }), "HTTP 503"],
  [
    "a document over the size limit",
    () => new Response("x".repeat(registry.MAX_REGISTRY_BYTES + 1)),
    "larger than",
  ],
  ["a document that is not JSON", () => new Response("<html>"), "not JSON"],
  [
    "JSON that is not a registry",
    () => Response.json({ packs: "none" }),
    "not a pack registry",
  ],
];

for (const [name, handler, reason] of FAILING_SERVERS) {
  Deno.test(`fetchRegistry refuses ${name}`, async () => {
    await withServer(handler, async (baseUrl) => {
      const fetched = await registry.fetchRegistry(baseUrl);

      assert.assert(results.isFail(fetched));
      assert.assertStringIncludes(fetched.error.message, reason);
      assert.assertStringIncludes(fetched.error.message, baseUrl.href);
    });
  });
}

Deno.test("fetchRegistry reports a server that is not there", async () => {
  // Port 9 (discard) on loopback: nothing listens there on a test machine.
  const fetched = await registry.fetchRegistry(
    new URL("http://127.0.0.1:9/registry.json"),
  );

  assert.assert(results.isFail(fetched));
  assert.assertStringIncludes(fetched.error.message, "the request failed");
});
