// Keyword-based icon resolver for free-text amenities / property features (FR).
// Shared by programs (amenities) and properties (équipements).
import {
  FiShield, FiActivity, FiDroplet, FiZap, FiWifi, FiHeart, FiUsers,
  FiSun, FiCoffee, FiHome, FiWind, FiThermometer, FiPhone, FiCheckCircle
} from 'react-icons/fi'
import { MdLocalParking, MdElevator, MdKitchen, MdWeekend, MdWhatshot } from 'react-icons/md'
import { IoLeafOutline } from 'react-icons/io5'

export function getAmenityIcon(label) {
  const s = (label || '').toLowerCase()
  if (s.includes('piscine') || s.includes('pool')) return FiDroplet
  if (s.includes('sport') || s.includes('gym') || s.includes('fitness')) return FiActivity
  if (s.includes('parking') || s.includes('garage') || s.includes('stationnement')) return MdLocalParking
  if (s.includes('ascenseur') || s.includes('elevator')) return MdElevator
  if (s.includes('jardin') || s.includes('paysag') || s.includes('espace vert') || s.includes('garden')) return IoLeafOutline
  if (s.includes('sécur') || s.includes('secur') || s.includes('gardien') || s.includes('surveillance')) return FiShield
  if (s.includes('clim')) return FiWind
  if (s.includes('chauffage') || s.includes('chaufage')) return FiThermometer
  if (s.includes('cheminée') || s.includes('cheminee')) return MdWhatshot
  if (s.includes('cuisine')) return MdKitchen
  if (s.includes('meubl')) return MdWeekend
  if (s.includes('interphone') || s.includes('digicode') || s.includes('visiophone')) return FiPhone
  if (s.includes('concierg') || s.includes('accueil') || s.includes('récept')) return FiUsers
  if (s.includes('spa') || s.includes('hammam') || s.includes('bien-être') || s.includes('wellness')) return FiHeart
  if (s.includes('recharge') || s.includes('électr') || s.includes('electr') || s.includes('borne')) return FiZap
  if (s.includes('wifi') || s.includes('fibre') || s.includes('internet')) return FiWifi
  if (s.includes('restaur') || s.includes('café') || s.includes('cafe')) return FiCoffee
  if (s.includes('balcon') || s.includes('terrasse') || s.includes('plage') || s.includes('mer') ||
      s.includes('vue') || s.includes('lumineux')) return FiSun
  if (s.includes('club') || s.includes('salle')) return FiHome
  if (s.includes('jeux') || s.includes('enfant') || s.includes('playground')) return FiUsers
  return FiCheckCircle
}
