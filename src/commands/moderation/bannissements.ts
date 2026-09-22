import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, warningEmbed, THEME } from '../../ui/embeds';
import { caseService } from '../../services/caseService';
import { timestampTag } from '../../utils/duration';
import { bulletList, humanizeNumber, truncate } from '../../utils/format';

const MAX_DISPLAYED = 20;

/**
 * Registre vivant des bannissements : liste réelle récupérée auprès de
 * Discord (avec raison), croisée avec les cases du bot pour repérer les
 * bannissements temporaires en cours et exporter le tout en JSON.
 */
const bansCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('bannissements')
    .setDescription('Liste les bannissements actifs du serveur, avec raisons et export')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('recherche').setDescription('Filtrer sur un nom ou un identifiant').setMaxLength(60))
    .addBooleanOption((option) => option.setName('export').setDescription('Générer un fichier JSON de tous les bannissements'))
    .addBooleanOption((option) => option.setName('temporaires').setDescription('N’afficher que les bannissements temporaires en cours'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  category: 'moderation',
  summary: 'Registre des bannissements',
  usage: ['/bannissements', '/bannissements recherche:spam', '/bannissements export:true'],
  permissions: { user: [PermissionFlagsBits.BanMembers], bot: [PermissionFlagsBits.BanMembers] },
  cooldown: 5,
  async run(ctx: CommandContext) {
    const search = ctx.interaction.options.getString('recherche')?.toLowerCase() ?? null;
    const exportJson = ctx.interaction.options.getBoolean('export') ?? false;
    const onlyTemporary = ctx.interaction.options.getBoolean('temporaires') ?? false;

    const bans = await ctx.guild.bans.fetch().catch(() => null);
    if (!bans) {
      return ctx.send(errorEmbed('Impossible de récupérer la liste des bannissements : vérifiez ma permission « Bannir des membres ».', 'Accès refusé'));
    }

    const entries = [...bans.values()];
    const cases = caseService.listGuild(ctx.guild.id).filter((entry) => entry.type === 'ban' || entry.type === 'softban');
    const caseByUser = new Map(cases.map((entry) => [entry.targetId, entry]));

    const temporary = entries
      .map((ban) => ({ ban, entry: caseByUser.get(ban.user.id) }))
      .filter(({ entry }) => entry?.duration && entry.duration > 0);
    const manual = entries.filter((ban) => !caseByUser.has(ban.user.id));

    let filtered = entries;
    if (search) {
      filtered = filtered.filter(
        (ban) => ban.user.tag.toLowerCase().includes(search) || ban.user.id.includes(search),
      );
    }
    if (onlyTemporary) {
      filtered = filtered.filter((ban) => {
        const entry = caseByUser.get(ban.user.id);
        return Boolean(entry?.duration && entry.duration > 0);
      });
    }

    if (exportJson) {
      const payload = filtered.map((ban) => {
        const entry = caseByUser.get(ban.user.id);
        return {
          id: ban.user.id,
          tag: ban.user.tag,
          reason: ban.reason ?? null,
          botCase: entry ? { numero: entry.caseNumber, moderateur: entry.moderatorTag, duree: entry.duration, expire: entry.expiresAt } : null,
        };
      });
      const file = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      const attachment = new AttachmentBuilder(file, { name: `bannissements-${ctx.guild.id}.json`, description: 'Bannissements actifs' });
      return ctx.interaction.editReply({
        embeds: [
          baseEmbed({
            title: '📦 Export des bannissements',
            description: `${humanizeNumber(payload.length)} entrée(s) exportée(s) au format JSON.`,
            color: THEME.colors.primary,
            footer: `Généré par ${ctx.interaction.user.tag}`,
          }),
        ],
        files: [attachment],
      });
    }

    if (filtered.length === 0) {
      return ctx.send(
        warningEmbed(
          'Aucun bannissement',
          search ? `Aucun bannissement ne correspond à « ${truncate(search, 40)} ».` : 'Ce serveur n’a aucun bannissement actif. 🎉',
        ),
      );
    }

    const sorted = [...filtered].sort((a, b) => b.user.createdTimestamp - a.user.createdTimestamp);
    const lines = sorted.slice(0, MAX_DISPLAYED).map((ban) => {
      const entry = caseByUser.get(ban.user.id);
      const suffix = entry
        ? entry.duration > 0
          ? ` • ⏳ temporaire (expire ${entry.expiresAt ? timestampTag(entry.expiresAt, 'R') : 'inconnu'})`
          : ` • case #${entry.caseNumber}`
        : ' • 🔧 manuel (hors bot)';
      const reason = ban.reason ? truncate(ban.reason, 90) : '*aucune raison fournie*';
      return `**${ban.user.tag}** (\`${ban.user.id}\`)${suffix}\n┕ ${reason}`;
    });

    const embed = baseEmbed({
      title: `🔨 Bannissements actifs — ${ctx.guild.name}`,
      description: [
        `**${humanizeNumber(entries.length)}** bannissement(s) au total`,
        `⏳ Temporaires en cours : **${humanizeNumber(temporary.length)}** • 🔧 Hors bot : **${humanizeNumber(manual.length)}**`,
        '',
        lines.join('\n\n').slice(0, 3_800),
        sorted.length > MAX_DISPLAYED ? `\n*… et ${sorted.length - MAX_DISPLAYED} autre(s) — affinez avec \`recherche:\`.*` : '',
      ].join('\n'),
      color: THEME.colors.error,
      thumbnail: ctx.guild.iconURL({ size: 128 }),
      footer: 'Utilisez /unban pour lever un bannissement, /cases pour le détail des sanctions',
    });

    if (temporary.length > 0) {
      embed.addFields({
        name: '⏳ Bannissements temporaires',
        value: bulletList(
          temporary
            .slice(0, 6)
            .map(({ ban, entry }) => `<@${ban.user.id}> — expire ${entry?.expiresAt ? timestampTag(entry.expiresAt, 'R') : 'bientôt'} (case #${entry?.caseNumber})`),
        ),
      });
    }

    return ctx.send(embed);
  },
};

export default bansCommand;
