// Shirina Canada — mandatory Sweeties registration.
// Requires an independently authenticated Sweeties session.
// This module does not expose public routes.

import {
  validSweetiesUsername,
  registrationComplete
} from "./sweeties-auth.js";

export async function registerSweetie(env, session, input) {
  if (!env?.DB || !session?.member_id) {
    return { ok: false, status: 401, error: "Login required" };
  }

  if (!input || typeof input !== "object" ||
      Array.isArray(input)) {
    return { ok: false, status: 400, error: "Invalid registration" };
  }

  const username = input.username;

  if (!validSweetiesUsername(username)) {
    return {
      ok: false,
      status: 400,
      error: "Username must be 3-24 characters: letters, numbers, underscores or hyphens"
    };
  }

  // Age is self-declared, not independently verified.
  // The user must explicitly confirm 13+.
  if (input.age13Confirmed !== true) {
    return {
      ok: false,
      status: 400,
      error: "You must confirm you are at least 13"
    };
  }

  try {
    const member = await env.DB.prepare(`
      SELECT id, suspended_at, sweeties_username,
             age_confirmed_at, registration_completed_at
      FROM members WHERE id=? LIMIT 1
    `).bind(session.member_id).first();

    if (!member || member.suspended_at) {
      return {
        ok: false,
        status: 403,
        error: "Account unavailable"
      };
    }

    if (registrationComplete(member)) {
      return {
        ok: false,
        status: 409,
        error: "Registration already completed"
      };
    }

    // A single conditional UPDATE prevents concurrent registrations
    // from changing an account after completion.
    // The unique database index prevents username duplication.
    const result = await env.DB.prepare(`
      UPDATE members
      SET sweeties_username=?,
          display_name=?,
          age_confirmed_at=CURRENT_TIMESTAMP,
          registration_completed_at=CURRENT_TIMESTAMP
      WHERE id=?
        AND suspended_at IS NULL
        AND registration_completed_at IS NULL
    `).bind(username, username, session.member_id).run();

    if (result.meta?.changes !== 1) {
      return {
        ok: false,
        status: 409,
        error: "Registration unavailable or already completed"
      };
    }

    return {
      ok: true,
      username,
      registrationComplete: true
    };

  } catch (error) {
    // SQLite unique-constraint errors may differ by driver.
    // Never expose SQL statements or database details.
    if (/unique constraint|sqlite_constraint_unique/i.test(
      String(error?.message || "")
    )) {
      return {
        ok: false,
        status: 409,
        error: "That Sweeties Username is already taken"
      };
    }

    return {
      ok: false,
      status: 503,
      error: "Registration temporarily unavailable"
    };
  }
}
