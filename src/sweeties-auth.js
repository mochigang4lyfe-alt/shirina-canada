// Shirina Canada — Sweeties authentication utilities.
// No public authentication endpoints are enabled by this module.

const encoder = new TextEncoder();

export function generateEmailCode() {
  const random = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / 1000000) * 1000000;
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return String(random[0] % 1000000).padStart(6, "0");
}

export function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(token)
  );
  return Array.from(new Uint8Array(digest),
    b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashEmailCode(email, code, secret) {
  if (!secret) throw new Error("Email-code secret not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(email.trim().toLowerCase() + ":" + code)
  );

  return Array.from(new Uint8Array(digest),
    b => b.toString(16).padStart(2, "0")).join("");
}

export function validSweetiesUsername(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{3,24}$/.test(value);
}

export function registrationComplete(member) {
  return !!(
    member &&
    !member.suspended_at &&
    member.sweeties_username &&
    member.age_confirmed_at &&
    member.registration_completed_at
  );
}
