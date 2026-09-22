import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME, errorEmbed } from '../../ui/embeds';
import { WORLD_ZONES, findZone, formatInZone, zoneOffsetLabel, type WorldZone } from '../../utils/time';

const ZONE_CHOICES = WORLD_ZONES.map((zone) => ({ name: `${zone.emoji} ${zone.label}`, value: zone.id }));

/** Icône jour / nuit selon l'heure locale. */
function dayIcon(hour: number): string {
  if (hour >= 6 && hour < 12) return '🌅';
  if (hour >= 12 && hour < 18) return '☀️';
  if (hour >= 18 && hour < 22) return '🌆';
  return '🌙';
}

/**
 * Heure locale dans plusieurs villes du monde en une commande —
 * très pratique pour caler une session de jeu entre fuseaux horaires.
 */
const timeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('heure')
    .setDescription('Affiche l’heure locale de plusieurs villes du monde')
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName('ville').setDescription('Première ville à afficher').setRequired(true).addChoices(...ZONE_CHOICES),
    )
    .addStringOption((option) =>
      option.setName('ville2').setDescription('Deuxième ville').addChoices(...ZONE_CHOICES),
    )
    .addStringOption((option) =>
      option.setName('ville3').setDescription('Troisième ville').addChoices(...ZONE_CHOICES),
    )
    .addStringOption((option) =>
      option.setName('ville4').setDescription('Quatrième ville').addChoices(...ZONE_CHOICES),
    ),
  category: 'utility',
  summary: 'Heure locale dans le monde',
  usage: ['/heure ville:paris ville2:tokyo', '/heure ville:newyork'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const ids = ['ville', 'ville2', 'ville3', 'ville4']
      .map((name) => ctx.interaction.options.getString(name))
      .filter((value): value is string => Boolean(value));

    const zones: WorldZone[] = [];
    for (const id of ids) {
      const zone = findZone(id);
      if (zone && !zones.some((entry) => entry.id === zone.id)) zones.push(zone);
    }

    if (zones.length === 0) {
      return ctx.send(errorEmbed(`Ville inconnue. Villes disponibles : ${WORLD_ZONES.map((zone) => zone.label).join(', ')}.`, 'Ville introuvable'));
    }

    const now = new Date();
    const lines = zones.map((zone) => {
      const moment = formatInZone(now, zone.timeZone);
      return `${zone.emoji} **${zone.label}** — ${dayIcon(moment.hour)} **${moment.time}** (${moment.offset})\n┕ *${moment.date}*`;
    });

    const paris = formatInZone(now, 'Europe/Paris');

    const embed = baseEmbed({
      title: '🕒 Horloge mondiale',
      description: lines.join('\n'),
      color: THEME.colors.info,
      footer: 'Discord affiche aussi les horodatages dans VOTRE fuseau : cliquez sur une date pour la convertir',
    });

    embed.addFields(
      { name: '🌍 UTC', value: `${formatInZone(now, 'UTC').time} • Paris ${zoneOffsetLabel(now, 'Europe/Paris')}`, inline: true },
      { name: '📅 Aujourd’hui à Paris', value: paris.date, inline: true },
      {
        name: '🛠️ Astuce',
        value: 'Les horodatages Discord (`<t:…>`) s’affichent dans **le fuseau de chaque membre** : idéal pour fixer une session de jeu.',
        inline: false,
      },
    );

    return ctx.send(embed);
  },
};

export default timeCommand;
