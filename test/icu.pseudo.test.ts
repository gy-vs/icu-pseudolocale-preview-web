import {describe, expect, it} from 'vitest';
import {formatMessage, parseMessage, pseudoText, wrapPseudoRender} from '../src/shared/icu/index';

function pseudoRender(message: string, mode: 'en-XA' | 'ar-XB', values: Record<string, unknown> = {}, locale = 'en'): string {
  const {nodes, diagnostics} = parseMessage(message);
  expect(diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
  return formatMessage(nodes, values as never, locale, {pseudo: mode}).rendered;
}

describe('pseudoText', () => {
  it('accents Latin words and expands them deterministically', () => {
    expect(pseudoText('Welcome', 'en-XA')).toBe('Ŵéłçömé~~~');
    expect(pseudoText('cart', 'en-XA')).toBe('çåřŧ~~');
    expect(pseudoText('a', 'en-XA')).toBe('å~');
  });

  it('leaves digits and punctuation in place', () => {
    expect(pseudoText('12 items!', 'en-XA')).toBe('12 îŧémş~~!');
    expect(pseudoText("it's fine", 'en-XA')).toBe("îŧ~'ş~ ƒîñé~~");
  });

  it('does not touch non-Latin scripts', () => {
    expect(pseudoText('2 штуки', 'en-XA')).toBe('2 штуки');
  });

  it('is pure: identical input yields identical output', () => {
    const runs = Array.from({length: 5}, () => pseudoText('A stable sentence for review', 'en-XA'));
    expect(new Set(runs).size).toBe(1);
  });

  it('returns the text unchanged for the RTL mode', () => {
    expect(pseudoText('Welcome to the party', 'ar-XB')).toBe('Welcome to the party');
    expect(pseudoText('2 штуки', 'ar-XB')).toBe('2 штуки');
  });

  it('wraps rendered sentences with mode markers', () => {
    expect(wrapPseudoRender('Hi', 'en-XA')).toBe('⟦Hi⟧');
    expect(wrapPseudoRender('Hi', 'ar-XB')).toBe('[!Hi!]');
  });
});

describe('pseudo-localized formatting', () => {
  it('expands literal copy but keeps simple argument values real', () => {
    expect(pseudoRender('Welcome, {name}!', 'en-XA', {name: 'Ari'})).toBe('⟦Ŵéłçömé~~~, Ari!⟧');
  });

  it('renders real plural sentences (not ICU source) while keeping the number real', () => {
    const cart = '{count, plural, =0 {Your cart is empty} one {# item in your cart} other {# items in your cart}}';
    expect(pseudoRender(cart, 'en-XA', {count: 2})).toBe('⟦2 îŧémş~~ îñ~ ŷöüř~~ çåřŧ~~⟧');
    // Exact =0 branch text is pseudo-localized too.
    expect(pseudoRender(cart, 'en-XA', {count: 0})).toBe('⟦Ŷöüř~~ çåřŧ~~ îş~ émƥŧŷ~~⟧');
  });

  it('uses the real locale plural rules and number formatting under pseudo mode', () => {
    // French formats 1,5 with a comma; the pseudo layer must not alter it.
    const message = '{count, plural, one {# élément} other {# éléments}}';
    expect(pseudoRender(message, 'en-XA', {count: 1.5}, 'fr-FR')).toBe('⟦1,5 éł~éméñŧ~~⟧');
    // 0 selects "one" in French — still the real rules, just expanded text.
    expect(pseudoRender(message, 'en-XA', {count: 0}, 'fr-FR')).toBe('⟦0 éł~éméñŧ~~⟧');
  });

  it('pseudo-localizes nested select/plural bodies with shared values', () => {
    const invite =
      '{gender, select, female {{host} invited you and {count, plural, offset:1 =0 {nobody else} one {# other person} other {# other people}} to her party} ' +
      'other {{host} invited you and {count, plural, offset:1 =0 {nobody else} one {# other person} other {# other people}} to their party}}';
    expect(pseudoRender(invite, 'ar-XB', {gender: 'female', host: 'Ann', count: 3})).toBe(
      '[!Ann invited you and 2 other people to her party!]',
    );
  });

  it('keeps date, time and percent formatting real', () => {
    const iso = '2026-09-26T12:00:00Z';
    const datePart = new Intl.DateTimeFormat('en', {dateStyle: 'medium'}).format(new Date(iso));
    expect(pseudoRender('Meeting on {day, date, medium}', 'en-XA', {day: iso})).toBe(
      `⟦Mééŧîñğ~~~ öñ~ ${datePart}⟧`,
    );
    expect(pseudoRender("You''ve used {used, number, percent} of your quota", 'en-XA', {used: 0.42})).toBe(
      "⟦Ŷöü~~'ʋé~ üşéð~~ 42% öƒ~ ŷöüř~~ qüöŧå~~⟧",
    );
  });

  it('does not decorate missing-value placeholders and reports them', () => {
    const {nodes} = parseMessage('Welcome, {name}!');
    const result = formatMessage(nodes, {}, 'en', {pseudo: 'en-XA'});
    expect(result.rendered).toBe('⟦Ŵéłçömé~~~, {name}!⟧');
    expect(result.missingValues).toEqual(['name']);
  });

  it('distinguishes quoted literal braces from real placeholders', () => {
    // The literal "{name}" is part of the copy and therefore gets expanded;
    // the substituted value stays real.
    expect(pseudoRender("Use '{name}' for {name}", 'en-XA', {name: 'Ari'})).toBe(
      '⟦Üşé~~ {ñåmé~~} ƒöř~~ Ari⟧',
    );
  });

  it('wraps RTL mode with bidi markers and leaves the letters untouched', () => {
    expect(pseudoRender('Welcome, {name}!', 'ar-XB', {name: 'Ari'})).toBe('[!Welcome, Ari!!]');
  });
});
