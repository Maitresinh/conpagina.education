import { renderAlertEmail } from "../packages/api/src/lib/alert-content";

const email = renderAlertEmail([{
  author: "Camille (exemple fictif)", book: "Un roman — démonstration", group: "Classe de lecture",
  createdAt: new Date("2026-11-25T15:00:00Z"),
  quote: "La ville semblait familière, mais aucun des chemins ne conduisait à la maison.",
  comment: "Ce passage me surprend : le personnage reconnaît le décor, mais il ne peut plus s’y orienter.\n\nEst-ce une façon de montrer que son monde a changé, ou est-ce lui qui voit les choses autrement ?",
  documentId: "demonstration", threadId: "discussion-exemple",
}], "https://education.conpagina.fr");
const output = process.argv[2] || "comment-alert-preview.html";
await Bun.write(output, email.html);
console.log(`Preview written: ${output}`);
