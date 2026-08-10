// Centroïdes approximatifs des principales villes marocaines, pour le positionnement
// niveau-ville des annonces sur la carte (jamais d'adresse exacte — cf. confidentialité
// géo actée dans services/coloc-listing/app/models.py).
// [latitude, longitude]
export const MOROCCO_CITY_CENTROIDS = {
  Casablanca: [33.5731, -7.5898],
  Rabat: [34.0209, -6.8416],
  Marrakech: [31.6295, -7.9811],
  Tanger: [35.7595, -5.834],
  Agadir: [30.4278, -9.5981],
  Fès: [34.0331, -5.0003],
  Fes: [34.0331, -5.0003],
  Meknès: [33.8935, -5.5473],
  Meknes: [33.8935, -5.5473],
  Oujda: [34.6814, -1.9086],
  Kénitra: [34.261, -6.5802],
  Kenitra: [34.261, -6.5802],
  Tétouan: [35.5785, -5.3684],
  Tetouan: [35.5785, -5.3684],
  Khouribga: [32.8811, -6.9063],
  'El Jadida': [33.2549, -8.5058],
  Safi: [32.2994, -9.2372],
  Nador: [35.1681, -2.9287],
  'Béni Mellal': [32.3373, -6.3498],
  'Beni Mellal': [32.3373, -6.3498],
  Errachidia: [31.9314, -4.4241],
  Essaouira: [31.5085, -9.7595],
  Ifrane: [33.5228, -5.1106],
}

// Centre du Maroc — fallback si la ville d'une annonce n'est pas référencée ci-dessus,
// et centre par défaut de la carte.
export const MOROCCO_CENTER = [31.7917, -7.0926]
export const MOROCCO_DEFAULT_ZOOM = 6

export function cityCentroid(cityName) {
  if (!cityName) return MOROCCO_CENTER
  return MOROCCO_CITY_CENTROIDS[cityName.trim()] ?? MOROCCO_CENTER
}
