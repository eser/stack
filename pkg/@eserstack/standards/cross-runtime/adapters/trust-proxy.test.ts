// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as trustProxy from "./trust-proxy.ts";

const LOOPBACK = trustProxy.parseTrustProxy(["127.0.0.1"]);

nodeTest.describe("trustProxy.parseTrustProxy", () => {
  for (const entry of [
    "",
    "proxy.example.com",
    "10.0.0.0/33",
    "2001:db8::/129",
    "10.0.0.0/",
    "10.0.0.0/8/8",
    "10.0.0.0/x",
    "unix",
  ]) {
    nodeTest.it(`refuses ${JSON.stringify(entry)} and names it`, () => {
      assert.assertThrows(
        () => trustProxy.parseTrustProxy([entry]),
        TypeError,
        `trustProxy entry "${entry}" is not valid`,
      );
    });
  }

  nodeTest.it("matches addresses, IPv4 and IPv6 CIDRs and mapped peers", () => {
    const policy = trustProxy.parseTrustProxy([
      "192.0.2.1",
      "10.0.0.0/8",
      "2001:db8::/32",
    ]);
    const trusted = (peer: string): boolean =>
      trustProxy.resolveForwarded(policy, peer, {}) !== null;

    assert.assert(trusted("192.0.2.1"));
    assert.assert(trusted("10.200.0.1"));
    assert.assert(trusted("2001:db8::1"));
    // A dual-stack listener reports IPv4 peers in this form.
    assert.assert(trusted("::ffff:10.0.0.1"));

    assert.assertFalse(trusted("192.0.2.2"));
    assert.assertFalse(trusted("11.0.0.1"));
    assert.assertFalse(trusted("2001:db9::1"));
  });
});

nodeTest.describe("trustProxy.resolveForwarded", () => {
  nodeTest.it("reads nothing from a peer that is not listed", () => {
    assert.assertEquals(
      trustProxy.resolveForwarded(LOOPBACK, "198.51.100.1", {
        "x-forwarded-for": "203.0.113.7",
      }),
      null,
    );
  });

  nodeTest.it("reads nothing from a socket that has closed", () => {
    assert.assertEquals(
      trustProxy.resolveForwarded(LOOPBACK, null, {
        "x-forwarded-for": "203.0.113.7",
      }),
      null,
    );
  });

  nodeTest.it("trusts a unix socket peer only when it is listed", () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };

    assert.assertEquals(
      trustProxy.resolveForwarded(LOOPBACK, trustProxy.UNIX_PEER, headers),
      null,
    );
    assert.assertEquals(
      trustProxy.resolveForwarded(
        trustProxy.parseTrustProxy([trustProxy.UNIX_PEER]),
        trustProxy.UNIX_PEER,
        headers,
      ),
      { clientAddress: "203.0.113.7", protocol: null, host: null },
    );
  });

  nodeTest.it("does not trust an IP peer because unix: is listed", () => {
    assert.assertEquals(
      trustProxy.resolveForwarded(
        trustProxy.parseTrustProxy([trustProxy.UNIX_PEER]),
        "127.0.0.1",
        { "x-forwarded-for": "203.0.113.7" },
      ),
      null,
    );
  });

  const clientCases: readonly (readonly [string, string, string | null])[] = [
    ["one address", "203.0.113.7", "203.0.113.7"],
    [
      "a forged entry left of the real client",
      "127.0.0.1, 203.0.113.7",
      "203.0.113.7",
    ],
    [
      "listed proxies right of the client",
      "198.51.100.9, 203.0.113.7, 127.0.0.1",
      "203.0.113.7",
    ],
    ["only listed proxies", "127.0.0.1, 127.0.0.1", "127.0.0.1"],
    ["garbage from the start", "not-an-address", null],
    ["garbage left of a proxy", "not-an-address, 127.0.0.1", "127.0.0.1"],
    ["an address with a port", "203.0.113.7:4711", null],
    ["a bracketed address", "[2001:db8::1]", null],
    ["an empty header", "", null],
  ];

  for (const [name, header, expected] of clientCases) {
    nodeTest.it(`finds the client in X-Forwarded-For: ${name}`, () => {
      const forwarded = trustProxy.resolveForwarded(LOOPBACK, "127.0.0.1", {
        "x-forwarded-for": header,
      });

      assert.assertEquals(forwarded?.clientAddress, expected);
    });
  }

  const protocolCases: readonly (readonly [string, "http" | "https" | null])[] =
    [
      ["https", "https"],
      ["HTTP", "http"],
      ["http, https", "https"],
      ["https, http", "http"],
      ["ftp", null],
      ["javascript", null],
      ["", null],
    ];

  for (const [header, expected] of protocolCases) {
    nodeTest.it(`reads X-Forwarded-Proto ${JSON.stringify(header)}`, () => {
      const forwarded = trustProxy.resolveForwarded(LOOPBACK, "127.0.0.1", {
        "x-forwarded-proto": header,
      });

      assert.assertEquals(forwarded?.protocol, expected);
    });
  }

  const hostCases: readonly (readonly [string, string | null])[] = [
    ["app.example.com", "app.example.com"],
    ["app.example.com:8443", "app.example.com:8443"],
    ["[2001:db8::1]:8443", "[2001:db8::1]:8443"],
    ["forged.example.com, app.example.com", "app.example.com"],
    ["user@evil.example.com", null],
    ["evil.example.com/path", null],
    ["evil.example.com?query", null],
    ["app.example.com:99999", null],
    ["[not-ipv6]", null],
    ["", null],
  ];

  for (const [header, expected] of hostCases) {
    nodeTest.it(`reads X-Forwarded-Host ${JSON.stringify(header)}`, () => {
      const forwarded = trustProxy.resolveForwarded(LOOPBACK, "127.0.0.1", {
        "x-forwarded-host": header,
      });

      assert.assertEquals(forwarded?.host, expected);
    });
  }

  nodeTest.it("joins a header that arrives as a list", () => {
    const forwarded = trustProxy.resolveForwarded(LOOPBACK, "127.0.0.1", {
      "x-forwarded-for": ["198.51.100.9", "203.0.113.7"],
    });

    assert.assertEquals(forwarded?.clientAddress, "203.0.113.7");
  });
});
