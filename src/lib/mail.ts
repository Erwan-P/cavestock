import "server-only";

type Recipient = { email: string; name?: string };

export function hasMailConfig() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export function siteUrl(requestOrigin: string) {
  const configured = process.env.CAVESTOCK_SITE_URL;
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
      throw new Error("CAVESTOCK_SITE_URL doit utiliser HTTPS en production.");
    }
    return url.origin;
  }
  if (process.env.NODE_ENV !== "production") return requestOrigin;
  throw new Error("CAVESTOCK_SITE_URL est requis en production.");
}

export async function sendMail({ to, subject, textContent, replyTo, tag }: {
  to: Recipient; subject: string; textContent: string; replyTo?: Recipient; tag: string;
}) {
  if (!hasMailConfig()) throw new Error("Envoi de courriel non configuré.");
  let endpoint = "https://api.brevo.com/v3/smtp/email";
  // Capture locale des e-mails pour les tests ; jamais activable en production.
  if (process.env.NODE_ENV !== "production" && process.env.CAVESTOCK_MAIL_TEST_URL) {
    const testUrl = new URL(process.env.CAVESTOCK_MAIL_TEST_URL);
    if (testUrl.protocol !== "http:" || testUrl.hostname !== "127.0.0.1") throw new Error("Le transport de test doit rester local.");
    endpoint = testUrl.toString();
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL!, name: "CaveStock" },
      to: [to], subject, textContent, ...(replyTo ? { replyTo } : {}), tags: [tag],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { code?: string };
    console.error("Brevo : envoi refusé", response.status, error.code ?? "");
    throw new Error("L'envoi du courriel a échoué.");
  }
}
