/**
 * Pseudo-localization: deterministic text transforms for layout testing.
 *
 * Two temporary preview modes (they are never stored translations):
 * - `en-XA`: accented Latin with deterministic length expansion, to stress LTR
 *   layout space against longer text.
 * - `ar-XB`: source text left unchanged but laid out right-to-left, to stress
 *   bidirectional / RTL rendering.
 *
 * Only literal message text is transformed. Substituted argument values,
 * formatted numbers/dates/times and missing-value `{name}` placeholders pass
 * through untouched, so parameters stay real and recognizable. The transforms
 * are pure and deterministic: the same message and scenario values always
 * produce the same output, which lets client and server share this module and
 * agree byte-for-byte.
 */

export const PSEUDO_MODE_IDS = ['en-XA', 'ar-XB'] as const;
export type PseudoModeId = (typeof PSEUDO_MODE_IDS)[number];

export type PseudoMode = {
  id: PseudoModeId;
  label: string;
  /** Base direction the rendered sentence should be displayed with. */
  dir: 'ltr' | 'rtl';
  /** Wrapping markers around the whole rendered sentence. */
  open: string;
  close: string;
  blurb: string;
};

export const PSEUDO_MODES: Record<PseudoModeId, PseudoMode> = {
  'en-XA': {
    id: 'en-XA',
    label: 'Accented Latin',
    dir: 'ltr',
    open: '⟦',
    close: '⟧',
    blurb: 'Longer accented Latin text for checking LTR layout space.',
  },
  'ar-XB': {
    id: 'ar-XB',
    label: 'RTL mirror',
    dir: 'rtl',
    open: '[!',
    close: '!]',
    blurb: 'Unchanged text laid out right-to-left for checking bidi rendering.',
  },
};

export function isPseudoModeId(value: unknown): value is PseudoModeId {
  return value === 'en-XA' || value === 'ar-XB';
}

/**
 * Fixed accent mapping for Latin letters (single precomposed code points so
 * visible length is predictable). Letters without a precomposed accented form
 * (M, Q) intentionally stay unchanged. Non-Latin scripts are left as-is.
 */
const ACCENT: Record<string, string> = {
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ğ', H: 'Ĥ', I: 'Î',
  J: 'Ĵ', K: 'Ķ', L: 'Ł', M: 'M', N: 'Ñ', O: 'Ö', P: 'Ƥ', Q: 'Q', R: 'Ř',
  S: 'Ş', T: 'Ŧ', U: 'Ü', V: 'Ʋ', W: 'Ŵ', X: 'Ẋ', Y: 'Ŷ', Z: 'Ž',
  a: 'å', b: 'ɓ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ', i: 'î',
  j: 'ĵ', k: 'ķ', l: 'ł', m: 'm', n: 'ñ', o: 'ö', p: 'ƥ', q: 'q', r: 'ř',
  s: 'ş', t: 'ŧ', u: 'ü', v: 'ʋ', w: 'ŵ', x: 'ẋ', y: 'ŷ', z: 'ž',
};

const LATIN_WORD = /[A-Za-z]+/g;

/**
 * Transform one literal text run. `ar-XB` keeps the text exactly as written —
 * the RTL stress comes from the display direction, not from reshaping letters.
 */
export function pseudoText(text: string, mode: PseudoModeId): string {
  if (mode !== 'en-XA') return text;
  return text.replace(LATIN_WORD, word => {
    let accented = '';
    for (const ch of word) accented += ACCENT[ch] ?? ch;
    // Deterministic ~40% expansion (at least one filler glyph per word).
    return accented + '~'.repeat(1 + Math.floor(word.length / 3));
  });
}

/** Wrap a fully rendered sentence with the mode's boundary markers. */
export function wrapPseudoRender(rendered: string, mode: PseudoModeId): string {
  const {open, close} = PSEUDO_MODES[mode];
  return open + rendered + close;
}
