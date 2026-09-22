import { db, type Collection, type Document } from '../core/database';
import { guildService } from './guildService';

export interface PollOption {
  /** Identifiant court (numéro sous forme de texte) utilisé dans les customId. */
  id: string;
  label: string;
}

export interface Poll extends Document {
  /** `${guildId}:${numéro}` */
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string | null;
  authorId: string;
  authorTag: string;
  question: string;
  options: PollOption[];
  /** userId → identifiants des options choisies. */
  votes: Record<string, string[]>;
  multiple: boolean;
  anonymous: boolean;
  endsAt: number;
  ended: boolean;
  endedAt?: number | null;
  createdAt: number;
}

export interface PollResultLine {
  option: PollOption;
  count: number;
  percent: number;
  voters: string[];
}

/** Nombre maximal de propositions par sondage. */
export const MAX_POLL_OPTIONS = 10;

/**
 * Sondages interactifs (`/sondage`).
 * Les votes vivent en base : un redémarrage du bot ne perd pas les résultats.
 */
export class PollService {
  private readonly collection: Collection<Poll> = db.collection<Poll>('polls');

  create(params: {
    guildId: string;
    channelId: string;
    authorId: string;
    authorTag: string;
    question: string;
    options: string[];
    multiple?: boolean;
    anonymous?: boolean;
    /** 0 = sans limite de temps. */
    durationMs?: number;
  }): Poll {
    const labels = params.options.map((option) => option.trim()).filter((option) => option.length > 0);
    if (labels.length < 2) throw new Error('Un sondage nécessite au moins deux propositions.');
    if (labels.length > MAX_POLL_OPTIONS) throw new Error(`Maximum ${MAX_POLL_OPTIONS} propositions par sondage.`);

    const number = guildService.nextCounter(params.guildId, 'pollId');
    const duration = params.durationMs ?? 0;

    const poll: Poll = {
      id: `${params.guildId}:${number}`,
      guildId: params.guildId,
      channelId: params.channelId,
      messageId: null,
      authorId: params.authorId,
      authorTag: params.authorTag,
      question: params.question.slice(0, 240),
      options: labels.map((label, index) => ({ id: String(index), label: label.slice(0, 90) })),
      votes: {},
      multiple: params.multiple ?? false,
      anonymous: params.anonymous ?? false,
      endsAt: duration > 0 ? Date.now() + duration : 0,
      ended: false,
      endedAt: null,
      createdAt: Date.now(),
    };
    this.collection.set(poll);
    return poll;
  }

  get(id: string): Poll | undefined {
    return this.collection.get(id);
  }

  update(id: string, patch: Partial<Poll>): Poll | undefined {
    return this.collection.update(id, patch as Poll);
  }

  listGuild(guildId: string): Poll[] {
    return this.collection.find((entry) => entry.guildId === guildId).sort((a, b) => b.createdAt - a.createdAt);
  }

  due(now: number = Date.now()): Poll[] {
    return this.collection.find((entry) => !entry.ended && entry.endsAt > 0 && entry.endsAt <= now);
  }

  end(id: string, ended = true): Poll | undefined {
    return this.collection.update(id, { ended, endedAt: ended ? Date.now() : null } as Partial<Poll>);
  }

  /**
   * Enregistre (ou met à jour) le vote d'un membre.
   * Retourne le statut du vote pour construire la réponse.
   */
  castVote(pollId: string, userId: string, optionIds: string[]): 'voted' | 'updated' | 'removed' | 'same' | 'invalid' {
    const poll = this.collection.get(pollId);
    if (!poll || poll.ended) return 'invalid';

    const valid = [...new Set(optionIds.filter((id) => poll.options.some((option) => option.id === id)))];
    if (valid.length === 0) {
      if (!poll.votes[userId]) return 'invalid';
      const votes = { ...poll.votes };
      delete votes[userId];
      this.collection.update(pollId, { votes } as Partial<Poll>);
      return 'removed';
    }

    const selection = poll.multiple ? valid.slice(0, MAX_POLL_OPTIONS) : [valid[0]];
    const previous = poll.votes[userId];
    const votes = { ...poll.votes, [userId]: selection };
    this.collection.update(pollId, { votes } as Partial<Poll>);

    if (!previous) return 'voted';
    if (previous.length === selection.length && previous.every((id, index) => id === selection[index])) return 'same';
    return 'updated';
  }

  /** Dépouille ordonnée d'un sondage (avec pourcentages et votants). */
  results(poll: Poll): { lines: PollResultLine[]; totalVoters: number; totalVotes: number } {
    const lines: PollResultLine[] = poll.options.map((option) => ({ option, count: 0, percent: 0, voters: [] }));
    let totalVotes = 0;

    for (const [userId, selection] of Object.entries(poll.votes)) {
      for (const optionId of selection) {
        const line = lines.find((entry) => entry.option.id === optionId);
        if (!line) continue;
        line.count += 1;
        line.voters.push(userId);
        totalVotes += 1;
      }
    }

    for (const line of lines) line.percent = totalVotes > 0 ? (line.count / totalVotes) * 100 : 0;
    return { lines, totalVoters: Object.keys(poll.votes).length, totalVotes };
  }

  /** Gagnant(s) d'un sondage (utile à la clôture). */
  leaders(poll: Poll): PollResultLine[] {
    const { lines } = this.results(poll);
    const best = Math.max(0, ...lines.map((line) => line.count));
    if (best === 0) return [];
    return lines.filter((line) => line.count === best);
  }

  /** Supprime les sondages terminés depuis plus de 30 jours. */
  purgeOld(now: number = Date.now()): number {
    const threshold = now - 30 * 86_400_000;
    const stale = this.collection.find((entry) => entry.ended && (entry.endedAt ?? entry.createdAt) < threshold);
    for (const entry of stale) this.collection.delete(entry.id);
    return stale.length;
  }

  total(): number {
    return this.collection.size;
  }
}

export const pollService = new PollService();
