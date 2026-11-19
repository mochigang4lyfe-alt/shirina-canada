// Shirina Canada — Sweeties email-code verification.
// Not exposed publicly. Does not create sessions or register members.

import { hashEmailCode } from "./sweeties-auth.js";
import {
  normalizeEmail,
  codeIsUsable,
  MAX_CODE_ATTEMPTS
} from "./sweeties-email-policy.js";

export async function verifySweetiesCode(emailInput, code, env) {
  const email = normalizeEmail(emailInput);

  if (!email || typeof code !== "string" || !/^\d{6}$/.test(code))
    return { ok: false, error: "Invalid verification code" };

  if (!env?.DB ||
      typeof env.SWEETIES_AUTH_SECRET !== "string" ||
      env.SWEETIES_AUTH_SECRET.length < 32)
    return { ok: false, error: "Verification unavailable" };

  try {
    const now = Math.floor(Date.now() / 1000);

    const record = await env.DB.prepare(`
      SELECT id, code_hash, expires_at, attempts, consumed_at
      FROM sweeties_email_codes
      WHERE email = ? COLLATE NOCASE
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).bind(email).first();

    if (!codeIsUsable(record, now))
      return { ok: false, error: "Invalid or expired verification code" };

    const hash = await hashEmailCode(
      email, code, env.SWEETIES_AUTH_SECRET
    );

    if (hash !== record.code_hash) {
      // Conditional update prevents unlimited concurrent failed attempts.
      await env.DB.prepare(`
        UPDATE sweeties_email_codes
        SET attempts = attempts + 1
        WHERE id = ?
          AND consumed_at IS NULL
          AND expires_at > ?
          AND attempts < ?
      `).bind(record.id, now, MAX_CODE_ATTEMPTS).run();

      return { ok: false, error: "Invalid or expired verification code" };
    }

    // Atomic consumption: exactly one successful request can claim the code.
    const claimed = await env.DB.prepare(`
      UPDATE sweeties_email_codes
      SET consumed_at = ?
      WHERE id = ?
        AND code_hash = ?
        AND consumed_at IS NULL
        AND expires_at > ?
        AND attempts < ?
    `).bind(
      now, record.id, hash, now, MAX_CODE_ATTEMPTS
    ).run();

    if (claimed.meta?.changes !== 1)
      return { ok: false, error: "Invalid or expired verification code" };

    return { ok: true, email };

  } catch {
    return { ok: false, error: "Verification unavailable" };
  }
}
