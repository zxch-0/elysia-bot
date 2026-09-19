import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import { codeBlock } from '../../utils/format';

/**
 * Génère le lien d'invitation du bot avec les permissions recommandées.
 * Pratique pour installer Elysia sur un second serveur en un clic.
 */
const inviteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Génère le lien d’invitation du bot pour l’ajouter à un autre serveur')
    .setDMPermission(false),
  category: 'utility',
  summary: 'Lien d’ajout du bot',
  cooldown: 5,
  async run(ctx: CommandContext) {
    const client = ctx.client as import('../../core/client').ElysiaClient;
    const applicationId = client.user?.id ?? ctx.interaction.client.user?.id ?? '';
    const permissions = PermissionFlagsBits.Administrator.toString();

    const url = `https://discord.com/oauth2/authorize?client_id=${applicationId}&permissions=${permissions}&scope=bot%20applications.commands`;
    const embed = baseEmbed({
      title: '➕ Inviter Elysia sur votre serveur',
      description: [
        'Cliquez sur le bouton ci-dessous pour ajouter le bot avec les permissions nécessaires.',
        '',
        '**Permissions demandées :** administrateur (nécessaire pour la modération complète : bannir, timeout, gérer les rôles…).',
        '',
        codeBlock(url),
      ].join('\n'),
      color: THEME.colors.primary,
      thumbnail: client.user?.displayAvatarURL({ size: 256 }),
      footer: 'Elysia • partagez le bot avec vos amis ✨',
    });

    return ctx.send(embed, buttonRows([{ id: 'invite:noop', label: 'Ajouter le bot', emoji: '💜', style: 'primary', url }]));
  },
};

export default inviteCommand;
