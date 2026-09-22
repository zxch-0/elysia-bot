import { SlashCommandBuilder, type GuildMember, type User } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import { timestampTag } from '../../utils/duration';

/** Taille maximale demandée à l'API Discord. */
const SIZE = 1024;

/** Toutes les variantes d'un avatar (PNG/JPG/WEBP/GIF + dimensions). */
function avatarVariants(target: User, guild?: GuildMember | null) {
  const global = target.displayAvatarURL({ size: 4096, extension: 'png' });
  const animation = target.avatar?.startsWith('a_');
  const serverAvatar = guild?.avatar;
  return {
    /** Version affichée dans l'embed (GIF si animé, sinon PNG). */
    display: guild?.displayAvatarURL({ size: SIZE }) ?? target.displayAvatarURL({ size: SIZE }),
    global,
    animation,
    serverAvatar: serverAvatar ? guild!.displayAvatarURL({ size: SIZE }) : null,
    links: [
      { label: 'PNG', url: (guild?.displayAvatarURL({ size: SIZE, extension: 'png' }) ?? target.displayAvatarURL({ size: SIZE, extension: 'png' })) },
      { label: 'JPG', url: (guild?.displayAvatarURL({ size: SIZE, extension: 'jpg' }) ?? target.displayAvatarURL({ size: SIZE, extension: 'jpg' })) },
      { label: 'WEBP', url: (guild?.displayAvatarURL({ size: SIZE, extension: 'webp' }) ?? target.displayAvatarURL({ size: SIZE, extension: 'webp' })) },
      ...(animation || serverAvatar?.startsWith('a_')
        ? [{ label: 'GIF', url: guild?.displayAvatarURL({ size: SIZE, extension: 'gif' }) ?? target.displayAvatarURL({ size: SIZE, extension: 'gif' }) }]
        : []),
    ],
  };
}

const avatarCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Affiche l’avatar, la bannière et les formats téléchargeables d’un membre')
    .setDMPermission(false)
    .addUserOption((option) => option.setName('membre').setDescription('Membre concerné (vous par défaut)'))
    .addBooleanOption((option) => option.setName('banniere').setDescription('Afficher aussi la bannière de profil')),
  category: 'utility',
  summary: 'Avatar, bannière et formats d’image',
  usage: ['/avatar', '/avatar membre:@Léo banniere:true'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const option = ctx.interaction.options.getMember('membre');
    const member = (Array.isArray(option) ? option[0] : option) ?? ctx.member;
    const withBanner = ctx.interaction.options.getBoolean('banniere') ?? false;
    const user = member.user as User;
    const variants = avatarVariants(user, member);

    const embed = baseEmbed({
      title: `🖼️ Avatar de ${member.displayName}`,
      image: variants.display,
      color: member.displayColor || THEME.colors.primary,
      footer: `Identifiant : ${user.id} • demandé par ${ctx.interaction.user.tag}`,
    });

    if (variants.serverAvatar) {
      embed.addFields({ name: '🏠 Avatar de serveur', value: 'Un avatar spécifique est défini sur ce serveur (affiché ci-dessus).' });
    }
    if (variants.animation) {
      embed.addFields({ name: '✨ Animé', value: 'Cet avatar est animé — le GIF est disponible en bas.' });
    }
    embed.setImage(variants.display);

    // Bannière : nécessite un appel API (les données ne sont pas toujours en cache).
    if (withBanner) {
      const banner = await user.fetch(true).then((fetched) => fetched.bannerURL({ size: SIZE })).catch(() => null);
      if (banner) {
        embed.addFields({ name: '🎏 Bannière', value: `[Ouvrir en grand](${banner})`, inline: true });
        embed.setThumbnail(banner);
      } else {
        embed.addFields({ name: '🎏 Bannière', value: '*Aucune bannière de profil (ou non accessible).*', inline: true });
      }
    }

    embed.addFields({
      name: '📅 Compte',
      value: `Créé ${timestampTag(user.createdTimestamp, 'R')}`,
      inline: true,
    });

    return ctx.send(
      embed,
      buttonRows(variants.links.map((link) => ({ id: `avatar:${link.label}`, label: link.label, style: 'secondary' as const, url: link.url }))),
    );
  },
};

export default avatarCommand;
