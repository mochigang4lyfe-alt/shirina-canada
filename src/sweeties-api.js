// Shirina Canada — Sweeties authentication API.
// Staged integration. Not connected to the public Worker.

import { requestSweetiesCode } from "./sweeties-code-request.js";
import { verifySweetiesCode } from "./sweeties-code-verify.js";
import { findOrCreateSweetie } from "./sweeties-member.js";
import { registerSweetie } from "./sweeties-registration.js";
import {
  createSweetiesSession,
  getSweetiesSession,
  revokeSweetiesSession
} from "./sweeties-session.js";
import { registrationComplete } from "./sweeties-auth.js";

function json(data, status = 200, cookie = null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

async function parseBody(request, origin) {
  if (request.headers.get("Origin") !== origin)
    return { error: "Invalid origin", status: 403 };

  if (!/^application\/json(?:\s*;|$)/i.test(
    request.headers.get("Content-Type") || ""
  )) return { error: "JSON required", status: 415 };

  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > 4096)
    return { error: "Request too large", status: 413 };

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 4096)
      return { error: "Request too large", status: 413 };

    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Invalid object");
    return { data };
  } catch {
    return { error: "Invalid request", status: 400 };
  }
}


// Apply database-backed limits using privacy-preserving keyed identifiers.
// Cloudflare provides CF-Connecting-IP; do not trust a browser-supplied
// X-Forwarded-For value as an alternative.
async function reserveSweetiesAPILimit(request, env, purpose, max) {
  if (!env?.DB ||
      typeof env.SWEETIES_AUTH_SECRET !== "string" ||
      env.SWEETIES_AUTH_SECRET.length < 32)
    return false;

  const ip = request.headers.get("CF-Connecting-IP");

  // Fail closed without a trustworthy edge-supplied IP.
  if (!ip || ip.length > 64) return false;

  const bytes = new TextEncoder().encode(env.SWEETIES_AUTH_SECRET);
  const key = await crypto.subtle.importKey(
    "raw", bytes, { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC", key,
    new TextEncoder().encode(`sweeties:${purpose}:${ip}`)
  );

  const identifier = Array.from(
    new Uint8Array(signature),
    b => b.toString(16).padStart(2, "0")
  ).join("");

  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / 3600) * 3600;

  const result = await env.DB.prepare(`
    INSERT INTO sweeties_auth_limits
      (limit_key, window_start, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(limit_key) DO UPDATE SET
      window_start=excluded.window_start,
      attempts=CASE
        WHEN window_start!=excluded.window_start THEN 1
        ELSE attempts+1
      END
    WHERE window_start!=excluded.window_start
       OR attempts<?
  `).bind(identifier, windowStart, max).run();

  return result.meta?.changes === 1;
}

export async function handleSweetiesAPI(request, env, sendEmail) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/sweeties/me") {
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);

    try {
      const session = await getSweetiesSession(request, env);
      if (!session) return json({ authenticated: false }, 401);

      return json({
        authenticated: true,
        registrationRequired: !registrationComplete(session),
        username: registrationComplete(session)
          ? session.sweeties_username : null
      });
    } catch {
      return json({ error: "Session unavailable" }, 503);
    }
  }

  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  const parsed = await parseBody(request, url.origin);
  if (parsed.error)
    return json({ error: parsed.error }, parsed.status);

  const input = parsed.data;

  if (path === "/api/sweeties/request-code") {
    try {
      if (!await reserveSweetiesAPILimit(
        request, env, "request-code", 10
      )) return json({ error: "Too many requests" }, 429);
    } catch {
      return json({ error: "Email login unavailable" }, 503);
    }

    // Email delivery must be securely configured before activation.
    if (typeof sendEmail !== "function")
      return json({ error: "Email service unavailable" }, 503);

    try {
      const result = await requestSweetiesCode(
        input.email, env, sendEmail
      );
      return result.ok
        ? json({ ok: true })
        : json({ error: result.error }, 429);
    } catch {
      return json({ error: "Email service unavailable" }, 503);
    }
  }

  if (path === "/api/sweeties/verify-code") {
    try {
      if (!await reserveSweetiesAPILimit(
        request, env, "verify-code", 20
      )) return json({ error: "Too many attempts" }, 429);
    } catch {
      return json({ error: "Verification unavailable" }, 503);
    }

    try {
      const verified = await verifySweetiesCode(
        input.email, input.code, env
      );

      if (!verified.ok)
        return json({ error: "Invalid or expired code" }, 400);

      const member = await findOrCreateSweetie(
        env, verified.email
      );

      if (!member.ok)
        return json({ error: "Account unavailable" }, 403);

      const session = await createSweetiesSession(
        env, member.memberId
      );

      return json({
        ok: true,
        registrationRequired: member.registrationRequired
      }, 200, session.cookie);

    } catch {
      return json({ error: "Login unavailable" }, 503);
    }
  }

  if (path === "/api/sweeties/register") {
    try {
      const session = await getSweetiesSession(request, env);
      if (!session)
        return json({ error: "Login required" }, 401);

      const result = await registerSweetie(env, session, input);

      return result.ok
        ? json({
            ok: true,
            username: result.username,
            registrationComplete: true
          })
        : json({ error: result.error }, result.status);

    } catch {
      return json({ error: "Registration unavailable" }, 503);
    }
  }

  if (path === "/api/sweeties/logout") {
    try {
      const cookie = await revokeSweetiesSession(request, env);
      return json({ ok: true }, 200, cookie);
    } catch {
      return json({ error: "Logout unavailable" }, 503);
    }
  }

  return json({ error: "Not found" }, 404);
}
