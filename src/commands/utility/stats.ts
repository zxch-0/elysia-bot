import { SlashCommandBuilder, version as discordVersion } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import type { ElysiaClient } from '../../core/client';
import { baseEmbed, THEME } from '../../ui/embeds';
import { humanizeNumber } from '../../utils/format';
import { formatDuration } from '../../utils/duration';
import { giveawayService } from '../../services/giveawayService';
import { caseService } from '../../services/caseService';
import { panelService } from '../../services/panelService';

const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('bot-stats')
    .setDescription('Statistiques techniques du bot (latence, mémoire, serveurs, données)')
    .setDMPermission(false),
  category: 'utility',
  summary: 'État de santé du bot',
  cooldown: 5,
  publicReply: false,
  async run(ctx: CommandContext) {
    const client = ctx.client as ElysiaClient;
    const memory = process.memoryUsage();
    const snapshot = client.snapshot();

    const embed = baseEmbed({
      title: '📊 Statistiques d’Elysia',
      color: THEME.colors.info,
      thumbnail: client.user?.displayAvatarURL({ size: 256 }),
      footer: `Node ${process.version} • discord.js ${discordVersion}`,
    });

    embed.addFields(
      { name: '⚡ Latence', value: `\`${snapshot.latencyMs} ms\``, inline: true },
      { name: '⏱️ Uptime', value: formatDuration(snapshot.uptimeMs, { compact: true }), inline: true },
      { name: '🖥️ Mémoire', value: `${Math.round(memory.heapUsed / 1048576)} Mo`, inline: true },
      { name: '🏰 Serveurs', value: humanizeNumber(snapshot.guildCount), inline: true },
      { name: '👥 Membres', value: humanizeNumber(snapshot.userCount), inline: true },
      { name: '⌨️ Commandes', value: humanizeNumber(snapshot.commandCount), inline: true },
      { name: '🎁 Giveaways actifs', value: humanizeNumber(giveawayService.listActive().length), inline: true },
      { name: '🎭 Panneaux', value: humanizeNumber(panelService.listGuild(ctx.guild.id).length), inline: true },
      { name: '📁 Cases de modération', value: humanizeNumber(caseService.total()), inline: true },
      {
        name: '🔢 Compteurs de session',
        value: [
          `Commandes exécutées : **${humanizeNumber(client.stats.commandsRun)}**`,
          `Interactions : **${humanizeNumber(client.stats.interactionsHandled)}**`,
          `Giveaways terminés : **${humanizeNumber(client.stats.giveawaysEnded)}**`,
          `Erreurs : **${humanizeNumber(client.stats.errors)}**`,
        ].join('\n'),
      },
    );

    return ctx.send(embed);
  },
};

export default statsCommand;
