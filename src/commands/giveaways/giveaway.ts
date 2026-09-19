import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { giveawayService } from '../../services/giveawayService';
import { guildService } from '../../services/guildService';
import { baseEmbed, errorEmbed, THEME } from '../../ui/embeds';
import { parseDuration, formatDuration, timestampTag } from '../../utils/duration';
import { humanizeNumber, bulletList, plural } from '../../utils/format';
import { canManageGiveaways } from '../../utils/permissions';
import { PermissionError, UsageError } from '../../core/errors';
import { logGiveaway } from '../../services/logService';
import { confirmRow } from '../../ui/components';
import { registerConfirmation } from '../../modules/confirmationModule';
import { shortCode } from '../../utils/random';

/** Options de rôle au format « id:label » ou simple identifiant. */
function parseRoleList(input: string | null, guild: import('discord.js').Guild): Array<{ roleId: string; label: string }> {
  if (!input) return [];
  return input
    .split(/[\s,]+/)
    .map((token) => token.replace(/[<@&>]/g, '').trim())
    .filter((token) => /^\d{17,20}$/.test(token))
    .map((roleId) => ({ roleId, label: guild.roles.cache.get(roleId)?.name ?? roleId }));
}

/**
 * Giveaway complet réservé aux administrateurs (et aux rôles hôtes configurés),
 * avec conditions de participation, tickets bonus par rôle et tirages relançables.
 */
const giveawayCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Gère les giveaways du serveur (réservé aux admins / rôles hôtes)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Lance un nouveau giveaway')
        .addStringOption((option) => option.setName('lot').setDescription('Ce qui est à gagner').setRequired(true).setMaxLength(200))
        .addStringOption((option) =>
          option.setName('duree').setDescription('Durée : 30m, 6h, 3j (défaut : config du serveur)').setMaxLength(24),
        )
        .addIntegerOption((option) =>
          option.setName('gagnants').setDescription('Nombre de gagnants (1-50)').setMinValue(1).setMaxValue(50),
        )
        .addChannelOption((option) =>
          option.setName('salon').setDescription('Salon d’annonce (par défaut : salon courant)').addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('description').setDescription('Texte d’accompagnement').setMaxLength(1000))
        .addStringOption((option) =>
          option.setName('roles_requis').setDescription('Rôles obligatoires (mentions ou identifiants, séparés par des espaces)').setMaxLength(400),
        )
        .addStringOption((option) =>
          option.setName('roles_bonus').setDescription('Rôles donnant des tickets en plus (id:nombre, ex. 1234:2 5678:3)').setMaxLength(400),
        )
        .addIntegerOption((option) =>
          option
            .setName('age_compte')
            .setDescription('Âge minimum du compte en jours (défaut : config du serveur)')
            .setMinValue(0)
            .setMaxValue(365),
        )
        .addIntegerOption((option) =>
          option.setName('anciennete_membre').setDescription('Ancienneté minimum sur le serveur, en jours').setMinValue(0).setMaxValue(365),
        )
        .addStringOption((option) => option.setName('image').setDescription('URL d’une image d’illustration (https://…)').setMaxLength(400))
        .addRoleOption((option) => option.setName('ping').setDescription('Rôle à mentionner au lancement')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('terminer')
        .setDescription('Termine immédiatement un giveaway et tire les gagnants')
        .addStringOption((option) => option.setName('identifiant').setDescription('Numéro du giveaway (ex. 3)').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('relancer')
        .setDescription('Tire un nouveau gagnant parmi les participants non gagnants')
        .addStringOption((option) => option.setName('identifiant').setDescription('Numéro du giveaway').setRequired(true).setAutocomplete(true))
        .addIntegerOption((option) => option.setName('gagnants').setDescription('Nombre de nouveaux gagnants').setMinValue(1).setMaxValue(25)),
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Liste les giveaways en cours et terminés'))
    .addSubcommand((sub) =>
      sub
        .setName('supprimer')
        .setDescription('Supprime un giveaway de la base (et son message)')
        .addStringOption((option) => option.setName('identifiant').setDescription('Numéro du giveaway').setRequired(true).setAutocomplete(true))
        .addBooleanOption((option) => option.setName('message').setDescription('Supprimer aussi le message Discord')),
    )
    .addSubcommand((sub) => sub.setName('stats').setDescription('Statistiques des giveaways du serveur')),
  category: 'giveaways',
  summary: 'Créer, terminer et relancer des giveaways',
  usage: ['/giveaway creer lot:Nitro 1 mois duree:3j gagnants:2 roles_requis:@Membre'],
  cooldown: 5,
  permissions: { user: [PermissionFlagsBits.ManageGuild] },
  async autocomplete(interaction) {
    const guildId = interaction.guildId ?? '';
    const query = String(interaction.options.getFocused(true).value ?? '');
    const entries = [...giveawayService.listActive(guildId), ...giveawayService.listEnded(guildId, 20)]
      .filter((entry) => String(entry.id.split(':')[1]).includes(query) || entry.prize.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 25)
      .map((entry) => ({
        name: `#${entry.id.split(':')[1]} — ${entry.prize.slice(0, 60)}${entry.ended ? ' (terminé)' : ' (en cours)'}`.slice(0, 100),
        value: entry.id.split(':')[1],
      }));
    await interaction.respond(entries);
  },
  async run(ctx: CommandContext) {
    const settings = guildService.get(ctx.guild.id);
    if (!settings.modules.giveaways) {
      throw new PermissionError('Le module **giveaways** est désactivé sur ce serveur. Réactivez-le avec `/config modules`.');
    }
    if (!canManageGiveaways(ctx.member, settings)) {
      throw new PermissionError(
        '🔒 Les giveaways sont réservés aux **administrateurs** et aux rôles hôtes configurés.\n➜ Un admin peut ajouter un rôle hôte avec `/config role-hote`.',
      );
    }

    const sub = ctx.subcommand() ?? 'liste';

    // ── Création ────────────────────────────────────────────────────────────
    if (sub === 'creer') {
      const prize = ctx.string('lot');
      const durationRaw = ctx.interaction.options.getString('duree');
      const winners = ctx.interaction.options.getInteger('gagnants') ?? settings.giveaway.defaultWinners;
      const channel =
        (ctx.interaction.options.getChannel('salon') as TextChannel | null) ?? (ctx.interaction.channel as TextChannel);
      const description = ctx.interaction.options.getString('description');
      const requiredRoles = parseRoleList(ctx.interaction.options.getString('roles_requis'), ctx.guild).map((role) => role.roleId);
      const accountAge = ctx.interaction.options.getInteger('age_compte') ?? settings.giveaway.requireAccountAge;
      const memberSince = ctx.interaction.options.getInteger('anciennete_membre') ?? settings.giveaway.requireMemberSince;
      const image = ctx.interaction.options.getString('image');
      const pingRole = ctx.interaction.options.getRole('ping');

      const bonusRoles = (() => {
        const raw = ctx.interaction.options.getString('roles_bonus');
        if (!raw) return [];
        return raw
          .split(/[\s,]+/)
          .map((token) => token.replace(/[<@&>]/g, ''))
          .filter(Boolean)
          .map((token) => {
            const [roleId, tickets] = token.split(':');
            const parsedTickets = Number.parseInt(tickets ?? '1', 10);
            return { roleId, tickets: Number.isFinite(parsedTickets) ? Math.min(Math.max(parsedTickets, 1), 20) : 1 };
          })
          .filter((entry) => /^\d{17,20}$/.test(entry.roleId));
      })();

      let durationMs = settings.giveaway.defaultDuration;
      if (durationRaw) {
        const parsed = parseDuration(durationRaw);
        if (parsed === null || parsed <= 0) throw new UsageError('Durée invalide. Exemples : `30m`, `6h`, `3j`.');
        durationMs = parsed;
      }
      if (durationMs < 30_000) throw new UsageError('La durée minimale d’un giveaway est de 30 secondes.');

      if (!channel?.isTextBased()) throw new UsageError('Le salon choisi ne permet pas d’envoyer des messages.');

      const giveaway = giveawayService.create({
        guildId: ctx.guild.id,
        channelId: channel.id,
        prize,
        description,
        winnerCount: winners,
        hostId: ctx.interaction.user.id,
        hostTag: ctx.interaction.user.tag,
        durationMs,
        requiredRoles,
        requireAccountAge: accountAge,
        requireMemberSince: memberSince,
        bonusRoles,
        imageUrl: image && /^https?:\/\//i.test(image) ? image : null,
        pingRoleId: pingRole?.id ?? null,
        blacklistedRoleIds: settings.giveaway.blacklistedRoleIds,
      });

      const message = await channel.send({
        content: pingRole ? `<@&${pingRole.id}> — un nouveau giveaway vient de commencer !` : '',
        embeds: [giveawayService.buildEmbed(giveaway, ctx.guild)],
        components: giveawayService.buildComponents(giveaway),
        allowedMentions: { parse: pingRole ? ['roles'] : [] },
      });
      giveawayService.attachMessage(giveaway.id, message.id);
      await message.react('🎉').catch(() => undefined);

      await logGiveaway({
        guild: ctx.guild,
        title: 'Nouveau giveaway',
        description: `**Lot :** ${prize}\n**Fin :** ${timestampTag(giveaway.endsAt, 'f')}\n**Gagnants :** ${winners}\n**Lancé par :** ${ctx.interaction.user}`,
      });

      return ctx.send(
        baseEmbed({
          title: '🎁 Giveaway lancé !',
          description: [
            `**Lot :** ${prize}`,
            `**Salon :** <#${channel.id}>`,
            `**Fin :** ${timestampTag(giveaway.endsAt, 'R')} (${formatDuration(durationMs)})`,
            `**Gagnant(s) :** ${winners}`,
            requiredRoles.length ? `**Rôles requis :** ${requiredRoles.map((id) => `<@&${id}>`).join(', ')}` : '',
            bonusRoles.length ? `**Bonus :** ${bonusRoles.map((entry) => `<@&${entry.roleId}> +${entry.tickets} 🎟️`).join(', ')}` : '',
            '',
            `Identifiant : \`${giveaway.id.split(':')[1]}\` — terminez-le à tout moment avec \`/giveaway terminer\`.`,
          ]
            .filter(Boolean)
            .join('\n'),
          color: THEME.colors.giveaway,
        }),
      );
    }

    // ── Fin anticipée ───────────────────────────────────────────────────────
    if (sub === 'terminer') {
      const identifier = ctx.string('identifiant');
      const giveaway = giveawayService.get(`${ctx.guild.id}:${identifier}`) ?? giveawayService.get(identifier);
      if (!giveaway || giveaway.guildId !== ctx.guild.id) return ctx.error(`Aucun giveaway trouvé avec l’identifiant \`${identifier}\`.`);
      if (giveaway.ended) return ctx.error('Ce giveaway est déjà terminé. Utilisez `/giveaway relancer` pour tirer un nouveau gagnant.');

      const { winners, total } = await giveawayService.end(giveaway, ctx.guild, { manual: true });

      const channel = ctx.guild.channels.cache.get(giveaway.channelId);
      if (channel?.isTextBased()) {
        await channel
          .send({
            content: winners.length > 0
              ? `🎉 Félicitations ${winners.map((id) => `<@${id}>`).join(', ')} ! Vous remportez **${giveaway.prize}** !`
              : '😢 Aucune participation valide : ce giveaway se termine sans gagnant.',
            allowedMentions: { parse: ['users'] },
          })
          .catch(() => undefined);
      }

      return ctx.send(
        baseEmbed({
          title: '🏁 Giveaway terminé',
          description: winners.length
            ? [`**Gagnant(s) :** ${winners.map((id) => `🎉 <@${id}>`).join(', ')}`, `**Participations :** ${humanizeNumber(total)}`].join('\n')
            : 'Aucune participation valide — aucun gagnant n’a été tiré.',
          color: THEME.colors.success,
        }),
      );
    }

    // ── Relance ─────────────────────────────────────────────────────────────
    if (sub === 'relancer') {
      const identifier = ctx.string('identifiant');
      const giveaway = giveawayService.get(`${ctx.guild.id}:${identifier}`) ?? giveawayService.get(identifier);
      if (!giveaway || giveaway.guildId !== ctx.guild.id) return ctx.error(`Aucun giveaway trouvé avec l’identifiant \`${identifier}\`.`);
      if (!giveaway.ended) return ctx.error('Ce giveaway est encore en cours. Terminez-le d’abord avec `/giveaway terminer`.');

      const count = ctx.interaction.options.getInteger('gagnants') ?? 1;
      const winners = giveawayService.reroll(giveaway, ctx.guild, count);
      const updated = giveawayService.get(giveaway.id)!;
      await giveawayService.updateMessage(ctx.guild, updated);

      const channel = ctx.guild.channels.cache.get(giveaway.channelId);
      if (channel?.isTextBased() && winners.length > 0) {
        await channel
          .send({
            content: `🔄 Nouveau tirage pour **${giveaway.prize}** : ${winners.map((id) => `<@${id}>`).join(', ')} 🎉`,
            allowedMentions: { parse: ['users'] },
          })
          .catch(() => undefined);
      }

      return ctx.send(
        baseEmbed({
          title: '🔄 Nouveau(x) gagnant(s)',
          description: winners.length
            ? winners.map((id) => `🎉 <@${id}> remporte **${giveaway.prize}**`).join('\n')
            : 'Aucun participant restant : impossible de relancer.',
          color: THEME.colors.giveaway,
        }),
      );
    }

    // ── Liste ───────────────────────────────────────────────────────────────
    if (sub === 'liste') {
      const active = giveawayService.listActive(ctx.guild.id);
      const ended = giveawayService.listEnded(ctx.guild.id, 10);

      const embed = baseEmbed({
        title: '🎁 Giveaways du serveur',
        color: THEME.colors.giveaway,
        footer: `${active.length} en cours • ${ended.length} récents`,
      });

      embed.addFields({
        name: '⏳ En cours',
        value:
          active.length === 0
            ? '*Aucun giveaway actif pour le moment.*'
            : active
                .map(
                  (entry) =>
                    `**#${entry.id.split(':')[1]}** — ${entry.prize} • ${humanizeNumber(entry.entries.length)} participant(s) • fin ${timestampTag(entry.endsAt, 'R')}`,
                )
                .join('\n')
                .slice(0, 1024),
      });

      embed.addFields({
        name: '🏁 Terminés récemment',
        value:
          ended.length === 0
            ? '*Aucun historique.*'
            : ended
                .map(
                  (entry) =>
                    `**#${entry.id.split(':')[1]}** — ${entry.prize} → ${entry.winners.length ? entry.winners.map((id) => `<@${id}>`).join(', ') : 'aucun gagnant'}`,
                )
                .join('\n')
                .slice(0, 1024),
      });

      return ctx.send(embed);
    }

    // ── Statistiques ────────────────────────────────────────────────────────
    if (sub === 'stats') {
      const all = giveawayService.listActive(ctx.guild.id);
      const ended = giveawayService.listEnded(ctx.guild.id, 100);
      const participation = ended.reduce((sum, entry) => sum + entry.entries.length, 0);

      return ctx.send(
        baseEmbed({
          title: '📈 Statistiques des giveaways',
          description: [
            `**Actifs :** ${all.length}`,
            `**Terminés (100 derniers) :** ${ended.length}`,
            `**Participations cumulées :** ${humanizeNumber(participation)}`,
            `**Taux moyen de participation :** ${ended.length ? Math.round(participation / ended.length) : 0} participants par tirage`,
            '',
            bulletList(
              ended
                .slice(0, 5)
                .map((entry) => `#${entry.id.split(':')[1]} — ${entry.prize} (${entry.entries.length} participations)`),
            ),
          ].join('\n'),
          color: THEME.colors.giveaway,
        }),
      );
    }

    // ── Suppression ─────────────────────────────────────────────────────────
    if (sub === 'supprimer') {
      const identifier = ctx.string('identifiant');
      const giveaway = giveawayService.get(`${ctx.guild.id}:${identifier}`) ?? giveawayService.get(identifier);
      if (!giveaway || giveaway.guildId !== ctx.guild.id) return ctx.error(`Aucun giveaway trouvé avec l’identifiant \`${identifier}\`.`);
      const deleteMessage = ctx.interaction.options.getBoolean('message') ?? false;

      const token = shortCode(10);
      registerConfirmation(token, {
        userId: ctx.interaction.user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        cancelMessage: 'Le giveaway est conservé.',
        onConfirm: async (buttonInteraction) => {
          if (deleteMessage && giveaway.messageId) {
            const channel = ctx.guild.channels.cache.get(giveaway.channelId);
            if (channel?.isTextBased()) {
              const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
              await message?.delete().catch(() => undefined);
            }
          }
          giveawayService.delete(giveaway.id);
          await buttonInteraction.editReply({
            embeds: [
              baseEmbed({
                title: '🗑️ Giveaway supprimé',
                description: `Le giveaway **#${giveaway.id.split(':')[1]}** (${giveaway.prize}) a été retiré.`,
                color: THEME.colors.error,
              }),
            ],
            components: [],
          });
        },
      });

      return ctx.interaction.editReply({
        embeds: [
          baseEmbed({
            title: '⚠️ Confirmation',
            description: [
              `Supprimer le giveaway **#${giveaway.id.split(':')[1]}** — **${giveaway.prize}** ?`,
              `**Participants :** ${giveaway.entries.length}`,
              deleteMessage ? 'Le message Discord sera également supprimé.' : 'Le message Discord sera conservé.',
            ].join('\n'),
            color: THEME.colors.warning,
          }),
        ],
        components: [confirmRow(token, { yes: 'Supprimer', no: 'Annuler' })],
      });
    }

    return ctx.error(
      `Sous-commande inconnue.\n${bulletList(['creer', 'terminer', 'relancer', 'liste', 'stats', 'supprimer'], { emptyText: '' })}`,
    );
  },
};

export { errorEmbed, plural };
export default giveawayCommand;
