import { randomInt } from 'node:crypto';
import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { codeBlock, humanizeNumber } from '../../utils/format';
import { entropyBits, randomToken } from '../../utils/codec';
import { UsageError } from '../../core/errors';

const ALPHABETS = {
  classique: 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+[]{}?',
  sans_symboles: 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  lisible: 'abcdefghijkmnpqrstuvwxyz23456789',
  pin: '0123456789',
} as const;

/** Mots courants (sans accents) pour construire des phrases de passe mémorisables. */
const WORDS = [
  'abricot', 'alpine', 'ambre', 'ananas', 'aurore', 'avalanche', 'azur', 'banjo', 'baobab', 'basilic',
  'bison', 'blizzard', 'bolide', 'boussole', 'cactus', 'calanque', 'camélia', 'canopée', 'cascade', 'cèdre',
  'cerise', 'chamois', 'chaos', 'chevêche', 'cobalt', 'comète', 'corail', 'cristal', 'cyclone', 'dahlia',
  'delta', 'dune', 'écho', 'éclipse', 'embrun', 'énigme', 'épice', 'ermite', 'estuaire', 'falaise',
  'fauvette', 'filament', 'fjord', 'flamme', 'forêt', 'galet', 'géode', 'givre', 'granit', 'harmonie',
  'héron', 'hibiscus', 'horizon', 'iceberg', 'iris', 'ivoire', 'jade', 'jaguar', 'jungle', 'koala',
  'lagon', 'lanterne', 'lierre', 'lotus', 'lumière', 'lynx', 'mangrove', 'marbre', 'mésange', 'menthe',
  'mirage', 'mistral', 'mosaïque', 'mousson', 'nectar', 'nébuleuse', 'nuage', 'océan', 'onyx', 'orage',
  'orchidée', 'ossature', 'paon', 'papyrus', 'pétale', 'phare', 'pivoine', 'plume', 'pré', 'quartz',
  'rafale', 'récif', 'renard', 'rivière', 'roselière', 'safran', 'saphir', 'savane', 'séquoia', 'sirocco',
  'solstice', 'source', 'taiga', 'tempête', 'toundra', 'trappe', 'tulipe', 'uranium', 'velours', 'vent',
  'verglas', 'vertige', 'volcan', 'zenith', 'zèbre', 'zircon',
];

function generateCharset(length: number, alphabet: string): string {
  let output = '';
  for (let index = 0; index < length; index += 1) output += alphabet[randomInt(0, alphabet.length)];
  return output;
}

/** Phrase de passe : 4 à 10 mots séparés par un tiret, avec un chiffre final. */
function generatePassphrase(words: number): string {
  const chosen: string[] = [];
  while (chosen.length < words) {
    const word = WORDS[randomInt(0, WORDS.length)];
    if (!chosen.includes(word)) chosen.push(word);
  }
  return `${chosen.join('-')}-${randomInt(10, 100)}`;
}

/**
 * Générateur de mots de passe / phrases de passe (crypto natif, jamais stocké).
 * Les réponses sont **privées** : le bot ne conserve ni ne journalise rien.
 */
const passwordCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('motdepasse')
    .setDescription('Génère un mot de passe ou une phrase de passe solide (réponse privée)')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Type de secret à générer')
        .addChoices(
          { name: '🔐 Classique (tout)', value: 'classique' },
          { name: '🔤 Sans symboles', value: 'sans_symboles' },
          { name: '👀 Lisible (sans caractères ambigus)', value: 'lisible' },
          { name: '📖 Phrase de passe (mots)', value: 'phrase' },
          { name: '🔢 Code PIN', value: 'pin' },
          { name: '🧩 Jeton hexadécimal (API, token)', value: 'jeton' },
        ),
    )
    .addIntegerOption((option) => option.setName('longueur').setDescription('Longueur (8-64 pour un mot de passe, 3-10 mots pour une phrase)').setMinValue(3).setMaxValue(64))
    .addIntegerOption((option) => option.setName('nombre').setDescription('Nombre de propositions (1 à 5)').setMinValue(1).setMaxValue(5)),
  category: 'utility',
  summary: 'Générateur de mots de passe',
  usage: ['/motdepasse', '/motdepasse type:phrase longueur:5', '/motdepasse type:pin longueur:8'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const type = (ctx.interaction.options.getString('type') ?? 'classique') as keyof typeof ALPHABETS | 'phrase' | 'jeton';
    const rawLength = ctx.interaction.options.getInteger('longueur');
    const count = ctx.interaction.options.getInteger('nombre') ?? 1;

    const secrets: string[] = [];
    let alphabetSize = 0;
    let description = '';

    for (let index = 0; index < count; index += 1) {
      if (type === 'phrase') {
        const words = Math.min(Math.max(rawLength ?? 5, 3), 10);
        secrets.push(generatePassphrase(words));
        alphabetSize = WORDS.length;
        description = `Phrase de passe de **${words} mots** (séparateur « - ») — facile à retenir, très difficile à casser.`;
      } else if (type === 'jeton') {
        const bytes = Math.min(Math.max(rawLength ?? 24, 8), 64);
        secrets.push(randomToken(bytes));
        alphabetSize = 16;
        description = `Jeton aléatoire de **${bytes} octets** en hexadécimal (${bytes * 2} caractères).`;
      } else {
        const alphabet = ALPHABETS[type] ?? ALPHABETS.classique;
        const length = Math.min(Math.max(rawLength ?? (type === 'pin' ? 6 : 20), type === 'pin' ? 4 : 8), type === 'pin' ? 12 : 64);
        secrets.push(generateCharset(length, alphabet));
        alphabetSize = alphabet.length;
        description = `**${length} caractères** tirés parmi ${humanizeNumber(alphabet.length)} symboles possibles.`;
      }
    }

    if (count > 1 && secrets.every((secret) => secret === secrets[0])) {
      throw new UsageError('La génération a échoué : relancez la commande.');
    }

    const bits = entropyBits(alphabetSize, secrets[0].length);
    const strength =
      bits >= 128 ? { label: 'Excellente', emoji: '🟢' } : bits >= 80 ? { label: 'Très bonne', emoji: '🟢' } : bits >= 60 ? { label: 'Correcte', emoji: '🟡' } : { label: 'Faible — augmentez la longueur', emoji: '🟠' };

    const embed = baseEmbed({
      title: '🔐 Mot de passe généré',
      description: [description, '', codeBlock(secrets.join('\n'))].join('\n'),
      color: THEME.colors.primary,
      footer: 'Généré localement avec le module crypto de Node — rien n’est stocké ni journalisé',
    });

    embed.addFields(
      { name: `${strength.emoji} Force estimée`, value: `~${humanizeNumber(bits)} bits d’entropie — ${strength.label}`, inline: true },
      { name: '🔑 Conseils', value: 'Un mot de passe par service, jamais réutilisé.', inline: true },
      {
        name: '🛡️ Recommandé',
        value: 'Ajoutez un gestionnaire de mots de passe et activez la double authentification (2FA).',
        inline: false,
      },
    );

    if (count === 1 && ctx.interaction.channel && 'send' in ctx.interaction.channel) {
      embed.addFields({ name: 'ℹ️ Sécurité', value: 'Ce message vous est **privé** : personne d’autre ne le voit.' });
    }

    return ctx.send(embed);
  },
};

export default passwordCommand;
