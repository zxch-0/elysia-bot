import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type APISelectMenuOption,
  type InteractionReplyOptions,
} from 'discord.js';
import type { ButtonStyleName } from '../core/types';

const STYLES: Record<ButtonStyleName, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

export interface ButtonSpec {
  id: string;
  label?: string;
  emoji?: string | null;
  style?: ButtonStyleName;
  disabled?: boolean;
  url?: string;
}

/** Construit un bouton à partir d'une spécification simplifiée. */
export function buildButton(spec: ButtonSpec): ButtonBuilder {
  const style = spec.style ?? 'secondary';
  const button =
    spec.url !== undefined
      ? new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(spec.url)
      : new ButtonBuilder().setStyle(STYLES[style]).setCustomId(spec.id);

  if (spec.label) button.setLabel(spec.label.slice(0, 80));
  if (spec.emoji) {
    try {
      button.setEmoji(spec.emoji);
    } catch {
      /* émoji invalide : on l'ignore */
    }
  }
  if (!spec.label && !spec.emoji) button.setLabel('Bouton');
  if (spec.disabled) button.setDisabled(true);
  return button;
}

/** Range automatiquement les boutons en lignes de 5 maximum. */
export function buttonRows(specs: ButtonSpec[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < specs.length; index += 5) {
    const slice = specs.slice(index, index + 5).map(buildButton);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...slice));
  }
  return rows;
}

export type ConfirmAction = 'yes' | 'no';

/** Rangée de confirmation (avec jeton d'expiration dans le customId). */
export function confirmRow(token: string, labels: { yes?: string; no?: string } = {}): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    buildButton({ id: `confirm:${token}:yes`, label: labels.yes ?? 'Confirmer', style: 'danger', emoji: '✅' }),
    buildButton({ id: `confirm:${token}:no`, label: labels.no ?? 'Annuler', style: 'secondary', emoji: '✖️' }),
  );
}

export interface SelectOptionSpec {
  value: string;
  label: string;
  description?: string;
  emoji?: string | null;
  default?: boolean;
}

/** Menu déroulant simple (rôles, panneaux…). */
export function selectMenu(params: {
  id: string;
  placeholder: string;
  options: SelectOptionSpec[];
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(params.id)
    .setPlaceholder(params.placeholder.slice(0, 150))
    .setMinValues(params.minValues ?? 1)
    .setMaxValues(Math.min(params.maxValues ?? 1, params.options.length || 1))
    .setDisabled(Boolean(params.disabled));

  const options: StringSelectMenuOptionBuilder[] = params.options.slice(0, 25).map((option) => {
    const builder = new StringSelectMenuOptionBuilder().setValue(option.value).setLabel(option.label.slice(0, 100));
    if (option.description) builder.setDescription(option.description.slice(0, 100));
    if (option.emoji) {
      try {
        builder.setEmoji(option.emoji);
      } catch {
        /* ignore */
      }
    }
    if (option.default) builder.setDefault(true);
    return builder;
  });

  menu.addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export interface PageOptions {
  /** Préfixe de customId, ex. « help » → help:page:2 */
  prefix: string;
  page: number;
  totalPages: number;
  /** Boutons supplémentaires (affichés à droite). */
  extras?: ButtonSpec[];
}

/** Rangée de pagination standard (première / précédente / suivante / dernière). */
export function paginationRow(options: PageOptions): ActionRowBuilder<ButtonBuilder> {
  const { prefix, page, totalPages } = options;
  const last = totalPages - 1;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    buildButton({ id: `${prefix}:first:0`, emoji: '⏮️', style: 'secondary', disabled: page <= 0 }),
    buildButton({ id: `${prefix}:prev:${page - 1}`, label: 'Précédent', style: 'primary', disabled: page <= 0 }),
    buildButton({ id: `${prefix}:indicator:${page}`, label: `Page ${page + 1}/${Math.max(totalPages, 1)}`, style: 'secondary', disabled: true }),
    buildButton({ id: `${prefix}:next:${page + 1}`, label: 'Suivant', style: 'primary', disabled: page >= last }),
    buildButton({ id: `${prefix}:last:${last}`, emoji: '⏭️', style: 'secondary', disabled: page >= last }),
  );
  return row;
}

/** Réponse éphémère réutilisable. */
export function ephemeral(payload: InteractionReplyOptions): InteractionReplyOptions {
  return { ...payload, ephemeral: true };
}

export { ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder };
export type { APISelectMenuOption };
