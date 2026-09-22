import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import type { ElysiaClient } from '../../core/client';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, paginationRow } from '../../ui/components';
import { CATEGORIES, categoryMeta } from '../categories';
import { chunk } from '../../utils/format';

/** Taille maximale d'un champ d'embed Discord. */
const FIELD_LIMIT = 1024;
/** Nombre de commandes affichées par bloc avant découpage. */
const COMMANDS_PER_BLOCK = 12;
/** Nombre de blocs affichés par page. */
const BLOCKS_PER_PAGE = 2;

export interface HelpSection {
  name: string;
  value: string;
  category: string;
}

/**
 * Découpe le catalogue en blocs compatibles avec les limites de Discord :
 * une catégorie très fournie occupe plusieurs blocs (et donc plusieurs pages)
 * au lieu d'être tronquée.
 */
export function buildHelpSections(client: ElysiaClient): HelpSection[] {
  const sections: HelpSection[] = [];

  for (const category of CATEGORIES) {
    const commands = [...client.commands.values()]
      .filter((command) => command.category === category.id)
      .sort((a, b) => a.data.name.localeCompare(b.data.name));
    if (commands.length === 0) continue;

    for (const [index, group] of chunk(commands, COMMANDS_PER_BLOCK).entries()) {
      const total = Math.ceil(commands.length / COMMANDS_PER_BLOCK);
      sections.push({
        name: `${category.emoji} ${category.label}${total > 1 ? ` (${index + 1}/${total})` : ''}`,
        value: group
          .map((command) => {
            const summary = command.summary ?? command.data.description ?? 'Commande';
            const usage = command.usage?.[0] ? `\n   ↳ ${command.usage[0]}` : '';
            return `**/${command.data.name}** — ${summary}${usage}`;
          })
          .join('\n')
          .slice(0, FIELD_LIMIT),
        category: category.id,
      });
    }
  }

  return sections;
}

export function helpPages(client: ElysiaClient): HelpSection[][] {
  const pages = chunk(buildHelpSections(client), BLOCKS_PER_PAGE).map((page) => page.slice(0, BLOCKS_PER_PAGE));
  return pages.length > 0 ? pages : [[]];
}

export function helpTotalPages(client: ElysiaClient): number {
  return Math.max(1, helpPages(client).length);
}

/** Numéro de page où démarre une catégorie donnée. */
export function helpPageOfCategory(client: ElysiaClient, category: string): number {
  const index = buildHelpSections(client).findIndex((section) => section.category === category);
  return index >= 0 ? Math.floor(index / BLOCKS_PER_PAGE) : 0;
}

export function buildHelpEmbed(client: ElysiaClient, page = 0) {
  const pages = helpPages(client);
  const current = pages[Math.min(Math.max(page, 0), pages.length - 1)] ?? [];

  const embed = baseEmbed({
    title: '💜 Elysia — centre d’aide',
    description: [
      'Bot tout-en-un : **modération**, **giveaways**, **panneaux de rôles**, **communauté**, **mini-jeux** et **outils**.',
      'Tapez `/` puis le nom d’une commande — tout est en slash-command.',
      '',
      `**Commandes disponibles :** ${client.commands.size}`,
      `**Serveurs :** ${client.guilds.cache.size}`,
    ].join('\n'),
    color: THEME.colors.primary,
    thumbnail: client.user?.displayAvatarURL({ size: 256 }),
    footer: `Page ${Math.min(page, pages.length - 1) + 1}/${pages.length} • Elysia v1.0.0`,
  });

  for (const section of current) {
    embed.addFields({ name: section.name.slice(0, 256), value: section.value || '*aucune commande*' });
  }

  const quickStart = [
    '`/config convivialite` — tout configurer en une commande',
    '`/config salut` — vérifier les permissions et salons',
    '`/rolepanel creer` — panneau de rôles avec boutons & image',
    '`/giveaway creer` — concours réservé aux admins',
    '`/ban`, `/mute`, `/warn`, `/purge` — modération complète',
    '`/sondage`, `/suggestion`, `/niveau` — animation de communauté',
    '`/jeu liste` — mini-jeux (IA, duels, quiz) et classement',
  ].join('\n');

  if (page === 0) embed.addFields({ name: '🚀 Démarrage rapide', value: quickStart });
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
    const page = category ? helpPageOfCategory(client, category) : 0;

    const embed = buildHelpEmbed(client, page);
    if (category) {
      const meta = categoryMeta(category as never);
      embed.setColor(THEME.colors.info);
      embed.setTitle(`${meta.emoji} ${meta.label} — ${meta.description}`);
    }

    const rows = [paginationRow({ prefix: 'help', page, totalPages })];
    rows.push(
      ...buttonRows([
        { id: 'help:noop:0', label: 'Documentation : README.md', emoji: '📚', style: 'secondary', disabled: true },
        { id: 'help:noop:1', label: 'Référence : docs/COMMANDES.md', emoji: '🗂️', style: 'secondary', disabled: true },
      ]),
    );

    return ctx.send(embed, rows);
  },
};

export default helpCommand;
