import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Command, CommandContext, RolePanel } from '../../core/types';
import { panelService } from '../../services/panelService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { UsageError } from '../../core/errors';
import { truncate } from '../../utils/format';

export const EMBED_MODAL_ID = 'em:build';

export interface EmbedModalPrefill {
  title?: string | null;
  description?: string | null;
  color?: string | null;
  image?: string | null;
  roles?: string | null;
}

/**
 * Modale du créateur d'embed : 5 champs (limite Discord).
 * Le pied de page se règle ensuite via `/embed modifier pied:…`.
 */
export function buildEmbedModal(prefill: EmbedModalPrefill = {}): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(EMBED_MODAL_ID).setTitle('Créateur d’embed Elysia');

  const field = (
    id: string,
    label: string,
    style: TextInputStyle,
    required: boolean,
    placeholder: string,
    maxLength: number,
    value?: string | null,
  ) => {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(required)
      .setPlaceholder(placeholder)
      .setMaxLength(maxLength);
    if (value) input.setValue(truncate(value, maxLength));
    return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  };

  modal.addComponents(
    field('titre', 'Titre de l’embed', TextInputStyle.Short, true, '🎁 Nouvelle annonce', 200, prefill.title),
    field(
      'description',
      'Description',
      TextInputStyle.Paragraph,
      true,
      'Décrivez votre annonce : **gras**, *italique*, [liens](https://…) acceptés.',
      3_500,
      prefill.description,
    ),
    field('couleur', 'Couleur (hex, optionnel)', TextInputStyle.Short, false, '#8b5cf6', 7, prefill.color),
    field('image', 'Image d’illustration via URL (optionnel)', TextInputStyle.Short, false, 'https://exemple.com/banniere.png', 400, prefill.image),
    field(
      'roles',
      'Boutons de rôles (optionnel)',
      TextInputStyle.Paragraph,
      false,
      '🎮 @Gamer | 🎨 @Artiste | 🎵 @Musique',
      900,
      prefill.roles,
    ),
  );

  return modal;
}

/**
 * Créateur d'embeds avec boutons de rôles.
 *  • `/embed creer` ouvre une modale, affiche un aperçu privé, puis publie.
 *  • `/embed image` joint une image locale (stockée dans assets/panels).
 *  • `/embed modifier` met à jour un embed déjà publié.
 */
const embedCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Crée un embed (annonce) avec boutons de rôles et image via une interface guidée')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Ouvre le créateur d’embed (modale + aperçu avant publication)')
        .addStringOption((option) => option.setName('titre').setDescription('Préremplir le titre').setMaxLength(200))
        .addStringOption((option) => option.setName('description').setDescription('Préremplir la description').setMaxLength(2000))
        .addStringOption((option) => option.setName('image_url').setDescription('Préremplir l’image par une URL').setMaxLength(400))
        .addStringOption((option) =>
          option.setName('roles').setDescription('Préremplir les boutons : « 🎮 @Gamer | 🎨 @Artiste »').setMaxLength(900),
        )
        .addStringOption((option) => option.setName('couleur').setDescription('Préremplir la couleur (#8b5cf6)').setMaxLength(7)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('modifier')
        .setDescription('Modifie un embed déjà publié (conserve ses boutons de rôles)')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant de l’embed').setRequired(true).setAutocomplete(true))
        .addStringOption((option) => option.setName('titre').setDescription('Nouveau titre').setMaxLength(200))
        .addStringOption((option) => option.setName('description').setDescription('Nouvelle description').setMaxLength(3500))
        .addStringOption((option) => option.setName('couleur').setDescription('Nouvelle couleur (#ec4899)').setMaxLength(7))
        .addStringOption((option) => option.setName('pied').setDescription('Nouveau pied de page').setMaxLength(200))
        .addStringOption((option) => option.setName('image_url').setDescription('Nouvelle image (URL ou « aucune »)').setMaxLength(400)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('image')
        .setDescription('Joint une image d’illustration à un embed publié (upload direct)')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant de l’embed').setRequired(true).setAutocomplete(true))
        .addAttachmentOption((option) => option.setName('fichier').setDescription('Image à joindre (PNG/JPG/GIF/WEBP, 8 Mo max)').setRequired(true))
        .addBooleanOption((option) => option.setName('retirer').setDescription('Retirer l’image actuelle à la place')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('json')
        .setDescription('Exporte le JSON de l’embed (développeurs / API Discord)')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant de l’embed').setRequired(true).setAutocomplete(true)),
    ),
  category: 'roles',
  summary: 'Créateur d’embeds avec boutons de rôles',
  usage: ['/embed creer', '/embed image panneau:annonces fichier:<image>', '/embed modifier panneau:annonces titre:Nouveau'],
  permissions: {
    user: [PermissionFlagsBits.ManageRoles],
    bot: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles],
  },
  noDefer: true,
  cooldown: 5,
  async autocomplete(interaction) {
    const query = String(interaction.options.getFocused(true).value ?? '').toLowerCase();
    const panels = panelService
      .listGuild(interaction.guildId ?? '')
      .filter((panel) => panel.id.includes(query) || panel.title.toLowerCase().includes(query))
      .slice(0, 25)
      .map((panel) => ({ name: `${panel.title} (${panel.id})`.slice(0, 100), value: panel.id }));
    await interaction.respond(panels);
  },
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'creer';

    const resolvePanel = (id: string): RolePanel => {
      const panel = panelService.get(id);
      if (!panel || panel.guildId !== ctx.guild.id) {
        throw new UsageError(`Aucun embed \`${id}\` sur ce serveur. Utilisez \`/rolepanel liste\` pour voir les identifiants.`);
      }
      return panel;
    };

    if (sub === 'creer') {
      await ctx.interaction.showModal(
        buildEmbedModal({
          title: ctx.interaction.options.getString('titre'),
          description: ctx.interaction.options.getString('description'),
          color: ctx.interaction.options.getString('couleur'),
          image: ctx.interaction.options.getString('image_url'),
          roles: ctx.interaction.options.getString('roles'),
        }),
      );
      return;
    }

    // Les sous-commandes hors modale utilisent editReply → on diffère la réponse.
    if (!ctx.interaction.deferred && !ctx.interaction.replied) {
      await ctx.interaction.deferReply({ ephemeral: true });
    }

    if (sub === 'modifier') {
      const panel = resolvePanel(ctx.string('panneau'));
      const patch: Partial<RolePanel> = {};
      const title = ctx.interaction.options.getString('titre');
      const description = ctx.interaction.options.getString('description');
      const color = ctx.interaction.options.getString('couleur');
      const footer = ctx.interaction.options.getString('pied');
      const imageUrl = ctx.interaction.options.getString('image_url');

      if (title) {
        patch.title = title;
        patch.name = title;
      }
      if (description) patch.description = description;
      if (footer) patch.footer = footer;
      if (color) {
        const hex = color.replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new UsageError('Couleur invalide : format attendu `#8b5cf6`.');
        patch.color = Number.parseInt(hex, 16);
      }
      if (imageUrl) {
        patch.imageUrl = /^(aucune|none|retirer)$/i.test(imageUrl) ? null : imageUrl;
        if (!patch.imageUrl) patch.imageFile = null;
      }
      if (Object.keys(patch).length === 0) throw new UsageError('Renseignez au moins une option à modifier.');

      const updated = panelService.update(panel.id, patch);
      await panelService.publish(ctx.guild, updated.id);

      return ctx.success(
        'Embed mis à jour',
        [`L’embed \`${updated.id}\` a été republié dans <#${updated.channelId}>.`, `**Champs modifiés :** ${Object.keys(patch).join(', ')}`].join('\n'),
      );
    }

    if (sub === 'image') {
      const panel = resolvePanel(ctx.string('panneau'));
      const remove = ctx.interaction.options.getBoolean('retirer') ?? false;

      if (remove) {
        const updated = panelService.update(panel.id, { imageFile: null, imageUrl: null });
        await panelService.publish(ctx.guild, updated.id);
        return ctx.success('Image retirée', `L’embed \`${updated.id}\` n’a plus d’image d’illustration.`);
      }

      const attachment = ctx.attachment('fichier');
      if (!attachment) throw new UsageError('Ajoutez une image (PNG, JPG, JPEG, GIF ou WEBP, 8 Mo maximum).');

      const fileName = await panelService.saveImage(attachment, panel.name);
      if (!fileName) throw new UsageError('Format non supporté : utilisez PNG, JPG, JPEG, GIF ou WEBP.');

      const updated = panelService.update(panel.id, { imageFile: fileName, imageUrl: null });
      const published = await panelService.publish(ctx.guild, updated.id);

      return ctx.success(
        'Image jointe à l’embed',
        [
          `**Fichier :** \`${fileName}\``,
          `**Publié dans :** <#${published.channelId}>`,
          '',
          'L’image est stockée dans `assets/panels/` puis renvoyée en pièce jointe : elle reste affichée',
          'même si Discord purge son CDN.',
        ].join('\n'),
      );
    }

    if (sub === 'json') {
      const panel = resolvePanel(ctx.string('panneau'));
      const payload = {
        embeds: [panelService.buildEmbed(panel).toJSON()],
        components: panelService.buildComponents(panel).map((row) => row.toJSON()),
        files: panel.imageFile ? [panel.imageFile] : [],
      };
      return ctx.interaction.editReply({
        embeds: [
          baseEmbed({
            title: '🧾 Payload JSON',
            description: `Export de l’embed \`${panel.id}\` — ${panel.roles.length} composant(s).`,
            color: THEME.colors.info,
          }),
        ],
        files: [new AttachmentBuilder(Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), { name: `embed-${panel.id}.json` })],
      });
    }

    return ctx.error('Sous-commande inconnue.');
  },
};

export { ChannelType };
export default embedCommand;
