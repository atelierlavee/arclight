// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import type { FastifyInstance } from "fastify";
import { getNetworkSettings } from "../api/settings.js";
import { isAuthorisedCastStream } from "../auth/castTokens.js";

/**
 * Local-network exposure, decided from the address the client asked for.
 *
 * Not from the client's IP, which would be the obvious way and does not work
 * here: under Docker every request reaches the container through the bridge
 * gateway, so a browser on this machine and a phone on the wifi both arrive
 * as 172.18.0.1. There is nothing in the connection to tell them apart.
 *
 * What does differ is the address that was typed. This machine reaches the
 * app as localhost; anything else on the network has to name the host by its
 * LAN address, and that name travels in the Host header.
 *
 * So this is a convenience gate, not a security boundary: a Host header can
 * be forged by anyone who thinks to. It stops the app being *usable* from
 * other devices, which is what it is for. The password is what stops people
 * getting in, and that is unchanged either way.
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1"]);

/** Strips the port and any IPv6 brackets from a Host header. */
export function hostnameOf(header: string | undefined): string | null {
  if (!header) return null;
  const value = header.trim().toLowerCase();
  if (!value) return null;

  // "[::1]:5173" — the colons inside the brackets are part of the address.
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? null : value.slice(1, end);
  }

  // A bare IPv6 address has several colons and no port; "host:port" has one.
  const firstColon = value.indexOf(":");
  if (firstColon === -1) return value;
  if (value.indexOf(":", firstColon + 1) !== -1) return value;
  return value.slice(0, firstColon);
}

/**
 * True when the request named this machine rather than an address on the
 * network. The whole 127.0.0.0/8 block counts, not just 127.0.0.1 — it is all
 * loopback, and some setups use 127.0.1.1.
 */
export function isLocalHost(header: string | undefined): boolean {
  const hostname = hostnameOf(header);
  if (hostname === null) return false;
  if (LOCAL_HOSTNAMES.has(hostname)) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/**
 * The port another device should open.
 *
 * In development that is Vite's, which serves the page and proxies the API;
 * the production image has no Vite and serves both from the API's own port.
 * Defaulting to 5173 everywhere showed a production install's phone a URL
 * that went nowhere.
 */
export function lanPort(): number {
  if (process.env.LAN_PORT) return Number(process.env.LAN_PORT);
  return process.env.NODE_ENV === "production" ? Number(process.env.PORT ?? 3000) : 5173;
}

/** Docker gives every container this file; nothing else does. */
export function inContainer(): boolean {
  return existsSync("/.dockerenv");
}

/**
 * Addresses this host can be reached on from the network.
 *
 * Inside a container the interfaces belong to the container, not to the
 * machine — the only address to find is its own 172.x on the bridge, which is
 * no use to a phone. So containerised installs are told to say where they
 * are, via LAN_HOST, rather than being shown a confidently wrong answer.
 */
export function lanAddresses(): string[] {
  const configured = process.env.LAN_HOST?.trim();
  if (configured) return [configured];
  if (inContainer()) return [];

  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry!.address);
}

// Read on every request, so it is held here rather than fetched from the
// database each time. One row, changed by hand perhaps twice — a query per
// request would be pure waste.
let cached: boolean | null = null;

export async function isLanExposed(): Promise<boolean> {
  if (cached === null) cached = (await getNetworkSettings()).lanExposed;
  return cached;
}

/** Called after a write, so the next request sees the new value. */
export function forgetLanExposure(value?: boolean): void {
  cached = value ?? null;
}

/**
 * Refuses everything that did not arrive as localhost while exposure is off.
 *
 * `onRequest` rather than `preHandler`: there is no reason to parse a body or
 * look up a session for a request that is not going to be answered.
 *
 * The reply carries a code rather than only a message, so the web app can
 * tell this apart from any other 403 and say what has happened instead of
 * showing a broken page.
 */
export function registerLanGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    if (isLocalHost(request.headers.host)) return;
    if (await isLanExposed()) return;
    // A TV fetching a video it was cast. The token is the owner's say-so for
    // that one stream, which is the permission this switch exists to ask for.
    if (isAuthorisedCastStream(request.method, request.url)) return;

    reply.code(403).send({
      error: "Local network access is turned off for this server.",
      code: "lan_disabled",
    });
  });
}
