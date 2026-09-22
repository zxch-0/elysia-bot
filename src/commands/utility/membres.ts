import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { progressBar, humanizeNumber, percent, accountAge } from '../../utils/format';
import { timestampTag } from '../../utils/duration';

/** Répartition d'une population par tranche d'ancienneté de compte. */
function seniorityBuckets(members: Array<{ user: { createdTimestamp: number } }>): Array<{ label: string; count: number }> {
  const buckets = [
    { label: 'Moins de 7 jours', count: 0, max: 7 },
    { label: '1 à 4 semaines', count: 0, max: 30 },
    { label: '1 à 6 mois', count: 0, max: 180 },
    { label: '6 à 24 mois', count: 0, max: 730 },
    { label: 'Plus de 2 ans', count: 0, max: Number.POSITIVE_INFINITY },
  ];
  for (const member of members) {
    const days = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    const bucket = buckets.find((entry) => days < entry.max) ?? buckets[buckets.length - 1];
    bucket.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

/** Présence des membres connus du cache (approximatif : dépend du cache du bot). */
function presenceBuckets(ctx: CommandContext): Array<{ label: string; count: number }> {
  const members = [...ctx.guild.members.cache.values()];
  const count = (status: string) => members.filter((member) => (member.presence?.status ?? 'offline') === status).length;
  return [
    { label: '🟢 En ligne', count: count('online') },
    { label: '🌙 Absent', count: count('idle') },
    { label: '⛔ Ne pas déranger', count: count('dnd') },
    { label: '⚪ Hors ligne', count: count('offline') },
  ];
}

/**
 * Statistiques de population du serveur : humains/bots, présence, ancienneté
 * des comptes, rôles les plus peuplés et derniers arrivés.
 */
const membersCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('membres')
    .setDescription('Statistiques de population du serveur (humains, bots, présence, ancienneté, rôles)')
    .setDMPermission(false)
    .addBooleanOption((option) => option.setName('derniers').setDescription('Afficher aussi les derniers membres arrivés')),
  category: 'utility',
  summary: 'Statistiques de la communauté',
  usage: ['/membres', '/membres derniers:true'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const withLatest = ctx.interaction.options.getBoolean('derniers') ?? false;
    const members = [...ctx.guild.members.cache.values()];
    const humans = members.filter((member) => !member.user.bot);
    const bots = members.filter((member) => member.user.bot);
    const boosters = members.filter((member) => Boolean(member.premiumSinceTimestamp));

    const embed = baseEmbed({
      title: `👥 Population de ${ctx.guild.name}`,
      description: [
        `**${humanizeNumber(ctx.guild.memberCount)}** membres au total`,
        `${progressBar(humans.length, Math.max(ctx.guild.memberCount, 1), 14)} ${percent(humans.length, ctx.guild.memberCount)} d’humains`,
      ].join('\n'),
      color: THEME.colors.primary,
      thumbnail: ctx.guild.iconURL({ size: 128 }),
      footer: `Cache du bot : ${humanizeNumber(members.length)} membre(s) analysés`,
    });

    embed.addFields(
      {
        name: '🧑 Répartition',
        value: [
          `Humains : **${humanizeNumber(humans.length)}**`,
          `Bots : **${humanizeNumber(bots.length)}**`,
          `Boosters : **${humanizeNumber(boosters.length)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🕒 Ancienneté des comptes',
        value: seniorityBuckets(members)
          .map((bucket) => `${bucket.label} : **${humanizeNumber(bucket.count)}**`)
          .join('\n'),
        inline: true,
      },
      {
        name: '📡 Présence',
        value: presenceBuckets(ctx)
          .map((bucket) => `${bucket.label} : **${humanizeNumber(bucket.count)}**`)
          .join('\n'),
        inline: true,
      },
    );

    const topRoles = [...ctx.guild.roles.cache.values()]
      .filter((role) => role.id !== ctx.guild.id && role.members.size > 0)
      .sort((a, b) => b.members.size - a.members.size)
      .slice(0, 8);

    embed.addFields({
      name: '🎭 Rôles les plus peuplés',
      value:
        topRoles.length > 0
          ? topRoles.map((role) => `${role.toString()} — **${humanizeNumber(role.members.size)}** (${percent(role.members.size, ctx.guild.memberCount)})`).join('\n')
          : '*aucun rôle attribué*',
    });

    if (withLatest) {
      const latest = members
        .filter((member) => member.joinedTimestamp)
        .sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0))
        .slice(0, 8);
      embed.addFields({
        name: '🆕 Derniers arrivés',
        value:
          latest.length > 0
            ? latest
                .map(
                  (member) =>
                    `${member.user.bot ? '🤖' : '👤'} ${member.user.tag} — ${timestampTag(member.joinedTimestamp ?? Date.now(), 'R')} (compte : ${accountAge(member.user.createdTimestamp)})`,
                )
                .join('\n')
            : '*cache vide*',
      });
    }

    return ctx.send(embed);
  },
};

export default membersCommand;
