import { randomInt } from 'node:crypto';

/** Entier aléatoire cryptographiquement sûr dans [0, maxExclusive). */
export function randomIntSecure(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new RangeError('maxExclusive doit être > 0');
  return randomInt(0, maxExclusive);
}

/** Mélange de Fisher–Yates (non mutant). */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomIntSecure(index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function pickOne<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomIntSecure(items.length)];
}

export interface WeightedCandidate {
  id: string;
  weight: number;
}

/** Nombre aléatoire uniforme cryptographiquement sûr dans [0, 1). */
function secureRandom(): number {
  return randomInt(0, 1_000_000_000) / 1_000_000_000;
}

/**
 * Tirage pondéré sans remise — utilisé par les giveaways
 * (les rôles bonus augmentent le poids d'un participant).
 */
export function pickWeightedWinners(candidates: WeightedCandidate[], count: number): string[] {
  const pool = candidates.filter((candidate) => candidate.weight > 0).map((candidate) => ({ ...candidate }));
  const winners: string[] = [];
  const wanted = Math.min(count, pool.length);

  while (winners.length < wanted && pool.length > 0) {
    const totalWeight = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
    let ticket = secureRandom() * totalWeight;
    let index = pool.length - 1;
    for (let cursor = 0; cursor < pool.length; cursor += 1) {
      ticket -= pool[cursor].weight;
      if (ticket <= 0) {
        index = cursor;
        break;
      }
    }
    winners.push(pool[index].id);
    pool.splice(index, 1);
  }

  return winners;
}

/** Code lisible (ex. « K7F2QA ») pour les identifiants de giveaway/panneau. */
export function shortCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let index = 0; index < length; index += 1) output += alphabet[randomIntSecure(alphabet.length)];
  return output;
}

/** Identifiant court, minuscule, utilisable dans un customId Discord. */
export function slugify(input: string, fallback = 'panel'): string {
  const slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || `${fallback}-${shortCode(4).toLowerCase()}`;
}
