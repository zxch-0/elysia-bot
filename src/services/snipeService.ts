import type { Message, PartialMessage } from 'discord.js';
import { logger } from '../core/logger';

const log = logger.child('snipe');

export type SnipeKind = 'supprime' | 'modifie';

export interface SnipeEntry {
  guildId: string;
  channelId: string;
  messageId: string;
  kind: SnipeKind;
  authorId: string;
  authorTag: string;
  authorAvatar: string | null;
  /** Contenu avant suppression / édition. */
  content: string;
  /** Nouveau contenu (édition uniquement). */
  after?: string;
  attachments: number;
  createdAt: number;
  /** Instant de la suppression ou de l'édition. */
  occurredAt: number;
}

/** Nombre d'entrées conservées par salon. */
const MAX_PER_CHANNEL = 10;
/** Durée de conservation (30 minutes). */
const RETENTION_MS = 30 * 60_000;

/**
 * « Snipe » : mémoire des derniers messages supprimés ou modifiés par salon.
 * Volontairement gardé en RAM (aucune donnée persistée sur disque) et purgé
 * automatiquement : c'est un outil d'observation, pas un journal.
 */
export class SnipeService {
  private readonly entries = new Map<string, SnipeEntry[]>();

  private push(entry: SnipeEntry): void {
    const list = this.entries.get(entry.channelId) ?? [];
    list.unshift(entry);
    const fresh = list.filter((item) => Date.now() - item.occurredAt < RETENTION_MS).slice(0, MAX_PER_CHANNEL);
    this.entries.set(entry.channelId, fresh);
  }

  /** Enregistre un message supprimé (contenu éventuellement partiel). */
  recordDelete(message: Message | PartialMessage): void {
    const author = message.author ?? message.partial ? message.author : null;
    if (!author || author.bot) return;
    const content = message.content ?? '';
    if (!content && (message.attachments?.size ?? 0) === 0) return;

    this.push({
      guildId: message.guildId ?? '',
      channelId: message.channelId,
      messageId: message.id,
      kind: 'supprime',
      authorId: author.id,
      authorTag: author.tag,
      authorAvatar: author.displayAvatarURL({ size: 128 }),
      content,
      attachments: message.attachments?.size ?? 0,
      createdAt: message.createdTimestamp,
      occurredAt: Date.now(),
    });
    log.debug(`Snipe : message de ${author.tag} mémorisé dans ${message.channelId}`);
  }

  /** Enregistre une édition de message. */
  recordEdit(before: Message | PartialMessage, after: Message | PartialMessage): void {
    const author = after.author ?? before.author;
    if (!author || author.bot) return;
    if (!before.content || before.content === after.content) return;

    this.push({
      guildId: after.guildId ?? '',
      channelId: after.channelId,
      messageId: after.id,
      kind: 'modifie',
      authorId: author.id,
      authorTag: author.tag,
      authorAvatar: author.displayAvatarURL({ size: 128 }),
      content: before.content,
      after: after.content ?? '',
      attachments: after.attachments?.size ?? 0,
      createdAt: after.createdTimestamp,
      occurredAt: Date.now(),
    });
  }

  /** Dernière entrée d'un salon, par type (0 = la plus récente). */
  last(channelId: string, kind: SnipeKind = 'supprime', index = 0): SnipeEntry | undefined {
    const list = (this.entries.get(channelId) ?? []).filter((entry) => entry.kind === kind);
    return list[index];
  }

  /** Historique d'un salon (les plus récents d'abord). */
  history(channelId: string, kind?: SnipeKind): SnipeEntry[] {
    const list = this.entries.get(channelId) ?? [];
    return kind ? list.filter((entry) => entry.kind === kind) : list;
  }

  clear(channelId: string): number {
    const count = this.entries.get(channelId)?.length ?? 0;
    this.entries.delete(channelId);
    return count;
  }

  /** Nombre d'entrées conservées (tableau de bord / statut du bot). */
  size(): number {
    let total = 0;
    for (const list of this.entries.values()) total += list.length;
    return total;
  }
}

export const snipeService = new SnipeService();
