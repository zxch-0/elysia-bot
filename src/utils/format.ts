/** Aides d'affichage : texte, nombres, barres de progression, listes. */

export function truncate(text: string, max: number, suffix = '…'): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([*_`~\\|>])/g, '\\$1');
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count > 1 ? (pluralForm ?? `${singular}s`) : singular;
}

/** 12345 → « 12 345 » */
export function humanizeNumber(value: number): string {
  return value.toLocaleString('fr-FR');
}

/** Barre de progression pour les giveaways : ▰▰▰▱▱▱ 50 % */
export function progressBar(current: number, total: number, size = 12): string {
  if (total <= 0) return `▱`.repeat(size);
  const ratio = Math.min(Math.max(current / total, 0), 1);
  const filled = Math.round(ratio * size);
  return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}

export function percent(current: number, total: number): string {
  if (total <= 0) return '0 %';
  return `${((current / total) * 100).toFixed(0)} %`;
}

export function codeBlock(content: string, language = ''): string {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

export function inlineCode(content: string): string {
  return `\`${content}\``;
}

/** Découpe un tableau en morceaux de taille `size` (limite Discord : 1024/4096 caractères). */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/** Liste à puces limitée en taille, avec « et N autres… ». */
export function bulletList(items: string[], options: { max?: number; emptyText?: string } = {}): string {
  const max = options.max ?? 15;
  if (items.length === 0) return options.emptyText ?? '*aucun élément*';
  const visible = items.slice(0, max);
  const rest = items.length - visible.length;
  return [...visible.map((item) => `• ${item}`), ...(rest > 0 ? [`• … et ${rest} autre${rest > 1 ? 's' : ''}`] : [])].join('\n');
}

/** Tronque et découpe une longue liste de texte en blocs compatibles avec les embeds. */
export function paginateText(lines: string[], maxCharsPerPage = 3_500): string[] {
  const pages: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > maxCharsPerPage) {
      pages.push(current);
      current = '';
    }
    current += `${line}\n`;
  }
  if (current.trim().length > 0) pages.push(current);
  return pages.length ? pages : ['*Rien à afficher.*'];
}

/** Différence lisible entre deux dates : « 3 j » (âge d'un compte). */
export function accountAge(createdAt: number): string {
  const diff = Date.now() - createdAt;
  const days = Math.floor(diff / 86_400_000);
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const parts: string[] = [];
  if (years) parts.push(`${years} an${years > 1 ? 's' : ''}`);
  if (months) parts.push(`${months} mois`);
  if (!years && days < 30) parts.push(`${days} j`);
  return parts.join(' ') || 'moins d’un jour';
}
