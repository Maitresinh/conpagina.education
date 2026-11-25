export type AlertPreferences = {
  emailFrequency: "off" | "immediate" | "daily";
  newComments: boolean;
  replies: boolean;
  groupIds: string[];
};

export const defaultAlertPreferences: AlertPreferences = {
  emailFrequency: "off", newComments: true, replies: true, groupIds: [],
};

export function wantsAlert(p: AlertPreferences, groupId: string, isReply: boolean) {
  return p.emailFrequency !== "off" && (isReply ? p.replies : p.newComments) &&
    (p.groupIds.length === 0 || p.groupIds.includes(groupId));
}

// Next 09:00 in Europe/Paris, including daylight-saving changes.
export function nextDigestAt(now: Date): Date {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let minutes = 1; minutes <= 26 * 60; minutes++) {
    const candidate = new Date(Math.floor(now.getTime() / 60000) * 60000 + minutes * 60000);
    const time = formatter.format(candidate);
    if (time === "09:00") return candidate;
  }
  throw new Error("Cannot calculate digest time");
}

export type AlertEntry = {
  author: string; book: string; group: string; createdAt: Date;
  quote: string; comment: string; parentComment?: string | null;
  documentId: string; threadId: string;
};

export function applicationOrigin(value: string | undefined) {
  if (!value) throw new Error("APP_URL is required for comment alerts");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("APP_URL must use HTTPS");
  }
  return url.origin;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function renderAlertEmail(entries: AlertEntry[], origin: string) {
  origin = applicationOrigin(origin);
  const settings = `${origin}/dashboard/notifications`;
  const text: string[] = ["Conpagina — commentaires de lecture", ""];
  const cards = entries.map(entry => {
    const url = `${origin}/read/${encodeURIComponent(entry.documentId)}?annotation=${encodeURIComponent(entry.threadId)}`;
    const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(entry.createdAt);
    text.push(`${entry.author} — ${entry.book} (${entry.group})`, date, "Passage cité :", entry.quote,
      ...(entry.parentComment ? ["En réponse à :", entry.parentComment] : []),
      "Commentaire :", entry.comment, `↩ Répondre : ${url}`, `📖 Ouvrir le livre : ${origin}/read/${encodeURIComponent(entry.documentId)}`, "");
    const escaped = (s: string) => escapeHtml(s);
    return `<article style="border:1px solid #d7dce5;border-radius:12px;padding:24px;margin:20px 0">
      <h2 style="font-size:20px;margin:0 0 8px">${escaped(entry.book)}</h2>
      <p>${escaped(entry.author)} · ${escaped(entry.group)} · ${escaped(date)}</p>
      <h3>Passage cité</h3><blockquote style="border-left:4px solid #6366f1;margin:12px 0;padding:12px;background:#f5f5ff;white-space:pre-wrap;overflow-wrap:anywhere">${escaped(entry.quote)}</blockquote>
      ${entry.parentComment ? `<h3>En réponse à</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escaped(entry.parentComment)}</p>` : ""}
      <h3>Commentaire</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escaped(entry.comment)}</p>
      <p style="margin-top:24px"><a href="${escaped(url)}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;border-radius:8px;padding:14px 20px">↩ Répondre</a>
      <a href="${escaped(`${origin}/read/${encodeURIComponent(entry.documentId)}`)}" style="display:inline-block;padding:14px;color:#4338ca">📖 Ouvrir le livre</a></p></article>`;
  }).join("");
  text.push(`⚙ Régler ou désactiver les alertes : ${settings}`, "Le bouton Répondre ouvre la discussion sur Conpagina. Ne répondez pas directement à ce courriel.");
  return {
    subject: entries.length === 1 ? `Conpagina — ${entries[0]!.author} a commenté ${entries[0]!.book}` : `Conpagina — ${entries.length} nouveaux commentaires`,
    text: text.join("\n"),
    html: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commentaires de lecture — Conpagina</title></head><body style="background:#f8fafc;color:#172033;font:16px/1.6 Arial,sans-serif;margin:0"><main style="max-width:680px;margin:auto;padding:24px"><h1 style="font-size:24px">📚 Vos commentaires de lecture</h1>${cards}<p><a href="${escapeHtml(settings)}">⚙ Régler ou désactiver les alertes</a></p><p style="font-size:13px;color:#64748b">Le bouton Répondre ouvre la discussion sur Conpagina. Ne répondez pas directement à ce courriel.</p></main></body></html>`,
  };
}
