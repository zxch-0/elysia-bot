/**
 * Fuseaux horaires, dates d'échéance et calculs d'anniversaires.
 * Utilisé par `/heure`, `/compte-a-rebours`, `/anniversaire` et `/rappel`.
 */

import { parseDuration } from './duration';
import { loadConfig } from '../core/config';

export interface WorldZone {
  id: string;
  label: string;
  timeZone: string;
  emoji: string;
}

/** Fuseaux proposés dans les options de `/heure` (25 choix maximum côté Discord). */
export const WORLD_ZONES: WorldZone[] = [
  { id: 'paris', label: 'Paris', timeZone: 'Europe/Paris', emoji: '🇫🇷' },
  { id: 'londres', label: 'Londres', timeZone: 'Europe/London', emoji: '🇬🇧' },
  { id: 'bruxelles', label: 'Bruxelles', timeZone: 'Europe/Brussels', emoji: '🇧🇪' },
  { id: 'geneve', label: 'Genève', timeZone: 'Europe/Zurich', emoji: '🇨🇭' },
  { id: 'montreal', label: 'Montréal', timeZone: 'America/Toronto', emoji: '🇨🇦' },
  { id: 'newyork', label: 'New York', timeZone: 'America/New_York', emoji: '🇺🇸' },
  { id: 'losangeles', label: 'Los Angeles', timeZone: 'America/Los_Angeles', emoji: '🌴' },
  { id: 'mexico', label: 'Mexico', timeZone: 'America/Mexico_City', emoji: '🇲🇽' },
  { id: 'saopaulo', label: 'São Paulo', timeZone: 'America/Sao_Paulo', emoji: '🇧🇷' },
  { id: 'buenosaires', label: 'Buenos Aires', timeZone: 'America/Argentina/Buenos_Aires', emoji: '🇦🇷' },
  { id: 'casablanca', label: 'Casablanca', timeZone: 'Africa/Casablanca', emoji: '🇲🇦' },
  { id: 'alger', label: 'Alger', timeZone: 'Africa/Algiers', emoji: '🇩🇿' },
  { id: 'tunis', label: 'Tunis', timeZone: 'Africa/Tunis', emoji: '🇹🇳' },
  { id: 'dakar', label: 'Dakar', timeZone: 'Africa/Dakar', emoji: '🇸🇳' },
  { id: 'abidjan', label: 'Abidjan', timeZone: 'Africa/Abidjan', emoji: '🇨🇮' },
  { id: 'kinshasa', label: 'Kinshasa', timeZone: 'Africa/Kinshasa', emoji: '🇨🇩' },
  { id: 'lecaire', label: 'Le Caire', timeZone: 'Africa/Cairo', emoji: '🇪🇬' },
  { id: 'johannesburg', label: 'Johannesburg', timeZone: 'Africa/Johannesburg', emoji: '🇿🇦' },
  { id: 'istanbul', label: 'Istanbul', timeZone: 'Europe/Istanbul', emoji: '🇹🇷' },
  { id: 'moscou', label: 'Moscou', timeZone: 'Europe/Moscow', emoji: '🇷🇺' },
  { id: 'dubai', label: 'Dubaï', timeZone: 'Asia/Dubai', emoji: '🇦🇪' },
  { id: 'delhi', label: 'New Delhi', timeZone: 'Asia/Kolkata', emoji: '🇮🇳' },
  { id: 'bangkok', label: 'Bangkok', timeZone: 'Asia/Bangkok', emoji: '🇹🇭' },
  { id: 'tokyo', label: 'Tokyo', timeZone: 'Asia/Tokyo', emoji: '🇯🇵' },
  { id: 'sydney', label: 'Sydney', timeZone: 'Australia/Sydney', emoji: '🇦🇺' },
];

/**
 * Fuseau utilisé pour les annonces d'anniversaires.
 * Configurable via `BIRTHDAY_TIMEZONE` dans `.env` (défaut : Europe/Paris).
 */
export const DEFAULT_ANNOUNCE_ZONE = (() => {
  try {
    return loadConfig().birthdayTimezone;
  } catch {
    return 'Europe/Paris';
  }
})();

export function findZone(id: string): WorldZone | undefined {
  const normalized = id.trim().toLowerCase();
  return WORLD_ZONES.find((zone) => zone.id === normalized || zone.label.toLowerCase() === normalized);
}

export interface ZonedMoment {
  /** Heure au format « 14:07 ». */
  time: string;
  /** « lundi 22 septembre 2026 ». */
  date: string;
  weekday: string;
  /** Décalage lisible par rapport à UTC, ex. « UTC+2 ». */
  offset: string;
  /** Heure numérique 0-23 (pour l'icône jour/nuit). */
  hour: number;
}

/** Formate un instant dans un fuseau donné (sans dépendance externe). */
export function formatInZone(date: Date, timeZone: string): ZonedMoment {
  const time = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const dateText = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  const weekday = new Intl.DateTimeFormat('fr-FR', { timeZone, weekday: 'long' }).format(date);
  const hour = Number.parseInt(new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', hour12: false }).format(date), 10);

  return {
    time,
    date: dateText,
    weekday,
    offset: zoneOffsetLabel(date, timeZone),
    hour: Number.isFinite(hour) ? hour % 24 : 0,
  };
}

/** Décalage d'un fuseau à un instant donné, ex. « UTC+2 » (gère l'heure d'été). */
export function zoneOffsetLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = raw.match(/GMT([+-]\d{2}:?\d{2})?/);
  if (!match || !match[1]) return 'UTC+0';
  const normalized = match[1].replace(':', '');
  return `UTC${normalized.startsWith('-') ? '-' : '+'}${Number.parseInt(normalized.replace(/[+-]/, ''), 10) / 100}`;
}

/** Date (jour/mois/année) courante dans un fuseau donné. */
export function zonedDate(date: Date, timeZone: string): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { day: get('day'), month: get('month'), year: get('year') };
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export function monthLabel(month: number): string {
  return MONTHS_FR[Math.min(Math.max(month, 1), 12) - 1];
}

/** « 22 septembre » lisible. */
export function birthdayLabel(day: number, month: number): string {
  return `${day} ${monthLabel(month)}`;
}

/** Jours restants avant le prochain anniversaire (0 = aujourd'hui). */
export function daysUntilBirthday(day: number, month: number, from: Date = new Date(), timeZone = DEFAULT_ANNOUNCE_ZONE): number {
  const today = zonedDate(from, timeZone);
  const thisYear = Date.UTC(today.year, month - 1, day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  if (thisYear >= todayUtc) return Math.round((thisYear - todayUtc) / 86_400_000);
  const nextYear = Date.UTC(today.year + 1, month - 1, day);
  return Math.round((nextYear - todayUtc) / 86_400_000);
}

/** Vrai si la date correspond à aujourd'hui dans le fuseau des annonces. */
export function isToday(day: number, month: number, from: Date = new Date(), timeZone = DEFAULT_ANNOUNCE_ZONE): boolean {
  const today = zonedDate(from, timeZone);
  return today.day === day && today.month === month;
}

export function isValidDayMonth(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const maxDay = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= maxDay;
}

/**
 * Convertit une saisie utilisateur en horodatage :
 *  • durée relative : `3j`, `2h30`, `45m` ;
 *  • date ISO : `2026-12-31` ou `2026-12-31 20:30` ;
 *  • date française : `31/12/2026` ou `31/12/2026 20:30`.
 * Les dates sans heure sont interprétées à minuit **UTC** (Discord affiche
 * ensuite l'heure locale de chaque membre).
 */
export function parseTargetDate(input: string, now: number = Date.now()): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t](\d{1,2}):(\d{2}))?$/);
  const fr = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ t](\d{1,2}):(\d{2}))?$/);

  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), hour: Number(iso[4] ?? 0), minute: Number(iso[5] ?? 0) }
    : fr
      ? { year: Number(fr[3]), month: Number(fr[2]), day: Number(fr[1]), hour: Number(fr[4] ?? 0), minute: Number(fr[5] ?? 0) }
      : null;

  if (parts) {
    if (!isValidDayMonth(parts.day, parts.month)) return null;
    if (parts.hour > 23 || parts.minute > 59) return null;
    const timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const duration = parseDuration(raw);
  if (duration !== null && duration > 0) return now + duration;
  return null;
}
