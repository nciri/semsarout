/**
 * Palette de remplissage des pièces, partagée par le canevas de l'éditeur et la
 * légende de la visionneuse publique. Constante isolée dans son propre module :
 * exportée depuis un fichier de composant, elle casserait le rafraîchissement à
 * chaud (react-refresh/only-export-components).
 */
export const ROOM_FILL = {
  living: '#dbeafe',
  bedroom: '#ede9fe',
  kitchen: '#fef3c7',
  bathroom: '#cffafe',
  wc: '#e0f2fe',
  hallway: '#f3f4f6',
  balcony: '#dcfce7',
  garage: '#e5e7eb',
  other: '#f5f5f4',
}
