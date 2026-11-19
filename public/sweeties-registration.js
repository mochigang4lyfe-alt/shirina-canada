// Sweeties login and registration interface.
// Remains dormant until the backend is connected.

(() => {
  const $ = id => document.getElementById(id);
  const gate = $("sweeties-gate");
  const emailStep = $("sweeties-email-step");
  const codeStep = $("sweeties-code-step");
  const profileStep = $("sweeties-profile-step");
  const message = $("sweeties-message");

  let email = "";

  function show(step) {
    for (const form of [emailStep, codeStep, profileStep])
      form.hidden = form !== step;
    message.textContent = "";
    gate.hidden = false;
    step.querySelector("input")?.focus();
  }

  async function api(path, data) {
    const options = {
      credentials: "same-origin",
      cache: "no-store"
    };

    if (data !== undefined) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(data);
    }

    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));

    if (!response.ok)
      throw new Error(body.error || "Request failed");

    return body;
  }

  async function submit(form, action) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = "🐼 Processing...";

    try {
      await action();
    } catch (error) {
      message.textContent = "🐼 " + error.message;
    } finally {
      button.disabled = false;
    }
  }

  emailStep.addEventListener("submit", event => {
    event.preventDefault();
    submit(emailStep, async () => {
      email = $("sweeties-email").value.trim();
      await api("/api/sweeties/request-code", { email });
      show(codeStep);
      message.textContent = "Check your email for your verification code.";
    });
  });

  codeStep.addEventListener("submit", event => {
    event.preventDefault();
    submit(codeStep, async () => {
      const result = await api("/api/sweeties/verify-code", {
        email,
        code: $("sweeties-code").value
      });

      if (result.registrationRequired) {
        show(profileStep);
      } else {
        gate.hidden = true;
        location.reload();
      }
    });
  });

  profileStep.addEventListener("submit", event => {
    event.preventDefault();
    submit(profileStep, async () => {
      await api("/api/sweeties/register", {
        username: $("sweeties-username").value,
        age13Confirmed: $("sweeties-age").checked
      });
      gate.hidden = true;
      location.reload();
    });
  });

  // Explicitly activated after backend integration.
  window.activateSweetiesRegistration = async () => {
    try {
      const status = await api("/api/sweeties/me");

      if (status.registrationRequired)
        show(profileStep);
      else
        gate.hidden = true;
    } catch {
      show(emailStep);
    }
  };
  // Activate mandatory login and registration when the page loads.
  // Authentication and forum permissions are enforced by the Worker.
  window.addEventListener("DOMContentLoaded", () => {
    window.activateSweetiesRegistration();
  });

})();
