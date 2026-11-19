// Shirina Canada — Sweeties email verification policy.
// Utilities only. No email is sent and no API is exposed.

export const EMAIL_CODE_TTL_SECONDS = 600;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODE_REQUESTS_PER_HOUR = 3;
export const SESSION_TTL_SECONDS = 604800;

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();

  if (
    email.length > 254 ||
    email.length < 3 ||
    /[\s\u0000-\u001F\u007F]/.test(email)
  ) return null;

  const at = email.indexOf("@");

  if (at < 1 || at !== email.lastIndexOf("@")) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (local.length > 64 || !domain.includes(".")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (domain.length > 253) return null;

  const labels = domain.split(".");
  if (labels.some(label =>
    !label ||
    label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) return null;

  return email;
}

export function codeIsUsable(record, nowSeconds) {
  return !!(
    record &&
    Number.isSafeInteger(nowSeconds) &&
    record.consumed_at == null &&
    Number.isSafeInteger(record.expires_at) &&
    record.expires_at > nowSeconds &&
    Number.isInteger(record.attempts) &&
    record.attempts >= 0 &&
    record.attempts < MAX_CODE_ATTEMPTS
  );
}

export function sessionIsUsable(record, nowSeconds) {
  return !!(
    record &&
    Number.isSafeInteger(nowSeconds) &&
    record.revoked_at == null &&
    Number.isSafeInteger(record.expires_at) &&
    record.expires_at > nowSeconds
  );
}

export function secureSessionCookie(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid session token");

  return [
    "__Host-sweeties_session=" + token,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=" + SESSION_TTL_SECONDS
  ].join("; ");
}

export function clearSessionCookie() {
  return [
    "__Host-sweeties_session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}
