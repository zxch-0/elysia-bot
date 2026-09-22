import { db, type Collection, type Document } from '../core/database';
import { DEFAULT_ANNOUNCE_ZONE, daysUntilBirthday, isToday, isValidDayMonth, zonedDate } from '../utils/time';

export interface Birthday extends Document {
  /** `${guildId}:${userId}` */
  id: string;
  guildId: string;
  userId: string;
  userTag: string;
  day: number;
  month: number;
  /** Année de naissance (facultative). */
  year?: number | null;
  createdAt: number;
  /** Date (AAAA-MM-JJ) de la dernière annonce, pour n'annoncer qu'une fois par jour. */
  lastAnnounced?: string | null;
}

export interface UpcomingBirthday extends Birthday {
  daysLeft: number;
}

/**
 * Anniversaires des membres (`/anniversaire`).
 * Le planificateur compare chaque jour la date courante aux anniversaires
 * enregistrés et publie une annonce dans le salon configuré.
 */
export class BirthdayService {
  private readonly collection: Collection<Birthday> = db.collection<Birthday>('birthdays');

  private key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  set(params: {
    guildId: string;
    userId: string;
    userTag: string;
    day: number;
    month: number;
    year?: number | null;
  }): Birthday {
    if (!isValidDayMonth(params.day, params.month)) {
      throw new Error(`Date invalide : ${params.day}/${params.month}.`);
    }
    const existing = this.collection.get(this.key(params.guildId, params.userId));
    const entry: Birthday = {
      id: this.key(params.guildId, params.userId),
      guildId: params.guildId,
      userId: params.userId,
      userTag: params.userTag,
      day: params.day,
      month: params.month,
      year: params.year ?? existing?.year ?? null,
      createdAt: existing?.createdAt ?? Date.now(),
      // Une modification de date doit pouvoir être annoncée À NOUVEAU aujourd'hui.
      lastAnnounced: existing?.day === params.day && existing?.month === params.month ? existing?.lastAnnounced : null,
    };
    this.collection.set(entry);
    return entry;
  }

  get(guildId: string, userId: string): Birthday | undefined {
    return this.collection.get(this.key(guildId, userId));
  }

  remove(guildId: string, userId: string): boolean {
    return this.collection.delete(this.key(guildId, userId));
  }

  listGuild(guildId: string): Birthday[] {
    return this.collection
      .find((entry) => entry.guildId === guildId)
      .sort((a, b) => a.month - b.month || a.day - b.day);
  }

  /** Prochains anniversaires d'un serveur (aujourd'hui en premier). */
  upcoming(guildId: string, limit = 10, from: Date = new Date(), timeZone = DEFAULT_ANNOUNCE_ZONE): UpcomingBirthday[] {
    return this.listGuild(guildId)
      .map((entry) => ({ ...entry, daysLeft: daysUntilBirthday(entry.day, entry.month, from, timeZone) }))
      .sort((a, b) => a.daysLeft - b.daysLeft || a.userTag.localeCompare(b.userTag))
      .slice(0, Math.max(limit, 1));
  }

  /** Anniversaires du jour qui n'ont pas encore été annoncés. */
  pendingAnnouncements(guildId: string, from: Date = new Date(), timeZone = DEFAULT_ANNOUNCE_ZONE): Birthday[] {
    const { year, month, day } = zonedDate(from, timeZone);
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return this.listGuild(guildId).filter(
      (entry) => isToday(entry.day, entry.month, from, timeZone) && entry.lastAnnounced !== key,
    );
  }

  markAnnounced(guildId: string, userId: string, from: Date = new Date(), timeZone = DEFAULT_ANNOUNCE_ZONE): void {
    const { year, month, day } = zonedDate(from, timeZone);
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    this.collection.update(this.key(guildId, userId), { lastAnnounced: key } as Partial<Birthday>);
  }

  /** Nombre de serveurs ayant au moins un anniversaire (statistiques). */
  total(): number {
    return this.collection.size;
  }
}

export const birthdayService = new BirthdayService();
