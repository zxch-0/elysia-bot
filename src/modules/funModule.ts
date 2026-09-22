import { MessageFlags } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { errorEmbed } from '../ui/embeds';
import { JOKES } from '../fun/content';

/**
 * Module des commandes de divertissement.
 * CustomIds : `fun:<action>:<argument>`.
 *  • `fun:punchline:<index>` — révèle la chute d'une blague.
 */
export const funModule: InteractionModule = {
  prefix: 'fun',
  async handle(interaction, _client: ElysiaClient, args) {
    const [action, value] = args;
    if (!interaction.isButton()) return;

    if (action === 'punchline') {
      const index = Number.parseInt(value ?? '', 10);
      const joke = Number.isInteger(index) ? JOKES[index] : undefined;
      if (!joke) {
        await interaction.reply({
          embeds: [errorEmbed('Cette blague n’est plus disponible.', 'Introuvable')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // La blague a été publiée dans le salon : on révèle la chute publiquement
      // (l'embed d'origine reste inchangé pour ne pas casser le suspense).
      await interaction.reply({
        content: `🥁 ${joke.punchline}`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.reply({
      embeds: [errorEmbed('Action inconnue.', 'Interaction invalide')],
      flags: MessageFlags.Ephemeral,
    });
  },
};
