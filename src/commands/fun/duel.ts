import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import { createDuel, DUEL_ROUND_CHOICES, setDuelMessage, type DuelSession } from '../../fun/duel';
import { UsageError } from '../../core/errors';

/** Message d'invitation au duel, avec les boutons Accepter / Refuser. */
export function renderDuelChallenge(session: DuelSession) {
  const embed = baseEmbed({
    title: '🤺 Défi lancé !',
    description: [
      `<@${session.hostId}> défie <@${session.targetId}> en duel de dés.`,
      '',
      `**Manches :** ${session.rounds}`,
      session.bet ? `**Gage en jeu :** ${session.bet}` : '**Gage en jeu :** *libre, à négocier*',
      '',
      `➜ <@${session.targetId}>, acceptez-vous ? Le défi expire ${'<t:' + Math.floor(session.expiresAt / 1_000) + ':R>'}.`,
    ].join('\n'),
    color: THEME.colors.warning,
    footer: `Duel ${session.id} • 2d6 par manche, le meilleur total remporte la manche`,
  });

  const rows = buttonRows([
    { id: `duel:accept:${session.id}`, label: 'Accepter', emoji: '⚔️', style: 'success' },
    { id: `duel:decline:${session.id}`, label: 'Refuser', emoji: '🏳️', style: 'danger' },
    { id: `duel:cancel:${session.id}`, label: 'Annuler (hôte)', emoji: '✖️', style: 'secondary' },
  ]);

  return { embeds: [embed], components: rows };
}

/**
 * Duel de dés amical entre deux membres, avec gage libre et manches.
 * L'adversaire doit accepter : le gagnant est désigné automatiquement.
 */
const duelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Défie un membre en duel de dés (avec gage et manches)')
    .setDMPermission(false)
    .addUserOption((option) => option.setName('adversaire').setDescription('Membre à défier').setRequired(true))
    .addStringOption((option) => option.setName('gage').setDescription('Ce que le perdant doit faire (facultatif)').setMaxLength(200))
    .addIntegerOption((option) =>
      option.setName('manches').setDescription('Nombre de manches').addChoices(...DUEL_ROUND_CHOICES.map((value) => ({ name: `${value} manche(s)`, value }))),
    ),
  category: 'fun',
  summary: 'Duel de dés entre membres',
  usage: ['/duel adversaire:@Léo manches:3', '/duel adversaire:@Léo gage:Crier ALLEZ en vocal'],
  cooldown: 10,
  async run(ctx: CommandContext) {
    const target = ctx.interaction.options.getMember('adversaire');
    const member = Array.isArray(target) ? target[0] : target;
    if (!member) throw new UsageError('Ce membre n’est pas présent sur le serveur.');
    if (member.id === ctx.interaction.user.id) throw new UsageError('Vous ne pouvez pas vous défier vous-même 🙃');
    if (member.user.bot) throw new UsageError('Les bots refusent toujours les duels : ils trichent aux dés 🤖');

    const bet = ctx.interaction.options.getString('gage');
    const rounds = ctx.interaction.options.getInteger('manches') ?? 3;

    const session = createDuel({
      guildId: ctx.guild.id,
      channelId: ctx.interaction.channelId,
      hostId: ctx.interaction.user.id,
      hostTag: ctx.interaction.user.tag,
      targetId: member.id,
      targetTag: member.user.tag,
      rounds,
      bet,
    });

    const channel = ctx.interaction.channel;
    if (channel?.isTextBased() && !channel.isDMBased()) {
      const message = await channel.send(renderDuelChallenge(session));
      setDuelMessage(session.id, message.id);
    }

    return ctx.send(
      baseEmbed({
        title: '⚔️ Défi envoyé',
        description: [
          `<@${member.id}> doit maintenant **accepter** le duel dans ce salon.`,
          session.bet ? `Gage : *${session.bet}*` : 'Aucun gage défini — le perdant improvise !',
          '',
          `Identifiant du duel : \`${session.id}\``,
        ].join('\n'),
        color: THEME.colors.warning,
      }),
    );
  },
};

export default duelCommand;
