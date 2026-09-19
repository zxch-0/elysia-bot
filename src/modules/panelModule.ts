import { MessageFlags, PermissionFlagsBits, type GuildMember, type InteractionReplyOptions } from 'discord.js';
import type { InteractionModule } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { panelService } from '../services/panelService';
import { baseEmbed, errorEmbed, THEME } from '../ui/embeds';
import { humanizeNumber } from '../utils/format';

const log = logger.child('panels');

function ephemeral(payload: InteractionReplyOptions): InteractionReplyOptions {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

/**
 * Module des panneaux de rôles.
 * CustomIds :
 *   • `rr:toggle:<panelId>:<roleId>`  — clic sur un bouton de rôle
 *   • `rr:select:<panelId>`           — validation d'un menu déroulant
 *   • `rr:stats:<panelId>`            — statistiques (staff)
 */
export const panelRoleModule: InteractionModule = {
  prefix: 'rr',
  async handle(interaction, _client: ElysiaClient, args) {
    const [action, panelId, roleId] = args;
    const guild = interaction.guild;
    if (!guild) return;

    const panel = panelService.get(panelId ?? '');
    if (!panel) {
      await interaction.reply(
        ephemeral({
          embeds: [
            errorEmbed(
              'Ce panneau n’existe plus (il a peut-être été supprimé). Demandez à un administrateur de le republier.',
            ),
          ],
        }),
      );
      return;
    }

    // ── Statistiques détaillées du panneau (staff) ──────────────────────────
    if (action === 'stats') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply(ephemeral({ embeds: [errorEmbed('Réservé aux membres pouvant gérer les rôles.')] }));
        return;
      }
      const counts = panel.roles.map((entry) => {
        const role = guild.roles.cache.get(entry.roleId);
        return `• ${entry.emoji ? `${entry.emoji} ` : ''}**${entry.label}** — ${humanizeNumber(role?.members.size ?? 0)} membre(s)`;
      });
      const warnings = panelService.diagnose(guild, panel);
      await interaction.reply(
        ephemeral({
          embeds: [
            baseEmbed({
              title: `📊 ${panel.name}`,
              description: [
                counts.join('\n'),
                '',
                `**Mode :** ${panel.behaviour === 'exclusive' ? 'choix unique' : 'multi-sélection'}`,
                `**Type :** ${panel.mode === 'select' ? 'menu déroulant' : 'boutons'}`,
                warnings.length ? `\n⚠️ **Problèmes détectés :** ${warnings.join(' ')}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
              color: warnings.length ? THEME.colors.warning : THEME.colors.info,
            }),
          ],
        }),
      );
      return;
    }

    // ── Menu déroulant ──────────────────────────────────────────────────────
    if (action === 'select' && interaction.isStringSelectMenu()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await guild.members.fetch(interaction.user.id);
      const selected = new Set(interaction.values);
      const managed = panel.roles.map((entry) => entry.roleId);
      const currentlyHeld = managed.filter((id) => member.roles.cache.has(id));
      const toConsider = [...new Set([...selected, ...currentlyHeld])];

      const added: string[] = [];
      const removed: string[] = [];
      for (const candidate of toConsider) {
        const shouldHave = selected.has(candidate);
        const has = member.roles.cache.has(candidate);
        if (shouldHave === has) continue;
        const result = await panelService.toggleRole({ guild, member, panel, roleId: candidate });
        if (result.added) added.push(result.roleName);
        else removed.push(result.roleName);
      }

      const lines: string[] = [];
      if (added.length > 0) lines.push(`✅ **Ajouté :** ${added.map((name) => `\`${name}\``).join(', ')}`);
      if (removed.length > 0) lines.push(`❌ **Retiré :** ${removed.map((name) => `\`${name}\``).join(', ')}`);

      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: '🎭 Vos rôles ont été mis à jour',
            description: lines.join('\n') || 'Aucun changement à appliquer.',
            color: lines.length > 0 && added.length > 0 ? THEME.colors.success : THEME.colors.neutral,
            footer: `Panneau ${panel.name}`,
          }),
        ],
      });
      return;
    }

    // ── Bouton de rôle ──────────────────────────────────────────────────────
    if (action === 'toggle' && interaction.isButton()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const member: GuildMember = await guild.members.fetch(interaction.user.id);
      const result = await panelService.toggleRole({ guild, member, panel, roleId: roleId ?? '' });

      const roleLabel = guild.roles.cache.get(roleId ?? '')?.toString() ?? `**${result.roleName}**`;
      const description = result.added
        ? [`Vous avez maintenant le rôle ${roleLabel}.`]
        : [`Le rôle **${result.roleName}** vous a été retiré.`];

      if (result.replaced && result.replaced.length > 0) {
        description.push(`Rôle(x) remplacé(s) : ${result.replaced.map((name) => `**${name}**`).join(', ')}`);
      }

      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: result.added ? '✅ Rôle attribué' : '➖ Rôle retiré',
            description: description.join('\n'),
            color: result.added ? THEME.colors.success : THEME.colors.warning,
            footer: `Panneau ${panel.name}`,
          }),
        ],
      });
      log.debug(`${interaction.user.tag} → ${result.added ? '+' : '-'} ${result.roleName} (panneau ${panel.id})`);
      return;
    }

    // ── Aperçu éphémère ─────────────────────────────────────────────────────
    if (action === 'preview') {
      await interaction.reply(ephemeral({ embeds: [panelService.buildEmbed(panel)] }));
      return;
    }

    log.warn(`Action de panneau inconnue : ${args.join(':')}`);
  },
};
