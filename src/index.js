
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

function decode64url(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function verifiedAccessEmail(request, env) {
  // Fail closed until the Access application is explicitly configured.
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))
    return null;

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(decode64url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode64url(parts[1])));

    if (header.alg !== "RS256" || !header.kid) return null;
    if (claims.iss !== env.ACCESS_TEAM_DOMAIN) return null;
    if (!Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD))
      return null;

    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(claims.exp) || claims.exp <= now) return null;
    if (!Number.isFinite(claims.iat) || claims.iat > now + 60) return null;
    if (!claims.email || typeof claims.email !== "string") return null;

    const response = await fetch(
      env.ACCESS_TEAM_DOMAIN + "/cdn-cgi/access/certs"
    );
    if (!response.ok) return null;
    const certs = await response.json();
    const jwk = certs.keys?.find(k => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["verify"]
    );
    const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, decode64url(parts[2]), signed
    );
    return valid ? claims.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/announcements") {
      if (url.pathname.startsWith("/api/"))
        return json({ error: "Not found" }, 404);
      return env.ASSETS.fetch(request);
    }

    if (request.method === "GET") {
      try {
        const result = await env.DB.prepare(
          `SELECT id,title,body,created_at,pinned
           FROM announcements WHERE published=1
           ORDER BY pinned DESC,created_at DESC,id DESC LIMIT 20`
        ).all();
        return json({ announcements: result.results || [] });
      } catch {
        return json({ error: "Announcements unavailable" }, 503);
      }
    }

    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);

    const email = await verifiedAccessEmail(request, env);
    if (!email) return json({ error: "Forbidden" }, 403);

    // Application-level authorization, separate from site viewing access.
    const admin = await env.DB.prepare(
      "SELECT id FROM admins WHERE lower(email)=? AND active=1 LIMIT 1"
    ).bind(email).first();
    if (!admin) return json({ error: "Forbidden" }, 403);

    if (!request.headers.get("Content-Type")?.toLowerCase()
      .startsWith("application/json"))
      return json({ error: "JSON required" }, 415);

    if (Number(request.headers.get("Content-Length")) > 12000)
      return json({ error: "Request too large" }, 413);

    if (request.headers.get("Origin") !== url.origin)
      return json({ error: "Invalid origin" }, 403);

    let input;
    try { input = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    const title = typeof input.title === "string" ? input.title.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";

    if (!title || title.length > 160 || !body || body.length > 5000)
      return json({ error: "Invalid announcement" }, 400);

    try {
      const result = await env.DB.prepare(
        "INSERT INTO announcements(admin_id,title,body) VALUES (?,?,?)"
      ).bind(admin.id,title,body).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    } catch {
      return json({ error: "Unable to publish" }, 500);
    }
  }
};
