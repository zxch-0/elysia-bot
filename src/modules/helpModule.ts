import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { buildHelpEmbed, helpTotalPages } from '../commands/utility/help';
import { paginationRow } from '../ui/components';

/** Pagination de l'aide interactive (customId : `help:<action>:<page>`). */
export const helpModule: InteractionModule = {
  prefix: 'help',
  async handle(interaction, client: ElysiaClient, args) {
    if (!interaction.isButton()) return;
    const [, rawPage] = args;
    const totalPages = helpTotalPages(client);
    const page = Math.min(Math.max(Number.parseInt(rawPage ?? '0', 10) || 0, 0), Math.max(totalPages - 1, 0));

    await interaction.update({
      embeds: [buildHelpEmbed(client, page)],
      components: [paginationRow({ prefix: 'help', page, totalPages })],
    });
  },
};
