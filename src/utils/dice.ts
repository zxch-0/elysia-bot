/**
 * Lancer de dés avec notation classique : `2d6+3`, `d20`, `4d6`, `1d100-10`.
 * Utilisé par les commandes `/des` et `/duel`.
 */

import { randomInt } from 'node:crypto';

export interface DiceGroup {
  count: number;
  faces: number;
}

export interface DiceRollResult {
  /** Notations brute normalisée, ex. « 2d6+3 ». */
  notation: string;
  groups: DiceGroup[];
  modifier: number;
  /** Détail des dés, groupé : [[3, 5], [2]] */
  rolls: number[][];
  total: number;
  /** Plus petite et plus grande valeur possibles (pour juger le jet). */
  min: number;
  max: number;
}

export class DiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiceError';
  }
}

/** Nombre maximal de dés par groupe (garde-fou anti-spam). */
export const MAX_DICE = 100;
/** Nombre maximal de faces par dé. */
export const MAX_FACES = 1_000;

/**
 * Parse une notation de dés.
 * Accepte plusieurs groupes : `2d6+1d4+3`, et omet le modificateur.
 */
export function parseDiceNotation(input: string): { groups: DiceGroup[]; modifier: number } {
  const notation = input.trim().toLowerCase().replace(/\s+/g, '').replace(/[x×]/g, 'd');
  if (!notation) throw new DiceError('Notation vide : essayez `2d6+3`.');

  const groups: DiceGroup[] = [];
  let modifier = 0;
  let index = 0;
  let consumed = 0;

  while (index < notation.length) {
    // Séparateur explicite en début de groupe.
    if (index > 0 && (notation[index] === '+' || notation[index] === '-')) {
      const sign = notation[index] === '-' ? -1 : 1;
      index += 1;
      const match = notation.slice(index).match(/^(\d*)d(\d+)/);
      if (match) {
        groups.push(parseGroup(match[1], match[2]));
        index += match[0].length;
        consumed += match[0].length;
        continue;
      }
      const number = notation.slice(index).match(/^(\d+(?:\.\d+)?)/);
      if (!number) throw new DiceError(`Format invalide après « ${notation[index - 1]} » dans « ${input} ».`);
      modifier += sign * Number(number[1]);
      index += number[0].length;
      continue;
    }

    const match = notation.slice(index).match(/^(\d*)d(\d+)/);
    if (match) {
      groups.push(parseGroup(match[1], match[2]));
      index += match[0].length;
      consumed += match[0].length;
      continue;
    }

    if (/^\d+(?:\.\d+)?/.test(notation.slice(index))) {
      const number = notation.slice(index).match(/^(\d+(?:\.\d+)?)/)!;
      modifier += Number(number[1]);
      index += number[0].length;
      continue;
    }

    throw new DiceError(`Notation invalide : « ${input} ». Exemples : \`d20\`, \`2d6+3\`, \`4d6\`.`);
  }

  if (groups.length === 0 && modifier === 0 && consumed === 0) {
    throw new DiceError(`Notation invalide : « ${input} ». Exemples : \`d20\`, \`2d6+3\`, \`4d6\`.`);
  }

  return { groups, modifier: Math.trunc(modifier) };
}

function parseGroup(countRaw: string, facesRaw: string): DiceGroup {
  const count = countRaw === '' ? 1 : Number.parseInt(countRaw, 10);
  const faces = Number.parseInt(facesRaw, 10);
  if (!Number.isInteger(count) || count < 1) throw new DiceError('Nombre de dés invalide (minimum 1).');
  if (count > MAX_DICE) throw new DiceError(`Trop de dés : ${MAX_DICE} maximum par lancer.`);
  if (!Number.isInteger(faces) || faces < 2) throw new DiceError('Un dé doit avoir au moins 2 faces.');
  if (faces > MAX_FACES) throw new DiceError(`Trop de faces : ${MAX_FACES} maximum.`);
  return { count, faces };
}

/** Lance la notation fournie (aléatoire cryptographique). */
export function rollDice(input: string): DiceRollResult {
  const { groups, modifier } = parseDiceNotation(input);
  const rolls: number[][] = [];
  let total = modifier;
  let min = modifier;
  let max = modifier;

  for (const group of groups) {
    const values: number[] = [];
    for (let index = 0; index < group.count; index += 1) {
      const value = randomInt(1, group.faces + 1);
      values.push(value);
      total += value;
    }
    rolls.push(values);
    min += group.count;
    max += group.count * group.faces;
  }

  return {
    notation: formatNotation(groups, modifier),
    groups,
    modifier,
    rolls,
    total,
    min,
    max,
  };
}

/** Notation canonique : « 2d6+1d4+3 ». */
export function formatNotation(groups: DiceGroup[], modifier: number): string {
  if (groups.length === 0) return String(modifier);
  const parts = groups.map((group) => `${group.count}d${group.faces}`);
  if (modifier !== 0) parts.push(`${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`);
  return parts.join('');
}

/** Qualificatif d'un jet selon sa position dans l'intervalle possible. */
export function rollGrade(result: DiceRollResult): { label: string; emoji: string } {
  const span = Math.max(result.max - result.min, 1);
  const ratio = (result.total - result.min) / span;
  if (ratio >= 0.95) return { label: 'Jet légendaire', emoji: '🌟' };
  if (ratio >= 0.75) return { label: 'Excellent jet', emoji: '💪' };
  if (ratio >= 0.45) return { label: 'Jet correct', emoji: '🙂' };
  if (ratio >= 0.2) return { label: 'Jet médiocre', emoji: '😕' };
  return { label: 'Jet catastrophique', emoji: '💀' };
}

export type CoinSide = 'pile' | 'face';

/** Lance une pièce : retourne le côté tombé. */
export function flipCoin(): CoinSide {
  return randomInt(0, 2) === 0 ? 'pile' : 'face';
}

/** Séries de lancers d'une pièce. */
export function flipCoins(count: number): CoinSide[] {
  const safeCount = Math.min(Math.max(Math.trunc(count), 1), 50);
  return Array.from({ length: safeCount }, () => flipCoin());
}
