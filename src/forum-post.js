// Shirina Canada / Mochigang — authenticated forum posting.
// The Worker MUST pass an email verified from a valid Cloudflare Access JWT.
// This module refuses requests without that verified identity.

const json = (data, status = 200) => new Response(
  JSON.stringify(data),
  {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  }
);

const categories = new Set(["covers", "requests", "lounge", "local"]);

async function readInput(request, url) {
  if (request.headers.get("Origin") !== url.origin)
    return { error: "Invalid origin", status: 403 };

  if (!/^application\/json(?:\s*;|$)/i.test(
    request.headers.get("Content-Type") || ""
  )) return { error: "JSON required", status: 415 };

  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > 12000)
    return { error: "Request too large", status: 413 };

  let text;
  try { text = await request.text(); }
  catch { return { error: "Unreadable request", status: 400 }; }

  if (new TextEncoder().encode(text).length > 12000)
    return { error: "Request too large", status: 413 };

  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Invalid object");
    return { data };
  } catch {
    return { error: "Invalid JSON", status: 400 };
  }
}

function clean(value, max) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))
    return null;
  return text;
}

async function getMember(env, session) {
  if (!session || typeof session.member_id !== "string")
    return null;

  const member = await env.DB.prepare(
    `SELECT id, suspended_at, sweeties_username,
            age_confirmed_at, registration_completed_at
     FROM members
     WHERE id=?
     LIMIT 1`
  ).bind(session.member_id).first();

  if (!member || member.suspended_at ||
      !member.sweeties_username ||
      !member.age_confirmed_at ||
      !member.registration_completed_at)
    return null;

  return member;
}

export async function handleForumPost(request, env, verifiedSession) {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  if (!verifiedSession?.member_id)
    return json({ error: "Sweeties login required" }, 401);

  if (!env.DB)
    return json({ error: "Database unavailable" }, 503);

  const url = new URL(request.url);
  const input = await readInput(request, url);
  if (input.error)
    return json({ error: input.error }, input.status);

  try {
    const member = await getMember(env, verifiedSession);
    if (!member)
      return json({ error: "Membership unavailable or suspended" }, 403);

    if (url.pathname === "/api/forum/threads") {
      const title = clean(input.data.title, 160);
      const body = clean(input.data.body, 5000);
      const category = input.data.category;

      if (!title || !body || !categories.has(category))
        return json({ error: "Invalid discussion" }, 400);

      // Geographic boards require separate verified location handling.
      // Do not allow invented or mismatched city identifiers here.
      if (category === "local")
        return json({ error: "Local posting is not yet enabled" }, 422);

      const recent = await env.DB.prepare(
        `SELECT id FROM threads
         WHERE member_id=? AND created_at > datetime('now','-60 seconds')
         LIMIT 1`
      ).bind(member.id).first();

      if (recent)
        return json({ error: "Please wait before starting another thread" }, 429);

      const result = await env.DB.prepare(
        `INSERT INTO threads(member_id,category,title,body)
         VALUES(?,?,?,?)`
      ).bind(member.id, category, title, body).run();

      return json({ ok: true, id: result.meta.last_row_id }, 201);
    }

    const match = url.pathname.match(
      /^\/api\/forum\/threads\/([1-9]\d*)\/replies$/
    );

    if (!match)
      return json({ error: "Not found" }, 404);

    const threadId = Number(match[1]);
    const body = clean(input.data.body, 5000);

    if (!Number.isSafeInteger(threadId) || !body)
      return json({ error: "Invalid reply" }, 400);

    const recent = await env.DB.prepare(
      `SELECT id FROM replies
       WHERE member_id=? AND created_at > datetime('now','-30 seconds')
       LIMIT 1`
    ).bind(member.id).first();

    if (recent)
      return json({ error: "Please wait before posting again" }, 429);

    // The thread conditions are evaluated during insertion.
    const result = await env.DB.prepare(
      `INSERT INTO replies(thread_id,member_id,body)
       SELECT id,?,? FROM threads
       WHERE id=? AND hidden=0 AND locked=0`
    ).bind(member.id, body, threadId).run();

    if (result.meta.changes !== 1)
      return json({ error: "Thread unavailable or locked" }, 404);

    return json({ ok: true, id: result.meta.last_row_id }, 201);

  } catch {
    return json({ error: "Unable to save forum post" }, 503);
  }
}
