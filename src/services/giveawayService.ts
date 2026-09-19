import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel,
} from 'discord.js';
import { db, type Collection, type Document } from '../core/database';
import { logger } from '../core/logger';
import { BotError, NotFoundError } from '../core/errors';
import { guildService, type GuildSettings } from './guildService';
import { baseEmbed, THEME } from '../ui/embeds';
import { buildButton } from '../ui/components';
import { formatDuration, timestampTag } from '../utils/duration';
import { humanizeNumber, plural, progressBar, truncate } from '../utils/format';
import { pickWeightedWinners } from '../utils/random';
import { logGiveaway } from './logService';

const log = logger.child('giveaway');

export interface GiveawayBonusRole {
  roleId: string;
  /** Nombre de tickets supplémentaires accordés aux porteurs. */
  tickets: number;
}

export interface Giveaway extends Document {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string | null;
  prize: string;
  description?: string | null;
  winnerCount: number;
  hostId: string;
  hostTag: string;
  endsAt: number;
  startedAt: number;
  ended: boolean;
  endedAt?: number | null;
  winners: string[];
  rerolled: string[][];
  entries: string[];
  requiredRoles: string[];
  requiredLevel?: number | null;
  requireAccountAge: number;
  requireMemberSince: number;
  bonusRoles: GiveawayBonusRole[];
  blacklistedRoleIds: string[];
  color: number;
  imageUrl?: string | null;
  pingRoleId?: string | null;
  /** Le giveaway a été terminé manuellement. */
  manualEnd?: boolean;
}

export interface CreateGiveawayInput {
  guildId: string;
  channelId: string;
  prize: string;
  description?: string | null;
  winnerCount: number;
  hostId: string;
  hostTag: string;
  durationMs: number;
  requiredRoles?: string[];
  requiredLevel?: number | null;
  requireAccountAge?: number;
  requireMemberSince?: number;
  bonusRoles?: GiveawayBonusRole[];
  color?: number;
  imageUrl?: string | null;
  pingRoleId?: string | null;
  blacklistedRoleIds?: string[];
}

/** Vérifie les conditions de participation et renvoie la raison d'un refus. */
export function checkEntryRequirements(
  giveaway: Giveaway,
  member: GuildMember,
  settings: GuildSettings,
): { ok: true } | { ok: false; reason: string } {
  const botMember = member.guild?.members?.me;
  if (botMember && member.id === botMember.id) return { ok: false, reason: 'Les bots ne participent pas 😅' };

  const blacklist = [...new Set([...giveaway.blacklistedRoleIds, ...settings.giveaway.blacklistedRoleIds])];
  if (blacklist.some((roleId) => member.roles.cache.has(roleId))) {
    return { ok: false, reason: 'Vous ne pouvez pas participer à ce giveaway.' };
  }

  if (giveaway.requiredRoles.length > 0) {
    const hasAll = giveaway.requiredRoles.every((roleId) => member.roles.cache.has(roleId));
    if (!hasAll) {
      const roles = giveaway.requiredRoles.map((roleId) => `<@&${roleId}>`).join(', ');
      return { ok: false, reason: `Il vous faut le(s) rôle(s) ${roles} pour participer.` };
    }
  }

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (giveaway.requireAccountAge > 0 && accountAgeDays < giveaway.requireAccountAge) {
    return {
      ok: false,
      reason: `Votre compte doit être créé depuis au moins **${giveaway.requireAccountAge} ${plural(giveaway.requireAccountAge, 'jour')}**.`,
    };
  }

  const memberSinceDays = member.joinedTimestamp ? (Date.now() - member.joinedTimestamp) / 86_400_000 : 0;
  if (giveaway.requireMemberSince > 0 && memberSinceDays < giveaway.requireMemberSince) {
    return {
      ok: false,
      reason: `Vous devez être membre depuis au moins **${giveaway.requireMemberSince} ${plural(giveaway.requireMemberSince, 'jour')}**.`,
    };
  }

  return { ok: true };
}

/** Calcule les tickets d'un membre (1 + bonus des rôles). */
export function computeTickets(giveaway: Giveaway, member: GuildMember): number {
  const bonus = giveaway.bonusRoles
    .filter((entry) => member.roles.cache.has(entry.roleId))
    .reduce((sum, entry) => sum + Math.max(entry.tickets, 0), 0);
  return 1 + bonus;
}

export class GiveawayService {
  private collection: Collection<Giveaway> = db.collection<Giveaway>('giveaways');

  create(input: CreateGiveawayInput): Giveaway {
    const settings = guildService.get(input.guildId);
    const id = String(guildService.nextGiveawayId(input.guildId));
    const giveaway: Giveaway = {
      id: `${input.guildId}:${id}`,
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: null,
      prize: input.prize,
      description: input.description ?? null,
      winnerCount: Math.max(1, input.winnerCount),
      hostId: input.hostId,
      hostTag: input.hostTag,
      startedAt: Date.now(),
      endsAt: Date.now() + input.durationMs,
      ended: false,
      endedAt: null,
      winners: [],
      rerolled: [],
      entries: [],
      requiredRoles: input.requiredRoles ?? [],
      requiredLevel: input.requiredLevel ?? null,
      requireAccountAge: input.requireAccountAge ?? settings.giveaway.requireAccountAge,
      requireMemberSince: input.requireMemberSince ?? settings.giveaway.requireMemberSince,
      bonusRoles: input.bonusRoles ?? [],
      blacklistedRoleIds: input.blacklistedRoleIds ?? [],
      color: input.color ?? THEME.colors.giveaway,
      imageUrl: input.imageUrl ?? null,
      pingRoleId: input.pingRoleId ?? null,
    };
    this.collection.set(giveaway);
    return giveaway;
  }

  get(id: string): Giveaway | undefined {
    const raw = this.collection.get(id) ?? this.collection.first((entry) => entry.id.endsWith(`:${id}`));
    if (!raw) return undefined;
    return { ...raw, entries: [...new Set(raw.entries ?? [])] };
  }

  getByMessage(guildId: string, messageId: string): Giveaway | undefined {
    return this.collection.first((entry) => entry.guildId === guildId && entry.messageId === messageId);
  }

  listActive(guildId?: string): Giveaway[] {
    return this.collection
      .find((entry) => !entry.ended && (!guildId || entry.guildId === guildId))
      .sort((a, b) => a.endsAt - b.endsAt);
  }

  listEnded(guildId: string, limit = 20): Giveaway[] {
    return this.collection
      .find((entry) => entry.ended && (!guildId || entry.guildId === guildId))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, limit);
  }

  attachMessage(id: string, messageId: string): void {
    this.collection.update(id, { messageId } as Partial<Giveaway>);
  }

  setEntries(id: string, entries: string[]): void {
    this.collection.update(id, { entries } as Partial<Giveaway>);
  }

  /** Met à jour un giveaway (patch brut). */
  update(id: string, patch: Partial<Giveaway>): Giveaway | undefined {
    return this.collection.update(id, patch as Giveaway);
  }

  delete(id: string): boolean {
    return this.collection.delete(id);
  }

  addEntry(id: string, userId: string): Giveaway {
    const giveaway = this.get(id);
    if (!giveaway) throw new NotFoundError('Giveaway introuvable.');
    if (giveaway.ended) throw new BotError('Ce giveaway est déjà terminé.');
    if (!giveaway.entries.includes(userId)) {
      this.collection.update(giveaway.id, { entries: [...giveaway.entries, userId] } as Partial<Giveaway>);
    }
    return this.get(id)!;
  }

  removeEntry(id: string, userId: string): Giveaway {
    const giveaway = this.get(id);
    if (!giveaway) throw new NotFoundError('Giveaway introuvable.');
    this.collection.update(giveaway.id, { entries: giveaway.entries.filter((entry) => entry !== userId) } as Partial<Giveaway>);
    return this.get(id)!;
  }

  /** Termine un giveaway et renvoie les gagnants tirés au sort. */
  async end(giveaway: Giveaway, guild: Guild, options: { manual?: boolean } = {}): Promise<{ winners: string[]; total: number }> {
    const fresh = this.get(giveaway.id) ?? giveaway;
    if (fresh.ended) throw new BotError('Ce giveaway est déjà terminé.');

    const candidates = fresh.entries
      .map((userId) => {
        const member = guild.members.cache.get(userId);
        const weight = member ? computeTickets(fresh, member) : 1;
        return { id: userId, weight };
      })
      .filter((candidate) => candidate.weight > 0);

    const winners = pickWeightedWinners(candidates, fresh.winnerCount);

    this.collection.update(fresh.id, {
      ended: true,
      endedAt: Date.now(),
      winners,
      manualEnd: Boolean(options.manual),
    } as Partial<Giveaway>);

    await this.updateMessage(guild, this.get(fresh.id)!);
    await logGiveaway({
      guild,
      title: options.manual ? 'Giveaway terminé manuellement' : 'Giveaway terminé',
      description: [
        `**Lot :** ${fresh.prize}`,
        `**Gagnant(s) :** ${winners.length ? winners.map((id) => `<@${id}>`).join(', ') : 'aucun (0 participation)'}`,
        `**Participations :** ${humanizeNumber(fresh.entries.length)}`,
        `**Hébergé par :** <@${fresh.hostId}>`,
      ].join('\n'),
    });

    log.info(`Giveaway « ${fresh.prize} » terminé (${winners.length} gagnant(s))`);
    return { winners, total: fresh.entries.length };
  }

  /** Retire un gagnant et en tire un nouveau parmi les perdants. */
  reroll(giveaway: Giveaway, guild: Guild, count = 1): string[] {
    const fresh = this.get(giveaway.id) ?? giveaway;
    if (!fresh.ended) throw new BotError('Ce giveaway n’est pas encore terminé.');
    const previousWinners = new Set(fresh.winners);
    const pool = fresh.entries.filter((userId) => !previousWinners.has(userId));

    const candidates = pool.map((userId) => {
      const member = guild.members.cache.get(userId);
      return { id: userId, weight: member ? computeTickets(fresh, member) : 1 };
    });

    const winners = pickWeightedWinners(candidates, count);
    const rerolled = [...fresh.rerolled, winners];
    this.collection.update(fresh.id, {
      winners,
      rerolled,
    } as Partial<Giveaway>);
    return winners;
  }

  /** Rendu de l'embed de giveaway (participants + compte à rebours). */
  buildEmbed(giveaway: Giveaway, guild?: Guild): EmbedBuilder {
    const ended = giveaway.ended;
    const total = ended ? (giveaway.endedAt ?? Date.now()) - giveaway.startedAt : Date.now() - giveaway.startedAt;
    const remaining = giveaway.endsAt - Date.now();
    const duration = giveaway.endsAt - giveaway.startedAt;

    const embed = baseEmbed({
      color: ended ? THEME.colors.neutral : giveaway.color,
      footer: `Giveaway #${giveaway.id.split(':')[1]} • Hébergé par ${giveaway.hostTag}`,
    });

    embed.setAuthor({ name: ended ? '🎉 Giveaway terminé' : '🎁 Giveaway en cours' });
    embed.setTitle(truncate(giveaway.prize, 240));
    if (giveaway.description) embed.setDescription(giveaway.description);
    if (giveaway.imageUrl) embed.setImage(giveaway.imageUrl);

    const entryLine = ended
      ? `**${humanizeNumber(giveaway.entries.length)}** participation${giveaway.entries.length > 1 ? 's' : ''}`
      : `${progressBar(duration - remaining, duration)} ${timestampTag(giveaway.endsAt, 'R')}`;

    embed.addFields(
      { name: '⏳ Fin', value: ended ? timestampTag(giveaway.endsAt, 'f') : timestampTag(giveaway.endsAt, 'F'), inline: true },
      { name: '🏆 Gagnant(s)', value: String(giveaway.winnerCount), inline: true },
      { name: '🎟️ Participations', value: entryLine, inline: false },
    );

    if (ended) {
      embed.addFields({
        name: '🥇 Résultat',
        value:
          giveaway.winners.length > 0
            ? giveaway.winners.map((id, index) => `${['🥇', '🥈', '🥉'][index] ?? '🏅'} <@${id}>`).join('\n')
            : '*Aucun participant valide…*',
      });
      if (giveaway.rerolled.length > 0) {
        embed.addFields({
          name: '🔄 Relances',
          value: giveaway.rerolled.map((round) => round.map((id) => `<@${id}>`).join(', ')).join(' • '),
        });
      }
      embed.addFields({ name: '⏱️ Durée', value: formatDuration(Math.max(total, 0)), inline: true });
    }

    const requirements: string[] = [];
    if (giveaway.requiredRoles.length > 0) {
      requirements.push(`Rôles requis : ${giveaway.requiredRoles.map((id) => `<@&${id}>`).join(', ')}`);
    }
    if (giveaway.requireAccountAge > 0) requirements.push(`Compte de ${giveaway.requireAccountAge} j minimum`);
    if (giveaway.requireMemberSince > 0) requirements.push(`Membre depuis ${giveaway.requireMemberSince} j`);
    if (giveaway.bonusRoles.length > 0) {
      requirements.push(
        `Tickets bonus : ${giveaway.bonusRoles.map((entry) => `<@&${entry.roleId}> (+${entry.tickets})`).join(', ')}`,
      );
    }
    if (requirements.length > 0) embed.addFields({ name: '📋 Conditions', value: requirements.join('\n') });

    return embed;
  }

  buildComponents(giveaway: Giveaway): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      buildButton({
        id: `gw:join:${giveaway.guildId}:${giveaway.id.split(':')[1]}`,
        label: `Participer (${giveaway.entries.length})`,
        emoji: '🎉',
        style: 'success',
        disabled: giveaway.ended,
      }),
      buildButton({
        id: `gw:leave:${giveaway.guildId}:${giveaway.id.split(':')[1]}`,
        label: 'Se retirer',
        emoji: '🚪',
        style: 'secondary',
        disabled: giveaway.ended,
      }),
      buildButton({
        id: `gw:list:${giveaway.guildId}:${giveaway.id.split(':')[1]}`,
        label: 'Participants',
        emoji: '🎟️',
        style: 'primary',
      }),
    );

    if (giveaway.ended) {
      row.addComponents(
        buildButton({
          id: `gw:reroll:${giveaway.guildId}:${giveaway.id.split(':')[1]}`,
          label: 'Relancer',
          emoji: '🔄',
          style: 'danger',
        }),
      );
    }

    return [row];
  }

  /** Met à jour le message du giveaway (embed + boutons). */
  async updateMessage(guild: Guild, giveaway: Giveaway): Promise<void> {
    if (!giveaway.messageId) return;
    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel || !channel.isTextBased()) return;
    try {
      const message: Message | null = await (channel as TextChannel).messages.fetch(giveaway.messageId).catch(() => null);
      if (!message) return;
      await message.edit({ embeds: [this.buildEmbed(giveaway, guild)], components: this.buildComponents(giveaway) });
    } catch (error) {
      log.warn(`Mise à jour du message de giveaway impossible (${giveaway.id})`, error);
    }
  }

  /** Récupère le giveaway associé à un message, en vérifiant le salon. */
  resolveFromMessage(guildId: string, channelId: string, messageId: string): Giveaway | undefined {
    const giveaway = this.getByMessage(guildId, messageId);
    if (giveaway && giveaway.channelId !== channelId) return undefined;
    return giveaway;
  }

  purgeGuild(guildId: string): number {
    const targets = this.collection.find((entry) => entry.guildId === guildId);
    for (const target of targets) this.collection.delete(target.id);
    return targets.length;
  }

  total(): number {
    return this.collection.size;
  }
}

export const giveawayService = new GiveawayService();
