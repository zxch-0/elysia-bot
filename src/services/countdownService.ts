import { db, type Collection, type Document } from '../core/database';
import { guildService } from './guildService';

export interface Countdown extends Document {
  /** `${guildId}:${numéro}` */
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string | null;
  title: string;
  description?: string | null;
  /** Horodatage de l'échéance. */
  targetAt: number;
  createdBy: string;
  createdByTag: string;
  pingRoleId?: string | null;
  ended: boolean;
  endedAt?: number | null;
  createdAt: number;
}

/**
 * Comptes à rebours (`/compte-a-rebours`).
 * Les horodatages Discord (`<t:…:R>`) se rafraîchissent tout seuls côté
 * client : le bot n'a besoin d'intervenir qu'à l'échéance.
 */
export class CountdownService {
  private readonly collection: Collection<Countdown> = db.collection<Countdown>('countdowns');

  create(params: {
    guildId: string;
    channelId: string;
    title: string;
    description?: string | null;
    targetAt: number;
    createdBy: string;
    createdByTag: string;
    pingRoleId?: string | null;
  }): Countdown {
    const number = guildService.nextCounter(params.guildId, 'countdownId');
    const entry: Countdown = {
      id: `${params.guildId}:${number}`,
      guildId: params.guildId,
      channelId: params.channelId,
      messageId: null,
      title: params.title.slice(0, 200),
      description: params.description?.slice(0, 800) ?? null,
      targetAt: params.targetAt,
      createdBy: params.createdBy,
      createdByTag: params.createdByTag,
      pingRoleId: params.pingRoleId ?? null,
      ended: false,
      endedAt: null,
      createdAt: Date.now(),
    };
    this.collection.set(entry);
    return entry;
  }

  get(id: string): Countdown | undefined {
    return this.collection.get(id);
  }

  update(id: string, patch: Partial<Countdown>): Countdown | undefined {
    return this.collection.update(id, patch as Countdown);
  }

  listGuild(guildId: string): Countdown[] {
    return this.collection
      .find((entry) => entry.guildId === guildId)
      .sort((a, b) => Number(a.ended) - Number(b.ended) || a.targetAt - b.targetAt);
  }

  listActive(guildId?: string): Countdown[] {
    return this.collection
      .find((entry) => !entry.ended && (!guildId || entry.guildId === guildId))
      .sort((a, b) => a.targetAt - b.targetAt);
  }

  due(now: number = Date.now()): Countdown[] {
    return this.collection.find((entry) => !entry.ended && entry.targetAt <= now).sort((a, b) => a.targetAt - b.targetAt);
  }

  markEnded(id: string): void {
    this.collection.update(id, { ended: true, endedAt: Date.now() } as Partial<Countdown>);
  }

  delete(id: string): boolean {
    return this.collection.delete(id);
  }

  /** Purge les comptes à rebours terminés depuis plus de 30 jours. */
  purgeOld(now: number = Date.now()): number {
    const threshold = now - 30 * 86_400_000;
    const stale = this.collection.find((entry) => entry.ended && (entry.endedAt ?? entry.targetAt) < threshold);
    for (const entry of stale) this.collection.delete(entry.id);
    return stale.length;
  }

  total(): number {
    return this.collection.size;
  }
}

export const countdownService = new CountdownService();
