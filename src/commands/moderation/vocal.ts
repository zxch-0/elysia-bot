import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type VoiceChannel } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, successEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { humanizeNumber } from '../../utils/format';
import { UsageError } from '../../core/errors';

/** Salons vocaux du serveur (hors salons de scène et catégories). */
function voiceChannels(ctx: CommandContext): VoiceChannel[] {
  return [...ctx.guild.channels.cache.values()].filter(
    (channel): channel is VoiceChannel => channel.type === ChannelType.GuildVoice,
  );
}

/**
 * Outils de modération vocale : déplacer, expulser, rendre muet, verrouiller,
 * limiter le nombre de places et afficher l'activité des salons vocaux.
 */
const voiceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('vocal')
    .setDescription('Outils de modération vocale (déplacer, expulser, muet, verrouiller, limite)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('deplacer')
        .setDescription('Déplace un ou plusieurs membres vers un salon vocal')
        .addUserOption((option) => option.setName('membre').setDescription('Membre à déplacer').setRequired(true))
        .addChannelOption((option) =>
          option.setName('salon').setDescription('Salon vocal de destination').setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('expulser')
        .setDescription('Déconnecte un membre du vocal')
        .addUserOption((option) => option.setName('membre').setDescription('Membre à déconnecter').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('muet')
        .setDescription('Rend muet ou rétablit un membre dans le vocal')
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addBooleanOption((option) => option.setName('actif').setDescription('true = rendre muet, false = rétablir').setRequired(true))
        .addBooleanOption((option) => option.setName('sourd').setDescription('Rendre également sourd (casque coupé)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('verrouiller')
        .setDescription('Verrouille ou déverrouille un salon vocal')
        .addChannelOption((option) => option.setName('salon').setDescription('Salon vocal (le vôtre par défaut)').addChannelTypes(ChannelType.GuildVoice))
        .addBooleanOption((option) => option.setName('verrouiller').setDescription('true = verrouiller, false = ouvrir')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('limite')
        .setDescription('Fixe le nombre de places d’un salon vocal (0 = illimité)')
        .addIntegerOption((option) => option.setName('places').setDescription('Nombre de places (0-99)').setRequired(true).setMinValue(0).setMaxValue(99))
        .addChannelOption((option) => option.setName('salon').setDescription('Salon vocal (le vôtre par défaut)').addChannelTypes(ChannelType.GuildVoice)),
    )
    .addSubcommand((sub) => sub.setName('personnes').setDescription('Liste les membres actuellement en vocal avec leur état')),
  category: 'moderation',
  summary: 'Modération des salons vocaux',
  usage: ['/vocal personnes', '/vocal deplacer membre:@Léo salon:🔊 Général', '/vocal muet membre:@Léo actif:true'],
  permissions: {
    user: [PermissionFlagsBits.MoveMembers],
    bot: [PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.ManageChannels],
  },
  cooldown: 3,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'personnes';

    // ── Liste des membres en vocal ──────────────────────────────────────────
    if (sub === 'personnes') {
      const channels = voiceChannels(ctx).filter((channel) => channel.members.size > 0);
      if (channels.length === 0) {
        return ctx.send(warningEmbed('Vocal vide', 'Aucun membre n’est connecté à un salon vocal pour le moment.'));
      }

      const embed = baseEmbed({
        title: '🔊 Activité vocale',
        description: channels
          .sort((a, b) => b.members.size - a.members.size)
          .map((channel) => {
            const members = channel.members
              .map((member) => {
                const flags: string[] = [];
                if (member.voice.serverMute) flags.push('🔇 muet serveur');
                if (member.voice.selfMute) flags.push('🔈 micro coupé');
                if (member.voice.serverDeaf) flags.push('🔕 sourd (forcé)');
                if (member.voice.streaming) flags.push('📺 en direct');
                return `${member.user.bot ? '🤖' : '👤'} ${member.user.tag}${flags.length > 0 ? ` — *${flags.join(', ')}*` : ''}`;
              })
              .join('\n');
            return `**${channel.name}** — ${humanizeNumber(channel.members.size)}/${channel.userLimit || '∞'}\n${members}`;
          })
          .join('\n\n')
          .slice(0, 4_000),
        color: THEME.colors.info,
        footer: `${humanizeNumber(channels.reduce((sum, channel) => sum + channel.members.size, 0))} membre(s) en vocal • ${humanizeNumber(voiceChannels(ctx).length)} salon(s) vocal(aux)`,
      });
      return ctx.send(embed);
    }

    // ── Déplacer ────────────────────────────────────────────────────────────
    if (sub === 'deplacer') {
      const member = ctx.memberOf('membre');
      const channel = ctx.interaction.options.getChannel('salon') as VoiceChannel | null;
      if (!channel) throw new UsageError('Salon vocal de destination introuvable.');
      if (!member.voice.channel) throw new UsageError(`${member.user.tag} n’est pas connecté à un salon vocal.`);

      const previous = member.voice.channel.name;
      await member.voice.setChannel(channel, `Déplacement par ${ctx.interaction.user.tag}`);

      return ctx.send(
        successEmbed('Membre déplacé', `**${member.user.tag}** est passé de **${previous}** à **${channel.name}**.`),
      );
    }

    // ── Expulser ────────────────────────────────────────────────────────────
    if (sub === 'expulser') {
      const member = ctx.memberOf('membre');
      if (!member.voice.channel) throw new UsageError(`${member.user.tag} n’est pas en vocal.`);
      if (member.voice.channelId === ctx.guild.afkChannelId && ctx.member.id === member.id) {
        return ctx.send(warningEmbed('Rien à faire', 'Ce membre est déjà dans le salon d’inactivité.'));
      }

      const channelName = member.voice.channel.name;
      await member.voice.disconnect(`Déconnexion par ${ctx.interaction.user.tag}`);
      return ctx.send(successEmbed('Membre déconnecté', `**${member.user.tag}** a été retiré du salon **${channelName}**.`));
    }

    // ── Muet / sourd ────────────────────────────────────────────────────────
    if (sub === 'muet') {
      const member = ctx.memberOf('membre');
      const active = ctx.boolean('actif');
      const deaf = ctx.interaction.options.getBoolean('sourd') ?? false;
      if (!member.voice.channel) throw new UsageError(`${member.user.tag} n’est pas en vocal : le mute vocal n’a pas d’effet.`);

      await member.voice.setMute(active, `Mute vocal par ${ctx.interaction.user.tag}`);
      if (deaf) await member.voice.setDeaf(active, `Sourdine vocale par ${ctx.interaction.user.tag}`);

      return ctx.send(
        successEmbed(
          active ? 'Micro coupé' : 'Micro rétabli',
          [
            `**${member.user.tag}** ${active ? 'a été rendu muet' : 'peut de nouveau parler'} dans **${member.voice.channel.name}**.`,
            deaf ? `Casque : ${active ? 'sourdine activée' : 'sourdine levée'}.` : '',
            active ? '`/vocal muet actif:false` pour rétablir le son.' : '',
          ]
            .filter((line) => line !== '')
            .join('\n'),
        ),
      );
    }

    // ── Verrouiller / ouvrir ────────────────────────────────────────────────
    if (sub === 'verrouiller') {
      const optionChannel = ctx.interaction.options.getChannel('salon') as VoiceChannel | null;
      const channel = optionChannel ?? (ctx.member.voice.channel as VoiceChannel | null);
      if (!channel) throw new UsageError('Précisez un `salon:` ou connectez-vous à un salon vocal.');
      const locked = ctx.interaction.options.getBoolean('verrouiller') ?? true;

      await channel.permissionOverwrites.edit(
        ctx.guild.roles.everyone,
        { Connect: locked ? false : null },
        { reason: `${locked ? 'Verrouillage' : 'Ouverture'} par ${ctx.interaction.user.tag}` },
      );

      return ctx.send(
        successEmbed(locked ? 'Salon verrouillé' : 'Salon ouvert', `**${channel.name}** ${locked ? 'n’accepte plus' : 'accepte de nouveau'} de nouvelles connexions.`),
      );
    }

    // ── Limite de place ─────────────────────────────────────────────────────
    const optionChannel = ctx.interaction.options.getChannel('salon') as VoiceChannel | null;
    const channel = optionChannel ?? (ctx.member.voice.channel as VoiceChannel | null);
    if (!channel) throw new UsageError('Précisez un `salon:` ou connectez-vous à un salon vocal.');
    const limit = ctx.integer('places');

    await channel.setUserLimit(limit, `Limite modifiée par ${ctx.interaction.user.tag}`);
    return ctx.send(
      baseEmbed({
        title: '👥 Limite de places mise à jour',
        description: `**${channel.name}** : ${limit === 0 ? 'illimité' : `${limit} place(s)`}`,
        color: THEME.colors.success,
        footer: `Demandé par ${ctx.interaction.user.tag}`,
      }),
    );
  },
};

export default voiceCommand;
