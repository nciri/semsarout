/**
 * Garde-fou de taille du pré-cache du service worker (PWA).
 *
 * Workbox n'a PAS d'option pour rendre sa limite bloquante : au-dessus de
 * `maximumFileSizeToCacheInBytes`, `maximum-size-transform.js` se contente
 * d'empiler un avertissement et RETIRE silencieusement le fichier du
 * manifeste de pré-cache. Concrètement : la CI reste verte, `sw.js` est
 * généré, et l'application cesse simplement de démarrer hors ligne — le seul
 * indice étant une ligne de log noyée dans la sortie du build.
 *
 * On inverse donc la mécanique dans `vite.config.js` : la limite Workbox est
 * neutralisée (rien n'est jamais filtré) et c'est `assertPrecacheSizes`, posée
 * en `manifestTransforms`, qui applique la vraie limite en LEVANT une erreur.
 * Un fragment trop gros fait alors échouer `npm run build`, donc la CI.
 */

// Limite par défaut de Workbox, reprise telle quelle : c'est le seuil au-delà
// duquel un fichier ne serait pas pré-caché. Le jour où un fragment le dépasse,
// c'est le fragment qu'il faut redécouper (voir le `lazy()` des routes dans
// `src/App.jsx`), pas cette constante qu'il faut remonter.
export const PRECACHE_MAX_BYTES = 2 * 1024 * 1024

// Valeur passée à Workbox pour désactiver son filtrage silencieux. Volontairement
// finie (et non `Infinity`) : le schéma d'options de workbox-build attend un nombre.
export const WORKBOX_NO_SIZE_FILTER = Number.MAX_SAFE_INTEGER

/**
 * `manifestTransforms` Workbox : laisse le manifeste intact, mais lève si un
 * fichier dépasse la limite. Les entrées sans `size` connue sont ignorées
 * (Workbox les renseigne toujours pour les fichiers du build).
 *
 * @param {{url: string, size?: number}[]} manifest
 * @returns {{manifest: unknown[]}} le manifeste inchangé, si tout tient
 */
export function assertPrecacheSizes(manifest) {
  const tooBig = (manifest || []).filter((entry) => (entry?.size ?? 0) > PRECACHE_MAX_BYTES)
  if (tooBig.length > 0) {
    const details = tooBig
      .map((entry) => `${entry.url} (${(entry.size / 1024 / 1024).toFixed(2)} Mio)`)
      .join(', ')
    throw new Error(
      `Pré-cache PWA : ${tooBig.length} fichier(s) au-dessus de la limite de ` +
        `${PRECACHE_MAX_BYTES / 1024 / 1024} Mio — ${details}. ` +
        `Sans cette erreur, Workbox les exclurait du pré-cache et l'application ` +
        `ne démarrerait plus hors ligne. Redécoupe le fragment fautif ` +
        `(import dynamique) au lieu de relever la limite.`
    )
  }
  return { manifest }
}
