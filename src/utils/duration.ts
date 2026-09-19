/** Utilitaires de durée : parsing « 1j2h30m », affichage lisible, timers Discord. */

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  seconde: 1_000,
  secondes: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  heure: 3_600_000,
  heures: 3_600_000,
  d: 86_400_000,
  j: 86_400_000,
  jour: 86_400_000,
  jours: 86_400_000,
  w: 604_800_000,
  sem: 604_800_000,
  semaine: 604_800_000,
  semaines: 604_800_000,
  mo: 2_592_000_000,
  mois: 2_592_000_000,
};

/** Timeout natif Discord : 28 jours. */
export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1_000;

/**
 * Convertit une durée textuelle en millisecondes.
 * Accepte : `30s`, `10m`, `2h`, `3j`, `1j12h`, `45`, `2 semaines`, `perm`.
 * Retourne `null` si la chaîne est invalide.
 */
export function parseDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const value = input.trim().toLowerCase().replace(/\s+/g, ' ');

  if (['perm', 'permanent', 'perma', 'infini', 'infinite', 'off', 'none', '0'].includes(value)) return 0;

  // Format « 1j 12h 30m »
  const compound = value.match(/(\d+)\s*([a-zéè]+)/g);
  if (compound && compound.length > 0) {
    let total = 0;
    let consumedLength = 0;
    for (const part of compound) {
      const match = part.match(/^(\d+)\s*([a-zéè]+)$/);
      if (!match) return null;
      const amount = Number.parseInt(match[1], 10);
      const unit = match[2];
      const multiplier = UNIT_MS[unit];
      if (!multiplier) return null;
      total += amount * multiplier;
      consumedLength += part.length;
    }
    const compact = value.replace(/\s/g, '');
    if (consumedLength < compact.length) return null;
    return total > 0 ? total : null;
  }

  // Format « 1j12h30m » (sans espaces)
  const compactMatch = value.match(/^(?:(\d+)\s*([a-zéè]+))+$/);
  if (compactMatch) {
    let total = 0;
    const segments = value.match(/\d+\s*[a-zéè]+/g) ?? [];
    for (const segment of segments) {
      const match = segment.match(/^(\d+)\s*([a-zéè]+)$/);
      if (!match) return null;
      const multiplier = UNIT_MS[match[2]];
      if (!multiplier) return null;
      total += Number.parseInt(match[1], 10) * multiplier;
    }
    return total > 0 ? total : null;
  }

  // Nombre seul → minutes
  if (/^\d+$/.test(value)) {
    const minutes = Number.parseInt(value, 10);
    return minutes > 0 ? minutes * 60_000 : null;
  }

  return null;
}

/** Durée en millisecondes → texte court et lisible (« 1 j 12 h 30 min »). */
export function formatDuration(ms: number, options: { compact?: boolean; locale?: 'fr' | 'en' } = {}): string {
  const locale = options.locale ?? 'fr';
  if (ms <= 0) return locale === 'fr' ? 'permanent' : 'permanent';
  const units: Array<[string, string, number]> =
    locale === 'fr'
      ? [
          ['j', 'j', 86_400_000],
          ['h', 'h', 3_600_000],
          ['min', 'min', 60_000],
          ['s', 's', 1_000],
        ]
      : [
          ['d', 'd', 86_400_000],
          ['h', 'h', 3_600_000],
          ['m', 'm', 60_000],
          ['s', 's', 1_000],
        ];

  const parts: string[] = [];
  let remaining = ms;
  for (const [short, long, unit] of units) {
    const amount = Math.floor(remaining / unit);
    if (amount > 0) {
      remaining -= amount * unit;
      parts.push(`${amount} ${options.compact ? short : long}`);
    }
    if (parts.length === 2 && options.compact) break;
  }
  return parts.join(options.compact ? ' ' : ' ') || (locale === 'fr' ? '0 s' : '0 s');
}

/** « dans 3 min », « il y a 2 j ». */
export function formatRelative(ms: number, locale: 'fr' | 'en' = 'fr'): string {
  const past = ms < 0;
  const text = formatDuration(Math.abs(ms), { locale });
  if (locale === 'fr') return past ? `il y a ${text}` : `dans ${text}`;
  return past ? `${text} ago` : `in ${text}`;
}

/** Horodatage relatif Discord : <t:1699999999:R>. */
export function timestampTag(date: Date | number, style: 'D' | 'f' | 'F' | 'R' | 'T' = 'R'): string {
  const seconds = Math.floor((typeof date === 'number' ? date : date.getTime()) / 1_000);
  return `<t:${seconds}:${style}>`;
}

/** Vérifie qu'une durée est acceptable pour un timeout Discord (≤ 28 j). */
export function clampTimeout(ms: number): number {
  return Math.min(Math.max(ms, 1_000), MAX_TIMEOUT_MS);
}
