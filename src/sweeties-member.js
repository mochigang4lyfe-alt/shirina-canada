// Shirina Canada — verified-email member onboarding.
// Call ONLY after successful independent email-code verification.
// Never trust an email address supplied directly as proof of ownership.

import { normalizeEmail } from "./sweeties-email-policy.js";
import { registrationComplete } from "./sweeties-auth.js";

export async function findOrCreateSweetie(env, verifiedEmail) {
  const email = normalizeEmail(verifiedEmail);

  if (!email || !env?.DB)
    return { ok: false, error: "Member authentication unavailable" };

  try {
    let member = await env.DB.prepare(`
      SELECT id,display_name,suspended_at,
             sweeties_username,age_confirmed_at,
             registration_completed_at
      FROM members
      WHERE access_email=? COLLATE NOCASE
      LIMIT 1
    `).bind(email).first();

    if (!member) {
      // A pending account is NOT a completed registration.
      // The UNIQUE email index handles simultaneous first logins.
      await env.DB.prepare(`
        INSERT OR IGNORE INTO members
          (id,display_name,access_email)
        VALUES (?,?,?)
      `).bind(
        crypto.randomUUID(),
        "Pending Sweeties Registration",
        email
      ).run();

      member = await env.DB.prepare(`
        SELECT id,display_name,suspended_at,
               sweeties_username,age_confirmed_at,
               registration_completed_at
        FROM members
        WHERE access_email=? COLLATE NOCASE
        LIMIT 1
      `).bind(email).first();
    }

    if (!member || member.suspended_at)
      return { ok: false, error: "Account unavailable" };

    return {
      ok: true,
      memberId: member.id,
      registrationRequired: !registrationComplete(member),
      username: registrationComplete(member)
        ? member.sweeties_username
        : null
    };

  } catch {
    return {
      ok: false,
      error: "Member authentication temporarily unavailable"
    };
  }
}
