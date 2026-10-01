import {pseudoText, wrapPseudoRender} from './pseudo';
import type {PseudoModeId} from './pseudo';
import type {IcuNode, Values} from './types';

export type FormatOptions = {
  /** Pseudo-localization mode; only literal text is affected. */
  pseudo?: PseudoModeId | null;
};

export type FormatResult = {
  rendered: string;
  /** Parameters that had no usable value and were rendered as `{name}` placeholders. */
  missingValues: string[];
};

/** Render a parsed message for a locale using Intl plural/number/date rules. */
export function formatMessage(
  nodes: IcuNode[],
  values: Values,
  locale: string,
  options: FormatOptions = {},
): FormatResult {
  const missing = new Set<string>();
  let rendered = renderNodes(nodes, values, locale, missing, null, options.pseudo ?? null);
  if (options.pseudo) rendered = wrapPseudoRender(rendered, options.pseudo);
  return {rendered, missingValues: [...missing]};
}

function renderNodes(
  nodes: IcuNode[],
  values: Values,
  locale: string,
  missing: Set<string>,
  pluralContext: {value: number} | null,
  pseudo: PseudoModeId | null,
): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        // Only literal, translatable copy is pseudo-localized.
        out += pseudo ? pseudoText(node.value, pseudo) : node.value;
        break;
      case 'pound':
        out += pluralContext ? formatNumber(pluralContext.value, null, locale) : '#';
        break;
      case 'argument': {
        const value = values[node.name];
        if (value == null) {
          missing.add(node.name);
          out += `{${node.name}}`;
        } else {
          out += String(value);
        }
        break;
      }
      case 'number': {
        const num = toNumber(values[node.name]);
        if (num == null) {
          missing.add(node.name);
          out += `{${node.name}}`;
        } else {
          out += formatNumber(num, node.style, locale);
        }
        break;
      }
      case 'date':
      case 'time': {
        const date = toDate(values[node.name]);
        if (!date) {
          missing.add(node.name);
          out += `{${node.name}}`;
        } else {
          out += formatTemporal(date, node.type, node.style, locale);
        }
        break;
      }
      case 'plural': {
        const num = toNumber(values[node.name]);
        if (num == null) {
          missing.add(node.name);
          out += `{${node.name}}`;
          break;
        }
        const exact = node.options.find(option => option.exact && Number(option.selector) === num);
        let option = exact;
        if (!option) {
          const category = selectPluralCategory(locale, num - node.offset, node.ordinal);
          option = node.options.find(candidate => !candidate.exact && candidate.selector === category);
        }
        option ??= node.options.find(candidate => !candidate.exact && candidate.selector === 'other');
        if (!option) {
          missing.add(node.name);
          out += `{${node.name}}`;
          break;
        }
        out += renderNodes(option.nodes, values, locale, missing, {value: num - node.offset}, pseudo);
        break;
      }
      case 'select': {
        const raw = values[node.name];
        if (raw == null) {
          missing.add(node.name);
          out += `{${node.name}}`;
          break;
        }
        const key = String(raw);
        const option =
          node.options.find(candidate => candidate.selector === key) ??
          node.options.find(candidate => candidate.selector === 'other');
        if (!option) {
          missing.add(node.name);
          out += `{${node.name}}`;
          break;
        }
        out += renderNodes(option.nodes, values, locale, missing, pluralContext, pseudo);
        break;
      }
    }
  }
  return out;
}

function selectPluralCategory(locale: string, value: number, ordinal: boolean): string {
  try {
    return new Intl.PluralRules(locale, {type: ordinal ? 'ordinal' : 'cardinal'}).select(value);
  } catch {
    return 'other';
  }
}

function toNumber(value: Values[string]): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function toDate(value: Values[string]): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatNumber(value: number, style: string | null, locale: string): string {
  const options = numberFormatOptions(style);
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat(locale).format(value);
  }
}

function numberFormatOptions(style: string | null): Intl.NumberFormatOptions {
  if (!style || style === 'decimal') return {};
  if (style === 'integer') return {maximumFractionDigits: 0};
  if (style === 'percent') return {style: 'percent'};
  const currency = /^currency\/([A-Za-z]{3})$/.exec(style);
  if (currency) return {style: 'currency', currency: currency[1].toUpperCase()};
  // Unknown styles (e.g. skeletons) fall back to plain decimal formatting.
  return {};
}

function formatTemporal(date: Date, kind: 'date' | 'time', style: string | null, locale: string): string {
  const named = style && ['short', 'medium', 'long', 'full'].includes(style) ? (style as 'short' | 'medium' | 'long' | 'full') : 'medium';
  const options: Intl.DateTimeFormatOptions = kind === 'date' ? {dateStyle: named} : {timeStyle: named};
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return date.toISOString();
  }
}
