import type { Message } from 'discord.js';
import { randomInt } from 'node:crypto';
import { db, type Collection, type Document } from '../core/database';
import { guildService, type GuildSettings } from './guildService';

/** Devise du serveur : pièce d'or. */
export const CURRENCY_EMOJI = '🪙';

export interface EconomyEntry extends Document {
  /** `${guildId}:${userId}` */
  id: string;
  guildId: string;
  userId: string;
  tag: string;
  /** Solde disponible (portefeuille). */
  wallet: number;
  /** Total gagné en discutant. */
  earned: number;
  /** Gain net cumulé au casino (peut être négatif). */
  casinoNet: number;
  /** Volume total misé au casino. */
  wagered: number;
  /** Argent reçu par transferts. */
  transfersIn: number;
  /** Argent envoyé par transferts. */
  transfersOut: number;
  /** Nombre de messages récompensés. */
  messages: number;
  lastGainAt: number;
  updatedAt: number;
}

/**
 * Système d'économie (`/argent`).
 * L'argent est gagné en discutant (petits montants, anti-flood), dépensé au
 * blackjack et transférable entre membres. Tout est persisté par serveur.
 */
export class EconomyService {
  private readonly collection: Collection<EconomyEntry> = db.collection<EconomyEntry>('economy');

  private key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  entry(guildId: string, userId: string): EconomyEntry | undefined {
    return this.collection.get(this.key(guildId, userId));
  }

  /** Solde courant d'un membre (0 s'il n'a pas encore de portefeuille). */
  balance(guildId: string, userId: string): number {
    return this.entry(guildId, userId)?.wallet ?? 0;
  }

  /**
   * Crée l'entrée si besoin, avec le capital de départ configuré.
   * (Écriture uniquement lors d'une opération monétaire — jamais en lecture.)
   */
  ensure(guildId: string, userId: string, tag: string): EconomyEntry {
    const existing = this.collection.get(this.key(guildId, userId));
    if (existing) {
      if (tag && existing.tag !== tag) existing.tag = tag;
      return existing;
    }
    const starting = Math.max(0, Math.trunc(guildService.get(guildId).economy.startingBalance));
    const entry: EconomyEntry = {
      id: this.key(guildId, userId),
      guildId,
      userId,
      tag,
      wallet: starting,
      earned: 0,
      casinoNet: 0,
      wagered: 0,
      transfersIn: 0,
      transfersOut: 0,
      messages: 0,
      lastGainAt: 0,
      updatedAt: Date.now(),
    };
    this.collection.set(entry);
    return entry;
  }

  /**
   * Traite un message : crédite un petit montant d'argent si le délai
   * anti-flood est écoulé. Retourne `null` si aucun gain n'a été attribué.
   */
  handleMessage(message: Message, settings: GuildSettings, now = Date.now()): { gained: number; entry: EconomyEntry } | null {
    if (!settings.modules.economy || !settings.economy.enabled) return null;
    if (message.author.bot || !message.guildId || !message.inGuild()) return null;
    if (message.system) return null;

    const entry = this.ensure(message.guildId, message.author.id, message.author.tag);
    if (now - entry.lastGainAt < settings.economy.cooldownMs) return null;

    const min = Math.max(settings.economy.moneyMin, 1);
    const max = Math.max(settings.economy.moneyMax, min);
    const gained = max === min ? min : randomInt(min, max + 1);

    entry.wallet += gained;
    entry.earned += gained;
    entry.messages += 1;
    entry.lastGainAt = now;
    entry.tag = message.author.tag;
    entry.updatedAt = now;
    this.collection.set(entry);

    return { gained, entry };
  }

  /** Crédite un montant (récompense admin, restitution de mise…). */
  credit(guildId: string, userId: string, tag: string, amount: number): EconomyEntry {
    const entry = this.ensure(guildId, userId, tag);
    const safe = Math.max(0, Math.trunc(amount));
    entry.wallet += safe;
    entry.updatedAt = Date.now();
    this.collection.set(entry);
    return entry;
  }

  /**
   * Débite un montant en bornant à zéro (jamais de solde négatif).
   * Ne crée pas de portefeuille : retirer chez un membre sans solde ne rend que 0.
   * Retourne le montant réellement retiré.
   */
  debit(guildId: string, userId: string, tag: string, amount: number): number {
    const existing = this.collection.get(this.key(guildId, userId));
    if (!existing) return 0;
    const wanted = Math.max(0, Math.trunc(amount));
    const removed = Math.min(wanted, existing.wallet);
    existing.wallet -= removed;
    if (tag && existing.tag !== tag) existing.tag = tag;
    existing.updatedAt = Date.now();
    this.collection.set(existing);
    return removed;
  }

  /** Fixe le solde à un montant précis (remise à zéro, correction admin). */
  setWallet(guildId: string, userId: string, tag: string, amount: number): EconomyEntry {
    const entry = this.ensure(guildId, userId, tag);
    entry.wallet = Math.max(0, Math.trunc(amount));
    entry.updatedAt = Date.now();
    this.collection.set(entry);
    return entry;
  }

  /**
   * Transfert entre deux membres. Retourne `null` en cas d'échec
   * (solde insuffisant, montant invalide, même personne) sinon le détail.
   */
  transfer(
    guildId: string,
    fromId: string,
    fromTag: string,
    toId: string,
    toTag: string,
    amount: number,
  ): { amount: number; from: EconomyEntry; to: EconomyEntry } | null {
    const safe = Math.trunc(amount);
    if (!Number.isFinite(safe) || safe <= 0 || fromId === toId) return null;
    const from = this.ensure(guildId, fromId, fromTag);
    if (from.wallet < safe) return null;
    const to = this.ensure(guildId, toId, toTag);
    from.wallet -= safe;
    from.transfersOut += safe;
    to.wallet += safe;
    to.transfersIn += safe;
    const now = Date.now();
    from.updatedAt = now;
    to.updatedAt = now;
    this.collection.set(from);
    this.collection.set(to);
    return { amount: safe, from, to };
  }

  // ── Casino (blackjack) ────────────────────────────────────────────────────

  /**
   * Tente de poser une mise : débite `amount` du portefeuille si le solde le
   * permet. Retourne `false` (sans rien faire) sinon.
   */
  tryBet(guildId: string, userId: string, tag: string, amount: number): boolean {
    const safe = Math.trunc(amount);
    if (!Number.isFinite(safe) || safe <= 0) return false;
    const entry = this.ensure(guildId, userId, tag);
    if (entry.wallet < safe) return false;
    entry.wallet -= safe;
    entry.wagered += safe;
    entry.updatedAt = Date.now();
    this.collection.set(entry);
    return true;
  }

  /**
   * Clôture une mise : restitue la mise totale (`stake`) augmentée du gain
   * net (`net`, négatif en cas de perte) et met à jour les statistiques casino.
   */
  settleBet(guildId: string, userId: string, tag: string, stake: number, net: number): EconomyEntry {
    const entry = this.ensure(guildId, userId, tag);
    const safeStake = Math.max(0, Math.trunc(stake));
    const safeNet = Math.trunc(net);
    entry.wallet += safeStake + safeNet;
    if (entry.wallet < 0) entry.wallet = 0;
    entry.casinoNet += safeNet;
    entry.updatedAt = Date.now();
    this.collection.set(entry);
    return entry;
  }

  // ── Classements & statistiques ───────────────────────────────────────────

  /** Classement d'un serveur par solde décroissant. */
  leaderboard(guildId: string, limit = 10): EconomyEntry[] {
    return this.collection
      .find((entry) => entry.guildId === guildId && entry.wallet > 0)
      .sort((a, b) => b.wallet - a.wallet || a.userId.localeCompare(b.userId))
      .slice(0, Math.max(limit, 1));
  }

  /** Rang d'un membre (1 = premier) ou `null` s'il n'a rien. */
  rank(guildId: string, userId: string): number | null {
    const entry = this.entry(guildId, userId);
    if (!entry || entry.wallet <= 0) return null;
    return this.collection.count((item) => item.guildId === guildId && item.wallet > entry.wallet) + 1;
  }

  countActive(guildId: string): number {
    return this.collection.count((entry) => entry.guildId === guildId && entry.wallet > 0);
  }

  /** Argent en circulation sur un serveur. */
  totalMoney(guildId: string): number {
    return this.collection.find((entry) => entry.guildId === guildId).reduce((sum, entry) => sum + entry.wallet, 0);
  }

  /** Total gagné en discutant sur un serveur. */
  totalEarned(guildId: string): number {
    return this.collection.find((entry) => entry.guildId === guildId).reduce((sum, entry) => sum + entry.earned, 0);
  }

  /** Agrégats casino et transferts d'un serveur (site intégré). */
  totals(guildId: string): {
    money: number;
    earned: number;
    casinoNet: number;
    wagered: number;
    transfers: number;
    members: number;
  } {
    let money = 0;
    let earned = 0;
    let casinoNet = 0;
    let wagered = 0;
    let transfers = 0;
    let members = 0;
    for (const entry of this.collection.find((item) => item.guildId === guildId)) {
      money += entry.wallet;
      earned += entry.earned;
      casinoNet += entry.casinoNet;
      wagered += entry.wagered;
      transfers += entry.transfersIn;
      members += 1;
    }
    return { money, earned, casinoNet, wagered, transfers, members };
  }

  /** Supprime les entrées de membres ayant quitté le serveur (entretien). */
  pruneGuild(guildId: string, keepIds: Set<string>): number {
    const stale = this.collection.find((entry) => entry.guildId === guildId && !keepIds.has(entry.userId));
    for (const entry of stale) this.collection.delete(entry.id);
    return stale.length;
  }

  total(): number {
    return this.collection.size;
  }
}

export const economyService = new EconomyService();
