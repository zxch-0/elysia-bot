import { db, type Collection, type Document } from '../core/database';

export interface StaffNote extends Document {
  /** `${guildId}:${userId}:${numéro}` */
  id: string;
  guildId: string;
  userId: string;
  targetTag: string;
  authorId: string;
  authorTag: string;
  text: string;
  /** Numéro d'affichage (1 = première note écrite). */
  number: number;
  createdAt: number;
}

/**
 * Notes internes du staff (`/note`).
 * Contrairement aux cases de modération, une note est **purement
 * informative** : elle n'apparaît jamais publiquement et ne déclenche
 * aucune sanction automatique.
 */
export class NoteService {
  private readonly collection: Collection<StaffNote> = db.collection<StaffNote>('notes');

  add(params: {
    guildId: string;
    userId: string;
    targetTag: string;
    authorId: string;
    authorTag: string;
    text: string;
  }): StaffNote {
    const number = this.list(params.guildId, params.userId).length + 1;
    const entry: StaffNote = {
      id: `${params.guildId}:${params.userId}:${number}`,
      guildId: params.guildId,
      userId: params.userId,
      targetTag: params.targetTag,
      authorId: params.authorId,
      authorTag: params.authorTag,
      text: params.text.slice(0, 800),
      number,
      createdAt: Date.now(),
    };
    this.collection.set(entry);
    return entry;
  }

  list(guildId: string, userId: string): StaffNote[] {
    return this.collection
      .find((entry) => entry.guildId === guildId && entry.userId === userId)
      // `number` tranche les égalités d'horodatage (deux notes dans la même milliseconde).
      .sort((a, b) => b.number - a.number);
  }

  /** Note par numéro d'affichage (1 = la plus ancienne). */
  get(guildId: string, userId: string, number: number): StaffNote | undefined {
    return this.collection.get(`${guildId}:${userId}:${number}`);
  }

  count(guildId: string, userId: string): number {
    return this.collection.count((entry) => entry.guildId === guildId && entry.userId === userId);
  }

  remove(guildId: string, userId: string, number: number): boolean {
    const note = this.get(guildId, userId, number);
    if (!note) return false;
    return this.collection.delete(note.id);
  }

  /** Membres disposant le plus de notes (vue d'ensemble pour le staff). */
  topGuild(guildId: string, limit = 10): Array<{ userId: string; targetTag: string; count: number }> {
    const grouped = new Map<string, { userId: string; targetTag: string; count: number }>();
    for (const note of this.collection.find((entry) => entry.guildId === guildId)) {
      const current = grouped.get(note.userId) ?? { userId: note.userId, targetTag: note.targetTag, count: 0 };
      current.count += 1;
      current.targetTag = note.targetTag;
      grouped.set(note.userId, current);
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  }

  total(): number {
    return this.collection.size;
  }
}

export const noteService = new NoteService();
