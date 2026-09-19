import { db, type Collection, type Document } from '../core/database';

export type CaseType = 'ban' | 'kick' | 'timeout' | 'mute' | 'unmute' | 'warn' | 'unban' | 'softban' | 'purge' | 'lock' | 'unlock';

export interface ModCase extends Document {
  /** `${guildId}:${caseNumber}` — identifiant unique global. */
  id: string;
  guildId: string;
  caseNumber: number;
  type: CaseType;
  targetId: string;
  targetTag: string;
  moderatorId: string;
  moderatorTag: string;
  reason: string;
  /** Durée en ms (0 = permanent). */
  duration: number;
  /** Horodatage d'expiration (0 = jamais). */
  expiresAt: number;
  active: boolean;
  /** Message de log associé. */
  logMessageId?: string | null;
  /** Référence à une case liée (ex. unmute → mute). */
  refCaseNumber?: number | null;
  createdAt: number;
  /** Échéance planifiée pour lever automatiquement la sanction. */
  autoRevertAt?: number | null;
  metadata?: Record<string, unknown>;
}

export interface NewCaseInput {
  guildId: string;
  caseNumber: number;
  type: CaseType;
  targetId: string;
  targetTag: string;
  moderatorId: string;
  moderatorTag: string;
  reason: string;
  duration: number;
  expiresAt: number;
  autoRevertAt?: number | null;
  logMessageId?: string | null;
  refCaseNumber?: number | null;
  metadata?: Record<string, unknown>;
  active?: boolean;
}

export class CaseService {
  private collection: Collection<ModCase> = db.collection<ModCase>('cases');

  private key(guildId: string, caseNumber: number): string {
    return `${guildId}:${caseNumber}`;
  }

  create(data: NewCaseInput): ModCase {
    const entry: ModCase = {
      ...data,
      id: this.key(data.guildId, data.caseNumber),
      active: data.active ?? true,
      createdAt: Date.now(),
    };
    this.collection.set(entry);
    return entry;
  }

  get(guildId: string, caseNumber: number): ModCase | undefined {
    return this.collection.get(this.key(guildId, caseNumber));
  }

  /** Toutes les cases d'un serveur, de la plus récente à la plus ancienne. */
  listGuild(guildId: string): ModCase[] {
    return this.collection.find((entry) => entry.guildId === guildId).sort((a, b) => b.caseNumber - a.caseNumber);
  }

  /** Historique d'un membre sur un serveur. */
  listUser(guildId: string, userId: string, types?: CaseType[]): ModCase[] {
    return this.collection
      .find(
        (entry) =>
          entry.guildId === guildId && entry.targetId === userId && (!types || types.includes(entry.type)),
      )
      .sort((a, b) => b.caseNumber - a.caseNumber);
  }

  countUser(guildId: string, userId: string, types?: CaseType[]): number {
    return this.listUser(guildId, userId, types).length;
  }

  /** Nombre d'avertissements actifs (non annulés). */
  countActiveWarnings(guildId: string, userId: string): number {
    return this.collection.count(
      (entry) => entry.guildId === guildId && entry.targetId === userId && entry.type === 'warn' && entry.active,
    );
  }

  update(guildId: string, caseNumber: number, patch: Partial<ModCase>): ModCase | undefined {
    return this.collection.update(this.key(guildId, caseNumber), patch as ModCase);
  }

  /** Désactive les sanctions expirées (appelé par le planificateur). */
  listExpired(now = Date.now()): ModCase[] {
    return this.collection.find(
      (entry) =>
        entry.active &&
        typeof entry.autoRevertAt === 'number' &&
        entry.autoRevertAt > 0 &&
        entry.autoRevertAt <= now,
    );
  }

  delete(guildId: string, caseNumber: number): boolean {
    return this.collection.delete(this.key(guildId, caseNumber));
  }

  /** Supprime toutes les cases d'un serveur (utilisable pour un reset RGPD). */
  purgeGuild(guildId: string): number {
    const targets = this.collection.find((entry) => entry.guildId === guildId);
    for (const target of targets) this.collection.delete(target.id);
    return targets.length;
  }

  total(): number {
    return this.collection.size;
  }
}

export const caseService = new CaseService();
