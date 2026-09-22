import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, THEME } from '../../ui/embeds';
import { codeBlock, truncate } from '../../utils/format';
import {
  CODEC_LABELS,
  CodecError,
  HASH_LABELS,
  decodeValue,
  encodeValue,
  hashText,
  type CodecKind,
  type HashAlgorithm,
} from '../../utils/codec';

const CODEC_CHOICES = (Object.entries(CODEC_LABELS) as Array<[CodecKind, string]>).map(([value, label]) => ({ name: label, value }));
const HASH_CHOICES = (Object.entries(HASH_LABELS) as Array<[HashAlgorithm, string]>).map(([value, label]) => ({ name: label, value }));

/** Texte trop long pour un embed → on le découpe proprement. */
function clip(text: string, max = 3_500): string {
  return truncate(text, max, '\n… *(tronqué)*');
}

/**
 * Boîte à outils d'encodage : Base64, hexadécimal, binaire, URL, morse,
 * César/rot13, inversion, majuscules… et hachage cryptographique.
 */
const codeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('code')
    .setDescription('Encode, décode ou hache un texte (Base64, hex, binaire, morse, SHA-256…)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('encoder')
        .setDescription('Transforme un texte lisible en version encodée')
        .addStringOption((option) => option.setName('texte').setDescription('Texte à encoder').setRequired(true).setMaxLength(1_500))
        .addStringOption((option) => option.setName('methode').setDescription('Méthode d’encodage').addChoices(...CODEC_CHOICES)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('decoder')
        .setDescription('Retrouve le texte d’origine à partir d’un encodage')
        .addStringOption((option) => option.setName('texte').setDescription('Texte encodé').setRequired(true).setMaxLength(6_000))
        .addStringOption((option) => option.setName('methode').setDescription('Méthode de décodage').addChoices(...CODEC_CHOICES)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('hacher')
        .setDescription('Calcule l’empreinte (hash) d’un texte')
        .addStringOption((option) => option.setName('texte').setDescription('Texte à hacher').setRequired(true).setMaxLength(2_000))
        .addStringOption((option) => option.setName('algorithme').setDescription('Algorithme d’empreinte').addChoices(...HASH_CHOICES)),
    ),
  category: 'utility',
  summary: 'Encodage, décodage et hachage',
  usage: ['/code encoder texte:bonjour methode:base64', '/code hacher texte:secret algorithme:sha256'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'encoder';
    const text = ctx.string('texte');

    try {
      if (sub === 'hacher') {
        const algorithm = (ctx.interaction.options.getString('algorithme') ?? 'sha256') as HashAlgorithm;
        const digest = hashText(algorithm, text);
        const embed = baseEmbed({
          title: `🧾 Empreinte ${algorithm.toUpperCase()}`,
          description: [codeBlock(digest), `**Longueur :** ${digest.length} caractères hexadécimaux`].join('\n'),
          color: algorithm === 'md5' || algorithm === 'sha1' ? THEME.colors.warning : THEME.colors.success,
          footer: 'Une empreinte sert à VÉRIFIER un contenu, jamais à le chiffrer',
        });
        if (algorithm === 'md5' || algorithm === 'sha1') {
          embed.addFields({
            name: '⚠️ Algorithme obsolète',
            value: 'MD5 et SHA-1 sont cassables : utilisez SHA-256 ou SHA-512 pour tout usage de sécurité.',
          });
        }
        if (text.length <= 120) {
          embed.addFields({ name: 'Entrée', value: codeBlock(clip(text, 200)), inline: true });
        }
        return ctx.send(embed);
      }

      const method = (ctx.interaction.options.getString('methode') ??
        (sub === 'encoder' ? 'base64' : 'base64')) as CodecKind;
      const result = sub === 'encoder' ? encodeValue(method, text) : decodeValue(method, text);

      if (!result) {
        return ctx.send(errorEmbed('Le résultat est vide : vérifiez le texte fourni.', 'Rien à afficher'));
      }

      const embed = baseEmbed({
        title: sub === 'encoder' ? `🔒 Encodage ${CODEC_LABELS[method]}` : `🔓 Décodage ${CODEC_LABELS[method]}`,
        description: [
          `**Entrée :**\n${codeBlock(clip(text, 600))}`,
          `**${sub === 'encoder' ? 'Résultat' : 'Texte retrouvé'} :**\n${codeBlock(clip(result))}`,
        ].join('\n'),
        color: sub === 'encoder' ? THEME.colors.primary : THEME.colors.info,
        footer: `${text.length} caractère(s) en entrée • ${result.length} en sortie`,
      });

      if (sub === 'encoder' && result.length <= 900) {
        embed.addFields({
          name: '📋 Copier-coller rapide',
          value: `\`\`\`${result.replace(/`/g, '')}\`\`\``.slice(0, 1000),
        });
      }

      return ctx.send(embed);
    } catch (error) {
      if (error instanceof CodecError) {
        return ctx.send(
          errorEmbed(
            [
              `**${error.message}**`,
              '',
              `Méthodes disponibles : ${Object.entries(CODEC_LABELS).map(([id, label]) => `\`${id}\` (${label})`).join(', ')}`,
            ].join('\n'),
            'Conversion impossible',
          ),
        );
      }
      throw error;
    }
  },
};

export default codeCommand;
