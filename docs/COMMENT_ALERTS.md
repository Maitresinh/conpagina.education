# Alertes de lecture

La page `/dashboard/notifications`, accessible dans le menu du compte sous
« Alertes de lecture », permet de choisir :

- aucun courriel, un envoi à chaque commentaire, ou un récapitulatif à 9 h, heure de Paris ;
- les nouveaux commentaires, les réponses, ou les deux ;
- toutes les classes et clubs du compte, ou une sélection.

Les courriels sont désactivés par défaut pour chaque compte. Aucun abonnement
automatique des élèves. La cloche reçoit les commentaires de groupe. Les
surlignages sans commentaire, annotations privées et propres commentaires sont exclus.
Un premier commentaire ajouté à un surlignage déclenche une alerte ; corriger un
commentaire existant ne déclenche pas une nouvelle alerte.

Chaque courriel contient le commentaire intégral, le passage cité, l’auteur,
le livre, la classe et la date. Les réponses incluent aussi le commentaire parent.
« ↩ Répondre » ouvre la discussion après connexion si nécessaire ; ce n’est pas
une réponse par retour de courriel. « 📖 Ouvrir le livre » et « ⚙ Régler ou
désactiver les alertes » complètent les actions. Le HTML et le texte brut sont fournis.

## Déploiement

1. Sauvegarder la base et vérifier la version déployée avant de mettre à jour.
2. Installer avec Bun 1.3.5 et `bun install --frozen-lockfile`.
3. Appliquer **uniquement** la migration `packages/db/src/migrations/0010_comment_alerts.sql`
   dans une transaction PostgreSQL si la production utilise déjà `db:push`.
   Sinon, après vérification du journal Drizzle, utiliser le processus de migration
   habituel. Ne pas relancer aveuglément toutes les migrations historiques : le
   schéma existant contient des changements non présents dans le dernier snapshot.
4. Vérifier `APP_URL=https://education.conpagina.fr`, `RESEND_API_KEY` et `EMAIL_FROM`
   (domaine d’envoi validé chez Resend). Ne jamais les inclure dans les logs.
5. Déployer le serveur et l’interface. Le worker reste arrêté tant que
   `COMMENT_ALERTS_ENABLED` n’est pas `true`.
6. Activer le worker et choisir les préférences depuis le compte enseignant.
7. Sur un groupe de test, vérifier un commentaire et une réponse, réception réelle
   dans la boîte, contenu complet, bouton après déconnexion, désactivation et digest.

L’envoi est asynchrone (vérification toutes les 15 secondes). La file est enregistrée
dans la même transaction que l’annotation. Les accès et préférences sont revérifiés
avant chaque tentative. Le contenu de la première tentative est figé uniquement
pour permettre une reprise identique chez le fournisseur ; il est effacé de la file
après envoi, annulation ou échec définitif. Les journaux ne contiennent pas les commentaires.

Un verrou de ligne puis un bail de cinq minutes empêchent deux workers d’envoyer
simultanément. Une clé d’idempotence Resend stable couvre les interruptions après
envoi. Les tentatives cessent au bout de 23 heures après la première tentative
pour rester dans la fenêtre de déduplication de 24 heures. Un échec reste visible
dans `comment_alert_delivery` et dans l’état de la dernière alerte du compte.
Le statut « sent » signifie accepté par Resend, pas reçu dans la boîte du destinataire.

Une modification de fréquence reprogramme les alertes qui n’ont pas encore fait
l’objet d’une tentative. Une tentative dont le résultat est incertain est annulée
en cas de changement de fréquence, afin d’éviter un renvoi avec une autre clé.

En cas de retour arrière, remettre `COMMENT_ALERTS_ENABLED=false` et redéployer
la version précédente. Conserver les tables de file et préférences.

## Validation locale

`bun test packages/db/tests/comment-alerts.test.ts` utilise PostgreSQL embarqué,
des comptes fictifs et un transport simulé. Aucun courriel réel n’est envoyé.

`bun scripts/preview-comment-email.ts /chemin/apercu.html` produit un aperçu
avec un commentaire fictif.
