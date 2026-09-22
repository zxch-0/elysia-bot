/**
 * Conversions d'unités (commande `/convertir`).
 * Chaque unité possède : un facteur vers l'unité de base de sa catégorie,
 * un libellé lisible et son symbole.
 */

export interface UnitDefinition {
  /** Identifiant utilisé dans les options de la commande. */
  id: string;
  category: UnitCategory;
  label: string;
  symbol: string;
  /** Combien d'unités de base vaut 1 unité de ce type. */
  factor: number;
  /** Conversion affine (températures) : valeur de base = valeur * factor + offset. */
  offset?: number;
}

export type UnitCategory = 'longueur' | 'masse' | 'temperature' | 'volume' | 'vitesse' | 'donnees' | 'duree' | 'surface';

export const UNIT_CATEGORIES: Record<UnitCategory, { label: string; emoji: string; base: string }> = {
  longueur: { label: 'Longueurs', emoji: '📏', base: 'm' },
  masse: { label: 'Masses', emoji: '⚖️', base: 'kg' },
  temperature: { label: 'Températures', emoji: '🌡️', base: '°C' },
  volume: { label: 'Volumes', emoji: '🧪', base: 'L' },
  vitesse: { label: 'Vitesses', emoji: '🏎️', base: 'm/s' },
  donnees: { label: 'Données informatiques', emoji: '💾', base: 'o' },
  duree: { label: 'Durées', emoji: '⏱️', base: 's' },
  surface: { label: 'Surfaces', emoji: '🗺️', base: 'm²' },
};

export const UNITS: UnitDefinition[] = [
  // Longueurs (base : mètre)
  { id: 'km', category: 'longueur', label: 'Kilomètres', symbol: 'km', factor: 1000 },
  { id: 'm', category: 'longueur', label: 'Mètres', symbol: 'm', factor: 1 },
  { id: 'cm', category: 'longueur', label: 'Centimètres', symbol: 'cm', factor: 0.01 },
  { id: 'mm', category: 'longueur', label: 'Millimètres', symbol: 'mm', factor: 0.001 },
  { id: 'mi', category: 'longueur', label: 'Miles', symbol: 'mi', factor: 1609.344 },
  { id: 'yd', category: 'longueur', label: 'Yards', symbol: 'yd', factor: 0.9144 },
  { id: 'ft', category: 'longueur', label: 'Pieds', symbol: 'ft', factor: 0.3048 },
  { id: 'in', category: 'longueur', label: 'Pouces', symbol: 'in', factor: 0.0254 },
  { id: 'nmi', category: 'longueur', label: 'Milles marins', symbol: 'M', factor: 1852 },

  // Masses (base : kilogramme)
  { id: 't', category: 'masse', label: 'Tonnes', symbol: 't', factor: 1000 },
  { id: 'kg', category: 'masse', label: 'Kilogrammes', symbol: 'kg', factor: 1 },
  { id: 'g', category: 'masse', label: 'Grammes', symbol: 'g', factor: 0.001 },
  { id: 'mg', category: 'masse', label: 'Milligrammes', symbol: 'mg', factor: 1e-6 },
  { id: 'lb', category: 'masse', label: 'Livres', symbol: 'lb', factor: 0.45359237 },
  { id: 'oz', category: 'masse', label: 'Onces', symbol: 'oz', factor: 0.028349523125 },

  // Températures (base : °C, conversion affine)
  { id: 'c', category: 'temperature', label: 'Celsius', symbol: '°C', factor: 1 },
  { id: 'f', category: 'temperature', label: 'Fahrenheit', symbol: '°F', factor: 5 / 9, offset: -32 * (5 / 9) },
  { id: 'k', category: 'temperature', label: 'Kelvin', symbol: 'K', factor: 1, offset: -273.15 },

  // Volumes (base : litre)
  { id: 'l', category: 'volume', label: 'Litres', symbol: 'L', factor: 1 },
  { id: 'ml', category: 'volume', label: 'Millilitres', symbol: 'mL', factor: 0.001 },
  { id: 'cl', category: 'volume', label: 'Centilitres', symbol: 'cL', factor: 0.01 },
  { id: 'm3', category: 'volume', label: 'Mètres cubes', symbol: 'm³', factor: 1000 },
  { id: 'gal', category: 'volume', label: 'Gallons US', symbol: 'gal', factor: 3.785411784 },
  { id: 'pinte', category: 'volume', label: 'Pintes US', symbol: 'pt', factor: 0.473176473 },

  // Vitesses (base : m/s)
  { id: 'ms', category: 'vitesse', label: 'Mètres par seconde', symbol: 'm/s', factor: 1 },
  { id: 'kmh', category: 'vitesse', label: 'Kilomètres par heure', symbol: 'km/h', factor: 1 / 3.6 },
  { id: 'mph', category: 'vitesse', label: 'Miles par heure', symbol: 'mph', factor: 0.44704 },
  { id: 'kn', category: 'vitesse', label: 'Nœuds', symbol: 'kn', factor: 0.514444 },
  { id: 'mach', category: 'vitesse', label: 'Mach (air, 15 °C)', symbol: 'Ma', factor: 340.3 },

  // Données (base : octet)
  { id: 'o', category: 'donnees', label: 'Octets', symbol: 'o', factor: 1 },
  { id: 'ko', category: 'donnees', label: 'Kilo-octets', symbol: 'Ko', factor: 1024 },
  { id: 'mo', category: 'donnees', label: 'Méga-octets', symbol: 'Mo', factor: 1024 ** 2 },
  { id: 'go', category: 'donnees', label: 'Giga-octets', symbol: 'Go', factor: 1024 ** 3 },
  { id: 'to', category: 'donnees', label: 'Téra-octets', symbol: 'To', factor: 1024 ** 4 },
  { id: 'bit', category: 'donnees', label: 'Bits', symbol: 'b', factor: 1 / 8 },

  // Durées (base : seconde)
  { id: 's', category: 'duree', label: 'Secondes', symbol: 's', factor: 1 },
  { id: 'min', category: 'duree', label: 'Minutes', symbol: 'min', factor: 60 },
  { id: 'h', category: 'duree', label: 'Heures', symbol: 'h', factor: 3600 },
  { id: 'j', category: 'duree', label: 'Jours', symbol: 'j', factor: 86400 },
  { id: 'sem', category: 'duree', label: 'Semaines', symbol: 'sem', factor: 604800 },
  { id: 'an', category: 'duree', label: 'Années (365 j)', symbol: 'an', factor: 31_536_000 },

  // Surfaces (base : m²)
  { id: 'm2', category: 'surface', label: 'Mètres carrés', symbol: 'm²', factor: 1 },
  { id: 'km2', category: 'surface', label: 'Kilomètres carrés', symbol: 'km²', factor: 1e6 },
  { id: 'ha', category: 'surface', label: 'Hectares', symbol: 'ha', factor: 10_000 },
  { id: 'acre', category: 'surface', label: 'Acres', symbol: 'ac', factor: 4046.8564224 },
  { id: 'ft2', category: 'surface', label: 'Pieds carrés', symbol: 'ft²', factor: 0.09290304 },
];

export function findUnit(id: string): UnitDefinition | undefined {
  const normalized = id.trim().toLowerCase();
  return UNITS.find((unit) => unit.id === normalized || unit.symbol.toLowerCase() === normalized);
}

/** Convertit une valeur d'une unité à une autre (mêmes catégories exigées). */
export function convertUnits(value: number, fromId: string, toId: string): { result: number; from: UnitDefinition; to: UnitDefinition } {
  const from = findUnit(fromId);
  const to = findUnit(toId);
  if (!from) throw new Error(`Unité inconnue : « ${fromId} ».`);
  if (!to) throw new Error(`Unité inconnue : « ${toId} ».`);
  if (from.category !== to.category) {
    const a = UNIT_CATEGORIES[from.category];
    const b = UNIT_CATEGORIES[to.category];
    throw new Error(`Impossible de convertir ${a.label} (${a.emoji}) en ${b.label} (${b.emoji}) : catégories différentes.`);
  }

  const base = value * from.factor + (from.offset ?? 0);
  const result = (base - (to.offset ?? 0)) / to.factor;
  return { result, from, to };
}

/** Liste d'unités formatée (pour l'aide et les messages d'erreur). */
export function describeUnits(category?: UnitCategory): string {
  const list = category ? UNITS.filter((unit) => unit.category === category) : UNITS;
  return list.map((unit) => `${unit.symbol} (${unit.label})`).join(' • ');
}
