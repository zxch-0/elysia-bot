/**
 * Encodages, décodages et hachages (commande `/code`).
 * Aucun `eval`, aucune dépendance externe : tout repose sur `node:crypto`.
 */

import { createHash, randomBytes } from 'node:crypto';

export type CodecKind = 'base64' | 'hex' | 'binaire' | 'url' | 'morse' | 'cesar' | 'inverser' | 'majuscules';

export const CODEC_LABELS: Record<CodecKind, string> = {
  base64: 'Base64',
  hex: 'Hexadécimal',
  binaire: 'Binaire',
  url: 'URL (percent-encoding)',
  morse: 'Morse',
  cesar: 'César (rot13)',
  inverser: 'Texte inversé',
  majuscules: 'Majuscules',
};

const MORSE: Record<string, string> = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---',
  k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-',
  u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', "'": '.----.', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '@': '.--.-.', ' ': '/',
};

const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE).map(([character, code]) => [code, character]),
);

export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function encodeBase64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

export function decodeBase64(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) throw new CodecError('Ce texte ne ressemble pas à du Base64.');
  return Buffer.from(cleaned, 'base64').toString('utf8');
}

export function encodeHex(text: string): string {
  return Buffer.from(text, 'utf8').toString('hex');
}

export function decodeHex(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
    throw new CodecError('Hexadécimal invalide (nombre pair de caractères 0-9/a-f attendu).');
  }
  return Buffer.from(cleaned, 'hex').toString('utf8');
}

export function encodeBinary(text: string): string {
  return [...Buffer.from(text, 'utf8')].map((byte) => byte.toString(2).padStart(8, '0')).join(' ');
}

export function decodeBinary(text: string): string {
  const parts = text.trim().split(/\s+/);
  if (parts.length === 0 || !parts.every((part) => /^[01]{1,8}$/.test(part))) {
    throw new CodecError('Binaire invalide : groupes de 0 et de 1 séparés par des espaces attendus.');
  }
  return Buffer.from(parts.map((part) => Number.parseInt(part, 2))).toString('utf8');
}

export function encodeUrl(text: string): string {
  return encodeURIComponent(text);
}

export function decodeUrl(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    throw new CodecError('Séquence d’échappement URL invalide (ex. « %zz »).');
  }
}

export function encodeMorse(text: string): string {
  return stripAccents(text.toLowerCase())
    .split('')
    .map((character) => MORSE[character] ?? (MORSE[character] === undefined ? '' : character))
    .filter((code) => code !== '')
    .join(' ')
    .trim();
}

export function decodeMorse(text: string): string {
  const clean = text.trim().replace(/\s*\|\s*/g, ' / ');
  return clean
    .split(' ')
    .map((code) => (code === '' ? '' : MORSE_REVERSE[code] ?? '?'))
    .join('')
    .replace(/ ?\/ ?/g, ' ');
}

/** Chiffrement de César (par défaut : rot13, symétrique). */
export function caesar(text: string, shift = 13): string {
  const step = ((shift % 26) + 26) % 26;
  return text.replace(/[a-zA-Z]/g, (character) => {
    const base = character <= 'Z' ? 65 : 97;
    return String.fromCharCode(((character.charCodeAt(0) - base + step) % 26) + base);
  });
}

export function reverseText(text: string): string {
  return [...text].reverse().join('');
}

/** Applique un encodage. */
export function encodeValue(kind: CodecKind, text: string): string {
  switch (kind) {
    case 'base64':
      return encodeBase64(text);
    case 'hex':
      return encodeHex(text);
    case 'binaire':
      return encodeBinary(text);
    case 'url':
      return encodeUrl(text);
    case 'morse':
      return encodeMorse(text);
    case 'cesar':
      return caesar(text);
    case 'inverser':
      return reverseText(text);
    case 'majuscules':
      return text.toUpperCase();
    default:
      throw new CodecError(`Encodage inconnu : « ${kind} ».`);
  }
}

/** Applique un décodage (inverse de `encodeValue`). */
export function decodeValue(kind: CodecKind, text: string): string {
  switch (kind) {
    case 'base64':
      return decodeBase64(text);
    case 'hex':
      return decodeHex(text);
    case 'binaire':
      return decodeBinary(text);
    case 'url':
      return decodeUrl(text);
    case 'morse':
      return decodeMorse(text);
    case 'cesar':
      return caesar(text);
    case 'inverser':
      return reverseText(text);
    case 'majuscules':
      return text.toLowerCase();
    default:
      throw new CodecError(`Décodage inconnu : « ${kind} ».`);
  }
}

export type HashAlgorithm = 'sha256' | 'sha512' | 'sha1' | 'md5';

export const HASH_LABELS: Record<HashAlgorithm, string> = {
  sha256: 'SHA-256 (recommandé)',
  sha512: 'SHA-512',
  sha1: 'SHA-1 (obsolète)',
  md5: 'MD5 (obsolète, non sécurisé)',
};

export function hashText(algorithm: HashAlgorithm, text: string): string {
  if (!HASH_LABELS[algorithm]) throw new CodecError(`Algorithme inconnu : « ${algorithm} ».`);
  return createHash(algorithm).update(text, 'utf8').digest('hex');
}

/** Force d'un mot de passe généré, exprimée en bits d'entropie. */
export function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize <= 1 || length <= 0) return 0;
  return Math.round(length * Math.log2(alphabetSize));
}

/** Jeton aléatoire hexadécimal (utilisé par `/motdepasse`). */
export function randomToken(bytes = 16): string {
  return randomBytes(Math.min(Math.max(Math.trunc(bytes), 4), 64)).toString('hex');
}
