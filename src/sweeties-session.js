// Shirina Canada — permanent Sweeties login sessions.
// Utilities only; not yet exposed through public routes.

import {
  generateSessionToken,
  hashSessionToken
} from "./sweeties-auth.js";

import {
  SESSION_TTL_SECONDS,
  sessionIsUsable,
  secureSessionCookie,
  clearSessionCookie
} from "./sweeties-email-policy.js";

const COOKIE_NAME = "__Host-sweeties_session";

function sessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(
    /(?:^|;\s*)__Host-sweeties_session=([a-f0-9]{64})(?:;|$)/
  );
  return match ? match[1] : null;
}

export async function createSweetiesSession(env, memberId) {
  if (!env?.DB || typeof memberId !== "string" || !memberId)
    throw new Error("Session unavailable");

  const token = generateSessionToken();
  const hash = await hashSessionToken(token);
  const now = Math.floor(Date.now() / 1000);

  const active = await env.DB.prepare(
    `SELECT id FROM members
     WHERE id=? AND suspended_at IS NULL LIMIT 1`
  ).bind(memberId).first();

  if (!active)
    throw new Error("Member unavailable");

  await env.DB.prepare(
    `INSERT INTO sweeties_sessions
      (id,member_id,token_hash,expires_at,created_at)
     VALUES(?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(),
    memberId,
    hash,
    now + SESSION_TTL_SECONDS,
    now
  ).run();

  return {
    cookie: secureSessionCookie(token),
    expiresAt: now + SESSION_TTL_SECONDS
  };
}

export async function getSweetiesSession(request, env) {
  if (!env?.DB) return null;

  const token = sessionToken(request);
  if (!token) return null;

  const hash = await hashSessionToken(token);
  const now = Math.floor(Date.now() / 1000);

  const session = await env.DB.prepare(
    `SELECT s.id,s.expires_at,s.revoked_at,
            m.id AS member_id,
            m.display_name,
            m.sweeties_username,
            m.age_confirmed_at,
            m.registration_completed_at,
            m.suspended_at
     FROM sweeties_sessions s
     JOIN members m ON m.id=s.member_id
     WHERE s.token_hash=? LIMIT 1`
  ).bind(hash).first();

  if (!sessionIsUsable(session, now) || session.suspended_at)
    return null;

  return session;
}

export async function revokeSweetiesSession(request, env) {
  const token = sessionToken(request);

  if (token && env?.DB) {
    const hash = await hashSessionToken(token);
    await env.DB.prepare(
      `UPDATE sweeties_sessions SET revoked_at=?
       WHERE token_hash=? AND revoked_at IS NULL`
    ).bind(Math.floor(Date.now() / 1000), hash).run();
  }

  return clearSessionCookie();
}
