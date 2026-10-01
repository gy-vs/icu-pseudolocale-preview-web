import {describe, expect, it} from 'vitest';
import {analyzeMessage, formatPseudo, pseudoText, PSEUDO_BASE_LOCALE} from '../src/shared/icu/index';
import type {PseudoMode, Values} from '../src/shared/icu/index';

function renderPseudo(message: string, values: Values, mode: PseudoMode): string {
  const analysis = analyzeMessage(message);
  expect(analysis.ok).toBe(true);
  return formatPseudo(analysis.nodes, values, mode).rendered;
}

describe('pseudoText literal transform', () => {
  it('accent-expands a Latin run with markers and growth padding', () => {
    // "Welcome," has 7 letters -> ceil(7*0.4) = 3 padding glyphs; trailing space stays outside.
    expect(pseudoText('Welcome, ', 'expand')).toBe('[Ŵéļçöɱé,!!!] ');
  });

  it('leaves pure whitespace and punctuation untouched', () => {
    expect(pseudoText(' ', 'expand')).toBe(' ');
    expect(pseudoText('!', 'expand')).toBe('!');
  });

  it('wraps RTL runs with [! !] and does not accent letters', () => {
    expect(pseudoText('Welcome, ', 'rtl')).toBe('[!Welcome,!] ');
    expect(pseudoText('!', 'rtl')).toBe('!');
  });
});

describe('pseudo rendering of real ICU messages', () => {
  it('decorates literal text but keeps substituted values verbatim', () => {
    const out = renderPseudo('Welcome, {name}!', {name: 'Ari'}, 'expand');
    expect(out).toBe('[Ŵéļçöɱé,!!!] Ari!');
  });

  it('renders the actual selected plural branch with the real number', () => {
    const message = '{count, plural, =0 {Your cart is empty} one {# item in your cart} other {# items in your cart}}';
    expect(renderPseudo(message, {count: 2}, 'expand')).toBe('2 [îţéɱŠ îñ ýöüř çàřţ!!!!!!]');
    expect(renderPseudo(message, {count: 1}, 'expand')).toBe('1 [îţéɱ îñ ýöüř çàřţ!!!!!!]');
    expect(renderPseudo(message, {count: 0}, 'expand')).toBe('[Ýöüř çàřţ îŠ éɱþţý!!!!!!]');
  });

  it('renders nested select/plural with the real parameter values', () => {
    const message =
      '{gender, select, female {{host} invited you and {count, plural, offset:1 =0 {nobody else} one {# other person} other {# other people}} to her party} ' +
      'other {{host} invited you and {count, plural, offset:1 =0 {nobody else} one {# other person} other {# other people}} to their party}}';
    const out = renderPseudo(message, {gender: 'female', host: 'Ann', count: 3}, 'expand');
    expect(out).toContain('Ann');
    expect(out).toContain('2');
    expect(out).toMatch(/^\[?Ann/); // host value is not wrapped/decorated
    expect(out).not.toContain('{host}');
    expect(out).not.toContain('{count}');
  });

  it('does not decorate formatted dates, times or numbers', () => {
    const iso = '2026-09-26T12:00:00Z';
    const date = new Intl.DateTimeFormat(PSEUDO_BASE_LOCALE, {dateStyle: 'medium'}).format(new Date(iso));
    const time = new Intl.DateTimeFormat(PSEUDO_BASE_LOCALE, {timeStyle: 'short'}).format(new Date(iso));
    const out = renderPseudo('Meeting on {day, date, medium} at {hour, time, short}', {day: iso, hour: iso}, 'expand');
    expect(out).toContain(date);
    expect(out).toContain(time);
    // The substituted values must not carry expansion markers.
    expect(out).toBe(`[Ṁééţîñĝ öñ!!!!] ${date} [àţ!!] ${time}`);

    const percent = renderPseudo("You''ve used {used, number, percent} of your quota", {used: 0.42}, 'expand');
    expect(percent).toContain(new Intl.NumberFormat(PSEUDO_BASE_LOCALE, {style: 'percent'}).format(0.42));
  });

  it('shows missing value placeholders verbatim and reports them', () => {
    const analysis = analyzeMessage('Welcome, {name}!');
    const result = formatPseudo(analysis.nodes, {}, 'expand');
    expect(result.rendered).toBe('[Ŵéļçöɱé,!!!] {name}!');
    expect(result.missingValues).toEqual(['name']);
  });

  it('renders RTL mode with readable Latin inside direction markers', () => {
    expect(renderPseudo('Welcome, {name}!', {name: 'Ari'}, 'rtl')).toBe('[!Welcome,!] Ari!');
    const message = '{count, plural, one {# item in your cart} other {# items in your cart}}';
    expect(renderPseudo(message, {count: 2}, 'rtl')).toBe('2 [!items in your cart!]');
  });

  it('is deterministic and always uses the fixed English plural/format base', () => {
    const message = '{count, plural, one {# item} other {# items}}';
    // English selects "other" for 0 (French would select "one") — pseudo must be stable
    // regardless of which real locale the user is previewing, and reproducible.
    const first = renderPseudo(message, {count: 0}, 'expand');
    const second = renderPseudo(message, {count: 0}, 'expand');
    expect(first).toBe(second);
    expect(first).toBe('0 [îţéɱŠ!!]');
  });
});
