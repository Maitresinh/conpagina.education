# Lecture PDF

Les enseignants et administrateurs peuvent importer un PDF depuis leurs livres, une classe ou la bibliothèque publique selon leurs droits habituels. Le nom du fichier fournit le titre initial. Les EPUB restent pris en charge et l’ancienne route d’import reste disponible.

Le lecteur PDF permet de naviguer par page, zoomer, retrouver la dernière page et annoter le texte sélectionné. Sur une page scannée sans texte reconnu, « Commenter la page » crée un fil attaché à la page. Aucune reconnaissance OCR automatique n’est effectuée. Un PDF protégé par mot de passe doit être déverrouillé avant import.

Les commentaires, réponses, restrictions des classes archivées et alertes utilisent les mêmes routes et contrôles que les EPUB. Les liens d’alerte ouvrent le fil et sa page. Les positions PDF versionnées sont stockées dans les colonnes de position existantes (`pdf:page:N` pour la progression, `pdf:v1:` suivi d’un objet page/rectangles normalisés pour les annotations). Aucune migration de schéma n’est nécessaire.

PDF.js est fourni par react-pdf, verrouillé dans bun.lock. Le worker, les polices, CMaps et décodeurs sont copiés avant dev/build et servis par Conpagina. Le conteneur web doit copier le répertoire public généré. Aucun fichier n’est envoyé à un service de conversion externe.

Les fichiers servis restent soumis au contrôle d’accès et ne sont pas mis en cache publiquement. La détection des fichiers orphelins repose sur les chemins référencés par tous les documents, pour préserver les fichiers partagés entre plusieurs classes.

## Vérifications

- `bun test packages/db/tests/comment-alerts.test.ts apps/web/src/lib/pdf-location.test.ts apps/server/src/lib/document-format.test.ts`
- `bun x tsc --noEmit --pretty false -p apps/web/tsconfig.json`
- `cd apps/web && bun run build`
- Vérification navigateur : reprise sur page 2, annotation de texte, zoom 125 %, clic sur le surlignage, navigation et commentaire sur page sans texte.

Référence de la bibliothèque : https://github.com/wojtekmaj/react-pdf
