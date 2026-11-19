// Shirina Canada — forum discussion API
// Read-only foundation. Posting requires a separate authenticated implementation.

const respond = (data, status = 200) => new Response(
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

export async function handleForum(request, env) {
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return respond({ error: "Method not allowed" }, 405);
  }

  if (!env.DB) {
    return respond({ error: "Forum database unavailable" }, 503);
  }

  try {
    if (url.pathname === "/api/forum/threads") {
      const category = url.searchParams.get("category");

      if (category && !["covers", "requests", "lounge", "local"].includes(category)) {
        return respond({ error: "Invalid category" }, 400);
      }

      const sql = `
        SELECT t.id, t.title, t.body, t.category,
               t.province_code, t.city_id, t.created_at,
               COALESCE(NULLIF(m.sweeties_username, ''), 'Sweetie') AS author,
               (SELECT COUNT(*) FROM replies r
                WHERE r.thread_id = t.id AND r.hidden = 0) AS reply_count
        FROM threads t
        JOIN members m ON m.id = t.member_id
        WHERE t.hidden = 0
          AND (? IS NULL OR t.category = ?)
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 50
      `;

      const result = await env.DB.prepare(sql)
        .bind(category, category)
        .all();

      return respond({ threads: result.results || [] });
    }

    const match = url.pathname.match(
      /^\/api\/forum\/threads\/([1-9]\d*)\/replies$/
    );

    if (match) {
      const threadId = Number(match[1]);

      if (!Number.isSafeInteger(threadId)) {
        return respond({ error: "Invalid thread" }, 400);
      }

      const thread = await env.DB.prepare(
        `SELECT t.id, t.title, t.body, t.category, t.created_at,
                COALESCE(NULLIF(m.sweeties_username, ''), 'Sweetie') AS author
         FROM threads t
         JOIN members m ON m.id = t.member_id
         WHERE t.id = ? AND t.hidden = 0`
      ).bind(threadId).first();

      if (!thread) {
        return respond({ error: "Thread not found" }, 404);
      }

      const result = await env.DB.prepare(
        `SELECT r.id, r.body, r.created_at,
                COALESCE(NULLIF(m.sweeties_username, ''), 'Sweetie') AS author
         FROM replies r
         JOIN members m ON m.id = r.member_id
         WHERE r.thread_id = ? AND r.hidden = 0
         ORDER BY r.created_at ASC, r.id ASC
         LIMIT 100`
      ).bind(threadId).all();

      return respond({
        thread,
        replies: result.results || []
      });
    }

    return respond({ error: "Not found" }, 404);

  } catch {
    return respond({ error: "Forum temporarily unavailable" }, 503);
  }
}
