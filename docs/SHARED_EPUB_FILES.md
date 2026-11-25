# Retrait des livres partageant un EPUB

`copyToGroup` et la bibliothèque publique créent plusieurs documents qui peuvent
référencer le même fichier EPUB. Retirer un livre d'une classe ou supprimer une
copie personnelle conserve désormais ce fichier. Les autres copies et leurs
annotations restent disponibles.

Le retrait supprime toujours le document sélectionné et ses propres annotations,
conformément aux relations de la base. Il ne libère plus automatiquement d'espace
physique. Le compteur de stockage du propriétaire conserve son comportement
actuel, fondé sur les références de documents.

Les fichiers devenus sans référence doivent faire l'objet d'un nettoyage séparé,
avec sauvegarde et vérification de toutes les références. Aucun nettoyage
automatique des fichiers n'est ajouté par cette correction.

La restauration d'un fichier déjà manquant nécessite de remettre un EPUB validé
au chemin enregistré dans les documents concernés. Réimporter le livre dans une
nouvelle classe ne répare pas les anciennes références.
