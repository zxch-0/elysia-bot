import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import type { ElysiaClient } from '../../core/client';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, paginationRow } from '../../ui/components';
import { CATEGORIES, categoryMeta } from '../categories';
import { chunk } from '../../utils/format';

/** Commandes par catégorie, mise en page en pages de 2 catégories. */
function groupCommands(client: ElysiaClient) {
  return CATEGORIES.map((category) => ({
    meta: category,
    commands: [...client.commands.values()]
      .filter((command) => command.category === category.id)
      .sort((a, b) => a.data.name.localeCompare(b.data.name)),
  })).filter((group) => group.commands.length > 0);
}

export function helpTotalPages(client: ElysiaClient): number {
  return Math.max(1, chunk(groupCommands(client), 2).length);
}

export function buildHelpEmbed(client: ElysiaClient, page = 0) {
  const pages = chunk(groupCommands(client), 2);
  const current = pages[Math.min(Math.max(page, 0), pages.length - 1)] ?? [];

  const embed = baseEmbed({
    title: '💜 Elysia — centre d’aide',
    description: [
      `Bot tout-en-un : **modération**, **giveaways**, **panneaux de rôles** et **mini-jeux**.`,
      `Préfixe : commandes slash uniquement — tape \`/\` puis le nom d’une commande.`,
      '',
      `**Commandes disponibles :** ${client.commands.size}`,
      `**Serveurs :** ${client.guilds.cache.size}`,
    ].join('\n'),
    color: THEME.colors.primary,
    thumbnail: client.user?.displayAvatarURL({ size: 256 }),
    footer: `Page ${page + 1}/${Math.max(pages.length, 1)} • Elysia v1.0.0`,
  });

  for (const group of current) {
    embed.addFields({
      name: `${group.meta.emoji} ${group.meta.label}`,
      value: group.commands
        .map((command) => {
          const summary = command.summary ?? command.data.description ?? 'Commande';
          const usage = command.usage?.[0] ? `\n   ↳ ${command.usage[0]}` : '';
          return `**/${command.data.name}** — ${summary}${usage}`;
        })
        .join('\n')
        .slice(0, 1024),
    });
  }

  embed.addFields({
    name: '🚀 Démarrage rapide',
    value: [
      '`/config salut` — vérifier les permissions',
      '`/rolepanel creer` — panneau de rôles avec boutons & image',
      '`/giveaway creer` — concours réservé aux admins',
      '`/ban`, `/mute`, `/warn`, `/purge` — modération complète',
      '`/jeu liste` — mini-jeux (IA, duels, quiz) et classement',
    ].join('\n'),
  });

  return embed;
}

const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche l’aide complète du bot, catégorie par catégorie')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('categorie')
        .setDescription('Filtrer sur une catégorie précise')
        .setRequired(false)
        .addChoices(...CATEGORIES.map((category) => ({ name: `${category.emoji} ${category.label}`, value: category.id }))),
    ),
  category: 'utility',
  summary: 'Aide interactive paginée',
  usage: ['/help', '/help categorie:moderation'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const client = ctx.client as ElysiaClient;
    const category = ctx.interaction.options.getString('categorie');
    const totalPages = helpTotalPages(client);

    // Page correspondant à la catégorie demandée.
    let page = 0;
    if (category) {
      const groups = groupCommands(client);
      const index = groups.findIndex((group) => group.meta.id === category);
      page = index >= 0 ? Math.floor(index / 2) : 0;
    }

    const embed = buildHelpEmbed(client, page);
    if (category) {
      const meta = categoryMeta(category as never);
      embed.setColor(THEME.colors.info);
      embed.setTitle(`${meta.emoji} ${meta.label} — ${meta.description}`);
    }

    const rows = [paginationRow({ prefix: 'help', page, totalPages })];
    rows.push(
      ...buttonRows([
        { id: 'help:noop:0', label: 'Support', emoji: '💜', style: 'secondary', disabled: true },
        { id: 'help:noop:1', label: 'Documentation : README.md', emoji: '📚', style: 'secondary', disabled: true },
      ]),
    );

    return ctx.send(embed, rows);
  },
};

export default helpCommand;
