// Shirina Canada — Sweeties verification-code requests.
// Not routed publicly until email delivery and security tests pass.

import {
  generateEmailCode,
  hashEmailCode
} from "./sweeties-auth.js";

import {
  normalizeEmail,
  EMAIL_CODE_TTL_SECONDS,
  MAX_CODE_REQUESTS_PER_HOUR
} from "./sweeties-email-policy.js";

const encoder = new TextEncoder();

async function keyedIdentifier(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );

  return Array.from(
    new Uint8Array(signature),
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

async function reserveLimit(db, key, now) {
  const windowStart = Math.floor(now / 3600) * 3600;

  const result = await db.prepare(`
    INSERT INTO sweeties_auth_limits
      (limit_key, window_start, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(limit_key) DO UPDATE SET
      window_start = excluded.window_start,
      attempts = CASE
        WHEN window_start != excluded.window_start THEN 1
        ELSE attempts + 1
      END
    WHERE window_start != excluded.window_start
       OR attempts < ?
  `).bind(
    key,
    windowStart,
    MAX_CODE_REQUESTS_PER_HOUR
  ).run();

  return result.meta?.changes === 1;
}

export async function requestSweetiesCode(
  emailInput,
  env,
  sendEmail
) {
  const email = normalizeEmail(emailInput);

  if (!email) {
    return { ok: false, error: "Invalid email address" };
  }

  // Fail closed if the sender or required resources are unavailable.
  if (
    !env?.DB ||
    typeof env.SWEETIES_AUTH_SECRET !== "string" ||
    env.SWEETIES_AUTH_SECRET.length < 32 ||
    typeof sendEmail !== "function"
  ) {
    return { ok: false, error: "Email login unavailable" };
  }

  const now = Math.floor(Date.now() / 1000);

  const identifier = await keyedIdentifier(
    "email-request:" + email,
    env.SWEETIES_AUTH_SECRET
  );

  const allowed = await reserveLimit(
    env.DB,
    identifier,
    now
  );

  if (!allowed) {
    return { ok: false, error: "Too many requests" };
  }

  const code = generateEmailCode();
  const hash = await hashEmailCode(
    email,
    code,
    env.SWEETIES_AUTH_SECRET
  );

  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO sweeties_email_codes
      (id, email, code_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    email,
    hash,
    now + EMAIL_CODE_TTL_SECONDS,
    now
  ).run();

  try {
    await sendEmail(email, code);
  } catch {
    // A failed delivery must not leave a usable verification code.
    await env.DB.prepare(`
      UPDATE sweeties_email_codes
      SET consumed_at = ?
      WHERE id = ?
    `).bind(now, id).run();

    return { ok: false, error: "Unable to send verification email" };
  }

  return { ok: true };
}
