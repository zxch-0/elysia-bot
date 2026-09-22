import { db, type Collection, type Document } from '../core/database';
import { guildService } from './guildService';

export interface Reminder extends Document {
  /** `${guildId}:${numéro}` — identifiant court affiché à l'utilisateur. */
  id: string;
  guildId: string;
  channelId: string;
  userId: string;
  userTag: string;
  text: string;
  /** Qui faut-il mentionner au moment du rappel (utilisateur par défaut). */
  mention: boolean;
  createdAt: number;
  dueAt: number;
  fired: boolean;
  firedAt?: number | null;
}

export interface CreateReminderInput {
  guildId: string;
  channelId: string;
  userId: string;
  userTag: string;
  text: string;
  dueAt: number;
  mention?: boolean;
}

/** Nombre maximal de rappels en attente par membre. */
export const MAX_REMINDERS_PER_USER = 10;
/** Nombre maximal de rappels actifs par serveur (garde-fou mémoire). */
export const MAX_REMINDERS_PER_GUILD = 500;

/**
 * Rappels persistants (`/rappel`).
 * Le planificateur vérifie les échéances toutes les 20 secondes et notifie
 * l'auteur dans le salon d'origine.
 */
export class ReminderService {
  private readonly collection: Collection<Reminder> = db.collection<Reminder>('reminders');

  create(input: CreateReminderInput): Reminder {
    const number = guildService.nextCounter(input.guildId, 'reminderId');
    const reminder: Reminder = {
      id: `${input.guildId}:${number}`,
      guildId: input.guildId,
      channelId: input.channelId,
      userId: input.userId,
      userTag: input.userTag,
      text: input.text.slice(0, 800),
      mention: input.mention ?? true,
      createdAt: Date.now(),
      dueAt: input.dueAt,
      fired: false,
      firedAt: null,
    };
    this.collection.set(reminder);
    return reminder;
  }

  get(id: string): Reminder | undefined {
    return this.collection.get(id);
  }

  listUser(guildId: string, userId: string): Reminder[] {
    return this.collection
      .find((entry) => entry.guildId === guildId && entry.userId === userId && !entry.fired)
      .sort((a, b) => a.dueAt - b.dueAt);
  }

  listGuild(guildId: string): Reminder[] {
    return this.collection.find((entry) => entry.guildId === guildId && !entry.fired).sort((a, b) => a.dueAt - b.dueAt);
  }

  countPending(guildId: string, userId: string): number {
    return this.collection.count((entry) => entry.guildId === guildId && entry.userId === userId && !entry.fired);
  }

  delete(id: string, requesterId?: string): boolean {
    const entry = this.collection.get(id);
    if (!entry) return false;
    if (requesterId && entry.userId !== requesterId) return false;
    return this.collection.delete(id);
  }

  /** Rappels arrivés à échéance. */
  due(now: number = Date.now()): Reminder[] {
    return this.collection.find((entry) => !entry.fired && entry.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
  }

  markFired(id: string): void {
    this.collection.update(id, { fired: true, firedAt: Date.now() } as Partial<Reminder>);
  }

  /** Décale un rappel (snooze depuis un bouton). */
  snooze(id: string, delayMs: number): Reminder | undefined {
    const entry = this.collection.get(id);
    if (!entry) return undefined;
    return this.collection.update(id, {
      dueAt: Date.now() + Math.max(delayMs, 1_000),
      fired: false,
      firedAt: null,
    } as Partial<Reminder>);
  }

  /** Purge les rappels terminés depuis plus de 7 jours. */
  purgeOld(now: number = Date.now()): number {
    const threshold = now - 7 * 86_400_000;
    const stale = this.collection.find((entry) => entry.fired && (entry.firedAt ?? entry.dueAt) < threshold);
    for (const entry of stale) this.collection.delete(entry.id);
    return stale.length;
  }

  total(): number {
    return this.collection.size;
  }
}

export const reminderService = new ReminderService();
