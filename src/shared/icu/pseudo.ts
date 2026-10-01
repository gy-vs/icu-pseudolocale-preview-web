import {formatMessage} from './format';
import type {FormatResult} from './format';
import type {IcuNode, Values} from './types';

/**
 * Pseudo-localization preview modes. These are *temporary views* over the
 * editor draft — they are never stored as translations and never participate
 * in revisions.
 *
 * Both modes share one rendering pipeline with the ordinary preview so that
 * plural/select branches, nested constructs and number/date/time arguments
 * render exactly as the message would really appear.
 */
export type PseudoMode = 'expand' | 'rtl';

export const PSEUDO_MODES: PseudoMode[] = ['expand', 'rtl'];

export function isPseudoMode(value: unknown): value is PseudoMode {
  return value === 'expand' || value === 'rtl';
}

/**
 * Pseudo previews deliberately format against a fixed English base locale:
 * branch selection (plural categories, offsets, exact matches) and Intl
 * number/date/time formatting must stay reproducible when the user switches
 * the selected real locale, and the same inputs must always produce the same
 * pseudo sentence client- and server-side.
 */
export const PSEUDO_BASE_LOCALE = 'en';

type ModeSpec = {
  /** Marker wrapping a decorated run of translatable text. */
  open: string;
  close: string;
  /** Replace ASCII letters with precomposed look-alikes (expand mode only). */
  accent: boolean;
  /** Fraction of the letter count appended as visible padding. */
  expansion: number;
  /** Padding glyph repeated to the expansion length. */
  pad: string;
};

const MODE_SPECS: Record<PseudoMode, ModeSpec> = {
  // Conventional "en-XA" pseudo locale: accented Latin plus ~40% growth and
  // square brackets that make word boundaries / overflow obvious.
  expand: {open: '[', close: ']', accent: true, expansion: 0.4, pad: '!'},
  // Conventional "ar-XB": untranslated Latin shown inside an explicitly
  // right-to-left context (the [! !] markers read as mirrored brackets once
  // the preview pane lays the sentence out with dir="rtl").
  rtl: {open: '[!', close: '!]', accent: false, expansion: 0, pad: ''},
};

const ACCENT_MAP: Record<string, string> = {
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'î',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ř',
  s: 'Š',
  t: 'ţ',
  u: 'ü',
  v: 'ṽ',
  w: 'ŵ',
  x: '×',
  y: 'ý',
  z: 'ž',
  A: 'À',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Î',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ř',
  S: 'Š',
  T: 'Ţ',
  U: 'Ü',
  V: 'Ṽ',
  W: 'Ŵ',
  X: '×',
  Y: 'Ý',
  Z: 'Ž',
};

/**
 * Transform a single run of literal message text for the given pseudo mode.
 *
 * Only runs containing ASCII letters are touched: pure whitespace and pure
 * punctuation (e.g. the space between a text run and a substituted argument)
 * pass through verbatim, so arguments keep their real position and spacing.
 * Leading/trailing whitespace stays outside the wrapping markers.
 */
export function pseudoText(text: string, mode: PseudoMode): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match) return text;
  const [, lead, core, trail] = match;
  if (!/[A-Za-z]/.test(core)) return text;

  const spec = MODE_SPECS[mode];
  let decorated = '';
  let letters = 0;
  for (const ch of core) {
    if (spec.accent && ACCENT_MAP[ch]) {
      decorated += ACCENT_MAP[ch];
      letters++;
    } else {
      decorated += ch;
      if (/[A-Za-z]/.test(ch)) letters++;
    }
  }
  const padding = spec.expansion > 0 ? spec.pad.repeat(Math.max(2, Math.ceil(letters * spec.expansion))) : '';
  return lead + spec.open + decorated + padding + spec.close + trail;
}

/**
 * Render a parsed message in a pseudo-localization mode.
 *
 * Branch selection and all value substitution run through the ordinary
 * formatter against {@link PSEUDO_BASE_LOCALE}; only literal text nodes are
 * rewritten by {@link pseudoText}. Names, counts, dates and times therefore
 * appear with their real (scenario-supplied) values, never decorated.
 */
export function formatPseudo(nodes: IcuNode[], values: Values, mode: PseudoMode): FormatResult {
  return formatMessage(nodes, values, PSEUDO_BASE_LOCALE, {
    transformText: text => pseudoText(text, mode),
  });
}
