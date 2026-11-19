// Shirina Canada — Resend transactional verification emails.
// API credentials are read only from Cloudflare Worker secrets.

export async function sendSweetiesEmail(env, email, code) {
  if (
    typeof env?.RESEND_API_KEY !== "string" ||
    !env.RESEND_API_KEY.startsWith("re_") ||
    typeof email !== "string" ||
    !/^\d{6}$/.test(code)
  ) {
    throw new Error("Email service unavailable");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Shirina Canada <sweeties@shirina.ca>",
      to: [email],
      subject: "Your Shirina Canada verification code",
      text:
        `Welcome to Shirina Canada!\n\n` +
        `Your Sweeties verification code is: ${code}\n\n` +
        `This code expires in 10 minutes.\n\n` +
        `If you did not request this code, ignore this email.\n\n` +
        `Shirina Canada — https://shirina.ca`
    })
  });

  if (!response.ok) {
    // Do not expose API responses or credentials to visitors.
    throw new Error("Verification email delivery failed");
  }

  const result = await response.json().catch(() => null);
  if (!result?.id)
    throw new Error("Email provider did not confirm acceptance");

  return true;
}
