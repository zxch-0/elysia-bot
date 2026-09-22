import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type Invite } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME, errorEmbed } from '../../ui/embeds';
import { bulletList, humanizeNumber, truncate } from '../../utils/format';
import { timestampTag, parseDuration, formatDuration } from '../../utils/duration';

/** Nombre maximal de salons où chercher une invitation lors de la création. */
const MAX_INVITE_AGE = 7 * 86_400_000;

function describeInvite(invite: Invite): string {
  const uses = invite.uses === null ? '?' : humanizeNumber(invite.uses);
  const max = invite.maxUses ? humanizeNumber(invite.maxUses) : '∞';
  const expiry = invite.expiresTimestamp ? `expire ${timestampTag(invite.expiresTimestamp, 'R')}` : 'permanent';
  const inviter = invite.inviter ? invite.inviter.tag : 'créateur inconnu';
  const channel = invite.channel ? `<#${invite.channel.id}>` : '*salon supprimé*';
  return `\`${invite.code}\` — **${uses}/${max}** • ${channel} • *${truncate(inviter, 24)}* • ${expiry}`;
}

/**
 * Gestion des invitations : inventaire complet (usages, salon, créateur,
 * expiration) et création d'une invitation sur mesure.
 */
const invitesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('invitations')
    .setDescription('Liste les invitations actives du serveur ou en crée une sur mesure')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Invitations actives, triées par nombre d’utilisations')
        .addBooleanOption((option) => option.setName('avec_sans_usage').setDescription('Inclure les invitations jamais utilisées')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Crée une invitation paramétrée')
        .addChannelOption((option) =>
          option
            .setName('salon')
            .setDescription('Salon cible (salon courant par défaut)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice),
        )
        .addStringOption((option) => option.setName('duree').setDescription('Durée de validité (ex. 1h, 7j — max 7 j)').setMaxLength(16))
        .addIntegerOption((option) => option.setName('utilisations').setDescription('Nombre maximal d’utilisations (0 = illimité)').setMinValue(0).setMaxValue(100))
        .addBooleanOption((option) => option.setName('temporaire').setDescription('Les membres invités ne restent que 24 h')),
    ),
  category: 'utility',
  summary: 'Invitations actives et création',
  usage: ['/invitations liste', '/invitations creer duree:24h utilisations:10'],
  permissions: { user: [PermissionFlagsBits.ManageGuild], bot: [PermissionFlagsBits.CreateInstantInvite] },
  cooldown: 5,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'liste';

    if (sub === 'creer') {
      const channelOption = ctx.interaction.options.getChannel('salon');
      const channel = (channelOption ?? ctx.interaction.channel) as { createInvite?: (options: Record<string, unknown>) => Promise<Invite> } | null;
      if (!channel?.createInvite) {
        return ctx.send(errorEmbed('Ce salon ne permet pas de créer une invitation.', 'Salon incompatible'));
      }

      const durationRaw = ctx.interaction.options.getString('duree');
      const maxUses = ctx.interaction.options.getInteger('utilisations') ?? 0;
      const temporary = ctx.interaction.options.getBoolean('temporaire') ?? false;

      let maxAge = 24 * 3_600;
      if (durationRaw) {
        const parsed = parseDuration(durationRaw);
        if (parsed === null || parsed <= 0) return ctx.send(errorEmbed('Durée invalide (ex. `1h`, `7j`).', 'Durée incorrecte'));
        maxAge = Math.min(Math.round(parsed / 1_000), 604_800);
      }

      const invite = await channel.createInvite({
        maxAge,
        maxUses,
        temporary,
        unique: true,
        reason: `Invitation créée par ${ctx.interaction.user.tag}`,
      });

      const embed = baseEmbed({
        title: '🔗 Invitation créée',
        description: [
          `**Lien :** ${invite.url}`,
          '',
          bulletList([
            `Salon : ${invite.channel && 'id' in invite.channel ? `<#${invite.channel.id}>` : 'inconnu'}`,
            `Durée : ${formatDuration(maxAge * 1_000)}`,
            `Utilisations max : ${maxUses === 0 ? 'illimitées' : maxUses}`,
            `Temporaire (24 h) : ${temporary ? 'oui' : 'non'}`,
          ]),
        ].join('\n'),
        color: THEME.colors.success,
        footer: `Code : ${invite.code}`,
      });
      return ctx.send(embed);
    }

    // ── Liste ───────────────────────────────────────────────────────────────
    const includeUnused = ctx.interaction.options.getBoolean('avec_sans_usage') ?? true;
    const invites = await ctx.guild.invites.fetch().catch(() => null);
    if (!invites) {
      return ctx.send(errorEmbed('Impossible de récupérer les invitations : vérifiez la permission « Gérer le serveur ».', 'Accès refusé'));
    }

    const all = [...invites.values()];
    const filtered = all.filter((invite) => includeUnused || (invite.uses ?? 0) > 0).sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0));
    const totalUses = all.reduce((sum, invite) => sum + (invite.uses ?? 0), 0);
    const expiring = all.filter((invite) => invite.expiresTimestamp && invite.expiresTimestamp - Date.now() < 86_400_000);
    const stale = all.filter((invite) => invite.createdTimestamp && Date.now() - invite.createdTimestamp > MAX_INVITE_AGE && (invite.uses ?? 0) === 0);

    const embed = baseEmbed({
      title: `🔗 Invitations de ${ctx.guild.name}`,
      description: [
        `**${humanizeNumber(all.length)}** invitation(s) active(s) • **${humanizeNumber(totalUses)}** arrivée(s) comptabilisée(s)`,
        '',
        filtered.length > 0 ? bulletList(filtered.slice(0, 15).map(describeInvite), { max: 15 }) : '*aucune invitation active*',
      ].join('\n'),
      color: THEME.colors.primary,
      thumbnail: ctx.guild.iconURL({ size: 128 }),
      footer: 'Astuce : les invitations illimitées servent de « lien d’entrée » permanent du serveur',
    });

    if (expiring.length > 0 || stale.length > 0) {
      embed.addFields({
        name: '🧹 Ménage suggéré',
        value: bulletList(
          [
            expiring.length > 0 ? `${expiring.length} invitation(s) expirent dans moins de 24 h.` : null,
            stale.length > 0 ? `${stale.length} invitation(s) créées il y a plus de 7 jours sans aucune utilisation.` : null,
          ].filter((line): line is string => line !== null),
        ),
      });
    }

    return ctx.send(embed);
  },
};

export default invitesCommand;
