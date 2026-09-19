import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService } from '../../services/moderationService';
import { successEmbed } from '../../ui/embeds';
import { UsageError } from '../../core/errors';

/** Débannit un utilisateur (fonctionne même s'il n'est plus sur le serveur). */
const unbanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannit un utilisateur via son identifiant')
    .addStringOption((option) =>
      option
        .setName('utilisateur')
        .setDescription('Identifiant Discord, mention ou pseudo#0000')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) => option.setName('raison').setDescription('Motif de la levée').setMaxLength(480))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Débannissement',
  usage: ['/unban utilisateur:123456789012345678 raison:appel accepté'],
  permissions: { user: [PermissionFlagsBits.BanMembers], bot: [PermissionFlagsBits.BanMembers] },
  cooldown: 4,
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value ?? '').toLowerCase();
    const bans = await interaction.guild!.bans.fetch().catch(() => null);
    if (!bans) {
      await interaction.respond([]);
      return;
    }
    const results = [...bans.values()]
      .filter((ban) => ban.user.tag.toLowerCase().includes(query) || ban.user.id.includes(query))
      .slice(0, 25)
      .map((ban) => ({ name: `${ban.user.tag} (${ban.user.id})`.slice(0, 100), value: ban.user.id }));
    await interaction.respond(results);
  },
  async run(ctx: CommandContext) {
    const raw = ctx.string('utilisateur').trim();
    const userId = raw.replace(/[<@!>]/g, '');
    if (!/^\d{17,20}$/.test(userId)) {
      throw new UsageError('Identifiant invalide. Utilisez l’autocomplétion ou collez un identifiant Discord (17 à 20 chiffres).');
    }
    const reason = ctx.interaction.options.getString('raison') ?? 'Aucune raison fournie';

    const entry = await moderationService.unban({
      guild: ctx.guild,
      moderator: ctx.interaction.user,
      userId,
      reason,
    });

    return ctx.send(
      successEmbed('Débannissement effectué', [`**${entry.targetTag}** (\`${userId}\`) peut de nouveau rejoindre le serveur.`, `*Case #${entry.caseNumber}*`].join('\n')),
    );
  },
};

export default unbanCommand;
