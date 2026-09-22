import { db, type Collection, type Document } from '../core/database';
import { guildService } from './guildService';

export type SuggestionStatus = 'ouverte' | 'acceptee' | 'refusee' | 'archivee';

export const SUGGESTION_STATUS: Record<SuggestionStatus, { label: string; emoji: string; color: number }> = {
  ouverte: { label: 'Ouverte', emoji: '🟡', color: 0xf59e0b },
  acceptee: { label: 'Acceptée', emoji: '✅', color: 0x22c55e },
  refusee: { label: 'Refusée', emoji: '❌', color: 0xef4444 },
  archivee: { label: 'Archivée', emoji: '🗄️', color: 0x64748b },
};

export interface Suggestion extends Document {
  /** `${guildId}:${numéro}` */
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string | null;
  threadId?: string | null;
  authorId: string;
  authorTag: string;
  anonymous: boolean;
  text: string;
  status: SuggestionStatus;
  /** Identifiants des membres ayant voté pour / contre. */
  upVotes: string[];
  downVotes: string[];
  createdAt: number;
  /** Dernière décision du staff. */
  decidedBy?: string | null;
  decidedAt?: number | null;
}

/**
 * Boîte à suggestions (`/suggestion`).
 * Chaque suggestion est un message votable (✅ / ❌) que le staff peut
 * accepter, refuser ou archiver via des boutons.
 */
export class SuggestionService {
  private readonly collection: Collection<Suggestion> = db.collection<Suggestion>('suggestions');

  create(params: {
    guildId: string;
    channelId: string;
    authorId: string;
    authorTag: string;
    text: string;
    anonymous?: boolean;
  }): Suggestion {
    const number = guildService.nextCounter(params.guildId, 'suggestionId');
    const entry: Suggestion = {
      id: `${params.guildId}:${number}`,
      guildId: params.guildId,
      channelId: params.channelId,
      messageId: null,
      threadId: null,
      authorId: params.authorId,
      authorTag: params.authorTag,
      anonymous: params.anonymous ?? false,
      text: params.text.slice(0, 1_500),
      status: 'ouverte',
      upVotes: [],
      downVotes: [],
      createdAt: Date.now(),
      decidedBy: null,
      decidedAt: null,
    };
    this.collection.set(entry);
    return entry;
  }

  get(id: string): Suggestion | undefined {
    return this.collection.get(id);
  }

  update(id: string, patch: Partial<Suggestion>): Suggestion | undefined {
    return this.collection.update(id, patch as Suggestion);
  }

  listGuild(guildId: string, status?: SuggestionStatus, limit = 10): Suggestion[] {
    return this.collection
      .find((entry) => entry.guildId === guildId && (!status || entry.status === status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  countGuild(guildId: string, status?: SuggestionStatus): number {
    return this.collection.count((entry) => entry.guildId === guildId && (!status || entry.status === status));
  }

  /** Vote (ou retire son vote) : un membre ne peut voter que dans un sens. */
  vote(id: string, userId: string, direction: 'up' | 'down'): 'up' | 'down' | 'removed' | 'changed' | 'invalid' {
    const entry = this.collection.get(id);
    if (!entry) return 'invalid';

    const up = new Set(entry.upVotes);
    const down = new Set(entry.downVotes);
    const alreadyUp = up.has(userId);
    const alreadyDown = down.has(userId);

    if (direction === 'up') {
      if (alreadyUp) {
        up.delete(userId);
        this.collection.update(id, { upVotes: [...up] } as Partial<Suggestion>);
        return 'removed';
      }
      up.add(userId);
      down.delete(userId);
      this.collection.update(id, { upVotes: [...up], downVotes: [...down] } as Partial<Suggestion>);
      return alreadyDown ? 'changed' : 'up';
    }

    if (alreadyDown) {
      down.delete(userId);
      this.collection.update(id, { downVotes: [...down] } as Partial<Suggestion>);
      return 'removed';
    }
    down.add(userId);
    up.delete(userId);
    this.collection.update(id, { upVotes: [...up], downVotes: [...down] } as Partial<Suggestion>);
    return alreadyUp ? 'changed' : 'down';
  }

  setStatus(id: string, status: SuggestionStatus, staffId: string): Suggestion | undefined {
    return this.collection.update(id, {
      status,
      decidedBy: staffId,
      decidedAt: Date.now(),
    } as Partial<Suggestion>);
  }

  /** Score d'une suggestion (votes pour − votes contre). */
  score(entry: Suggestion): number {
    return entry.upVotes.length - entry.downVotes.length;
  }

  /** Suggestions les mieux notées d'un serveur. */
  top(guildId: string, limit = 5): Suggestion[] {
    return this.collection
      .find((entry) => entry.guildId === guildId)
      .sort((a, b) => this.score(b) - this.score(a))
      .slice(0, limit);
  }

  total(): number {
    return this.collection.size;
  }
}

export const suggestionService = new SuggestionService();
