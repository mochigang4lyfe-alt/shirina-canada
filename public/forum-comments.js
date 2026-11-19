// Shirina Canada — Mochigang forum interface
// Uses existing authenticated Cloudflare Worker APIs.

(() => {
  const $ = id => document.getElementById(id);
  const root = $("mochi-discussions");

  const categories = {
    music: "covers",
    lounge: "lounge"
  };

  let category = null;
  let currentThread = null;
  let requestNumber = 0;

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = String(text);
    if (className) el.className = className;
    return el;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error ||
        `Request failed (${response.status})`);
    }

    return data;
  }

  async function submit(path, data) {
    return api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  function showError(element, error) {
    element.textContent = "🐼 " + error.message;
  }

  function showList() {
    currentThread = null;
    $("mochi-list-view").hidden = false;
    $("mochi-thread-view").hidden = true;
  }

  async function loadThreads() {
    if (!category) return;

    const ticket = ++requestNumber;
    $("mochi-status").textContent = "🐼 Loading discussions...";
    $("mochi-thread-list").replaceChildren();

    try {
      const data = await api(
        "/api/forum/threads?category=" +
        encodeURIComponent(category)
      );

      if (ticket !== requestNumber) return;

      $("mochi-status").textContent =
        data.threads.length
          ? `${data.threads.length} discussions`
          : "🐼 No discussions yet. Start the first one!";

      for (const thread of data.threads) {
        const button = node("button", undefined, "mochi-thread");
        button.type = "button";

        button.append(
          node("strong", "🐼 " + thread.title),
          node("div",
            `${thread.author} · ${thread.reply_count} replies · ${thread.created_at}`,
            "mochi-meta")
        );

        button.addEventListener("click", () => openThread(thread.id));
        $("mochi-thread-list").append(button);
      }
    } catch (error) {
      if (ticket === requestNumber)
        showError($("mochi-status"), error);
    }
  }

  async function openThread(id) {
    if (!category) return;

    const ticket = ++requestNumber;
    currentThread = id;
    $("mochi-list-view").hidden = true;
    $("mochi-thread-view").hidden = false;
    $("mochi-open-title").textContent = "Loading...";
    $("mochi-open-body").textContent = "";
    $("mochi-reply-list").replaceChildren();
    $("mochi-reply-status").textContent = "";

    try {
      const data = await api(`/api/forum/threads/${id}/replies`);
      if (ticket !== requestNumber || currentThread !== id) return;

      $("mochi-open-title").textContent = "🐼 " + data.thread.title;
      $("mochi-open-body").textContent = data.thread.body;

      // Identify the original discussion author.
      document.getElementById("mochi-thread-author")?.remove();
      const author = node(
        "div",
        "🐼 Posted by " + data.thread.author,
        "mochi-meta"
      );
      author.id = "mochi-thread-author";
      $("mochi-open-title").insertAdjacentElement("afterend", author);

      if (!data.replies.length) {
        $("mochi-reply-list").append(
          node("p", "🐼 No comments yet.")
        );
      }

      for (const reply of data.replies) {
        const article = node("article", undefined, "mochi-box");

        article.append(
          node("strong", "🐼 " + reply.author),
          node("div", reply.created_at, "mochi-meta"),
          node("p", reply.body, "mochi-message")
        );

        $("mochi-reply-list").append(article);
      }
    } catch (error) {
      if (ticket === requestNumber)
        showError($("mochi-reply-status"), error);
    }
  }

  function navigate() {
    const slug = location.hash.replace(/^#\/?/, "").split("/")[0];
    category = categories[slug] || null;
    ++requestNumber;

    root.hidden = !category;
    showList();

    if (category) loadThreads();
  }

  $("mochi-back").addEventListener("click", () => {
    ++requestNumber;
    showList();
    loadThreads();
  });

  $("mochi-new-thread").addEventListener("submit", async event => {
    event.preventDefault();
    if (!category) return;

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
      await submit("/api/forum/threads", {
        category,
        title: $("mochi-title").value,
        body: $("mochi-body").value
      });

      form.reset();
      await loadThreads();
      $("mochi-status").textContent =
        "🐼 Discussion published successfully!";
    } catch (error) {
      showError($("mochi-status"), error);
    } finally {
      button.disabled = false;
    }
  });

  $("mochi-new-reply").addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentThread) return;

    const id = currentThread;
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
      await submit(`/api/forum/threads/${id}/replies`, {
        body: $("mochi-reply-body").value
      });

      form.reset();
      await openThread(id);
      $("mochi-reply-status").textContent =
        "🐼 Comment published successfully!";
    } catch (error) {
      showError($("mochi-reply-status"), error);
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener("hashchange", navigate);
  navigate();
})();
