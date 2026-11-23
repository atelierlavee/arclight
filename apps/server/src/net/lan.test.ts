// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { hostnameOf, isLocalHost } from "./lan.js";

describe("hostnameOf", () => {
  it("drops the port", () => {
    expect(hostnameOf("localhost:5173")).toBe("localhost");
    expect(hostnameOf("192.168.1.18:3000")).toBe("192.168.1.18");
  });

  it("keeps a host that carries no port", () => {
    expect(hostnameOf("localhost")).toBe("localhost");
  });

  it("unwraps a bracketed IPv6 address and its port", () => {
    expect(hostnameOf("[::1]:5173")).toBe("::1");
    expect(hostnameOf("[fe80::1]")).toBe("fe80::1");
  });

  it("leaves a bare IPv6 address whole", () => {
    // No brackets means no port, so the colons are all address. Splitting on
    // the first one would turn ::1 into an empty host and let it through.
    expect(hostnameOf("::1")).toBe("::1");
  });

  it("is case-insensitive", () => {
    expect(hostnameOf("LocalHost:5173")).toBe("localhost");
  });

  it("returns null for a missing or empty header", () => {
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf("")).toBeNull();
    expect(hostnameOf("   ")).toBeNull();
  });
});

describe("isLocalHost", () => {
  it("accepts the names this machine answers to", () => {
    expect(isLocalHost("localhost:5173")).toBe(true);
    expect(isLocalHost("127.0.0.1:3000")).toBe(true);
    expect(isLocalHost("[::1]:5173")).toBe(true);
    expect(isLocalHost("::1")).toBe(true);
  });

  it("accepts the whole loopback block, not just 127.0.0.1", () => {
    expect(isLocalHost("127.0.1.1:5173")).toBe(true);
    expect(isLocalHost("127.255.255.254")).toBe(true);
  });

  it("rejects addresses on the network", () => {
    expect(isLocalHost("192.168.1.18:5173")).toBe(false);
    expect(isLocalHost("10.0.0.5:3000")).toBe(false);
    expect(isLocalHost("172.18.0.1:3000")).toBe(false);
    expect(isLocalHost("media.local:5173")).toBe(false);
  });

  it("rejects a request that names no host at all", () => {
    // HTTP/1.0 allows it. Treating an absent Host as local would hand out a
    // bypass to anything that simply omits the header.
    expect(isLocalHost(undefined)).toBe(false);
  });

  it("rejects hostnames that merely start with a local one", () => {
    expect(isLocalHost("localhost.attacker.example")).toBe(false);
    expect(isLocalHost("127.0.0.1.attacker.example")).toBe(false);
  });
});
