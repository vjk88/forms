import {
    listTexts,
    localizeSpec,
    textFingerprint,
    translationStatus,
    translationProgress,
    setTranslation,
    addLanguage,
    removeLanguage,
    pruneTranslations,
    ensureRuleIds,
    withFreshRuleIds,
    mintRuleId
} from 'c/finalTranslate';

function spec() {
    return {
        header: { title: '<p>Hello</p>', description: 'Intro' },
        submit: { label: 'Send', nextLabel: 'Next' },
        settings: {
            completion: { title: 'Thanks', message: '<p>Done</p>' },
            availability: { closedMessage: 'Closed' }
        },
        languages: { default: 'en_US', available: ['en_US', 'fr'] },
        pages: [
            {
                id: 'pg1',
                name: 'About you',
                sections: [
                    {
                        id: 'sec1',
                        title: 'Your details',
                        elements: [
                            {
                                id: 'q1',
                                type: 'field',
                                label: 'Which plan?',
                                help: 'Pick one',
                                config: {
                                    leftLabel: 'Low',
                                    html: '<b>x</b>',
                                    options: [
                                        { value: 'a', label: 'Alpha' },
                                        { value: 'b', label: 'Beta' }
                                    ]
                                },
                                validation: [
                                    { id: 'vr_one', message: 'Required!' },
                                    { id: 'vr_two', message: 'Bad shape' }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                id: 'pg2',
                name: 'Page two',
                sections: [{ id: 'sec2', elements: [] }]
            }
        ]
    };
}

const byKey = (s) =>
    Object.fromEntries(listTexts(s).map((entry) => [entry.key, entry]));

describe('listTexts entries', () => {
    it('carries kind, rich and group, in spec order', () => {
        const all = byKey(spec());
        expect(all['header.title']).toMatchObject({
            kind: 'Form title',
            rich: true
        });
        expect(all['header.title'].group).toEqual({
            order: 0,
            title: 'Form header'
        });
        expect(all['page:pg1.name']).toMatchObject({ kind: 'Page name' });
        expect(all['sec:sec1.title']).toMatchObject({
            kind: 'Section title',
            rich: false
        });
        expect(all['sec:sec1.title'].group.title).toBe(
            'Page 1 · About you · Section: Your details'
        );
        expect(all['el:q1.label'].kind).toBe('Question');
        expect(all['el:q1.label'].group.title).toBe(
            'Page 1 · About you · Question: Which plan?'
        );
        expect(all['el:q1.help'].kind).toBe('Help text');
        expect(all['el:q1.leftLabel'].kind).toBe('Scale · left end');
        expect(all['el:q1.html']).toMatchObject({
            kind: 'Content',
            rich: true
        });
        expect(all['el:q1.opt:a'].kind).toBe('Option · a');
        expect(all['el:q1.msg:vr_one'].kind).toBe('Error message');
        expect(all['submit.label'].group.title).toBe('Buttons');
        expect(all['done.message']).toMatchObject({
            kind: 'Thank-you message',
            rich: true
        });
        expect(all['done.title'].group.title).toBe('After submit');
        expect(all['closed.message'].group.title).toBe(
            'When the form is closed'
        );
    });

    it('orders groups header, pages, buttons, after submit, closed', () => {
        const titles = [];
        listTexts(spec()).forEach(({ group }) => {
            if (!titles.includes(group.title)) {
                titles.push(group.title);
            }
        });
        expect(titles[0]).toBe('Form header');
        expect(titles.slice(-3)).toEqual([
            'Buttons',
            'After submit',
            'When the form is closed'
        ]);
        const orders = listTexts(spec()).map((x) => x.group.order);
        expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    });

    it('lists only texts that exist', () => {
        const keys = listTexts(spec()).map((x) => x.key);
        expect(keys).not.toContain('el:q1.placeholder');
        expect(keys).not.toContain('sec:sec2.title');
        expect(keys).not.toContain('header.brandName');
    });

    it('keys rules by id, falling back to position for old specs', () => {
        const old = spec();
        delete old.pages[0].sections[0].elements[0].validation[1].id;
        const keys = listTexts(old).map((x) => x.key);
        expect(keys).toContain('el:q1.msg:vr_one');
        expect(keys).toContain('el:q1.msg:1');
    });

    it('localizeSpec swaps by rule id and by position', () => {
        const s = spec();
        delete s.pages[0].sections[0].elements[0].validation[1].id;
        s.translations = {
            fr: { 'el:q1.msg:vr_one': 'Requis', 'el:q1.msg:1': 'Mauvais' }
        };
        const out = localizeSpec(s, 'fr');
        const rules = out.pages[0].sections[0].elements[0].validation;
        expect(rules.map((r) => r.message)).toEqual(['Requis', 'Mauvais']);
    });
});

describe('textFingerprint', () => {
    it('is 8 hex chars and stable across whitespace changes', () => {
        const a = textFingerprint('How  happy\n are you? ');
        expect(a).toMatch(/^[0-9a-f]{8}$/);
        expect(textFingerprint('How happy are you?')).toBe(a);
        expect(textFingerprint('How happy are you!')).not.toBe(a);
    });

    it('matches the FNV-1a reference values', () => {
        expect(textFingerprint('')).toBe('811c9dc5');
        expect(textFingerprint('a')).toBe('e40c292c');
    });
});

describe('setTranslation / translationStatus / translationProgress', () => {
    it('stores text with a fingerprint, never mutating the input', () => {
        const s = spec();
        const frozen = JSON.stringify(s);
        const out = setTranslation(s, 'fr', 'el:q1.label', 'Quel forfait ?');
        expect(JSON.stringify(s)).toBe(frozen);
        expect(out.translations.fr['el:q1.label']).toBe('Quel forfait ?');
        expect(out.translationSources.fr['el:q1.label']).toBe(
            textFingerprint('Which plan?')
        );
    });

    it('reports done, changed and missing', () => {
        let s = setTranslation(spec(), 'fr', 'el:q1.label', 'Quel forfait ?');
        s = setTranslation(s, 'fr', 'el:q1.help', 'Choisissez');
        s.pages[0].sections[0].elements[0].help = 'Pick exactly one';
        // a translation with no stored fingerprint also reads as changed
        s.translations.fr['el:q1.opt:a'] = 'Alfa';
        const status = Object.fromEntries(
            translationStatus(s, 'fr').map((x) => [x.key, x])
        );
        expect(status['el:q1.label'].status).toBe('done');
        expect(status['el:q1.label'].translation).toBe('Quel forfait ?');
        expect(status['el:q1.label'].source).toBe('Which plan?');
        expect(status['el:q1.help'].status).toBe('changed');
        expect(status['el:q1.opt:a'].status).toBe('changed');
        expect(status['el:q1.opt:b'].status).toBe('missing');
        expect(status['el:q1.opt:b'].translation).toBe('');
        const p = translationProgress(s, 'fr');
        expect(p.done).toBe(1);
        expect(p.changed).toBe(2);
        expect(p.total).toBe(listTexts(s).length);
        expect(p.missing).toBe(p.total - 3);
    });

    it('treats blank translations as missing and removes both entries', () => {
        let s = setTranslation(spec(), 'fr', 'el:q1.label', 'Quel forfait ?');
        s = setTranslation(s, 'fr', 'el:q1.label', '   ');
        expect(s.translations.fr['el:q1.label']).toBeUndefined();
        expect(s.translationSources.fr['el:q1.label']).toBeUndefined();
        expect(
            translationStatus(s, 'fr').find((x) => x.key === 'el:q1.label')
                .status
        ).toBe('missing');
    });

    it('ignores keys that are not listed texts', () => {
        const out = setTranslation(spec(), 'fr', 'el:nope.label', 'X');
        expect(out.translations).toBeUndefined();
    });
});

describe('addLanguage / removeLanguage', () => {
    it('creates the languages block when missing', () => {
        const out = addLanguage({ pages: [] }, 'fr');
        expect(out.languages).toEqual({
            default: 'en_US',
            available: ['en_US', 'fr']
        });
    });

    it('adds once, keeps other settings, never mutates', () => {
        const s = spec();
        s.languages.showSwitcher = true;
        const frozen = JSON.stringify(s);
        const out = addLanguage(addLanguage(s, 'de-de'), 'de_DE');
        expect(JSON.stringify(s)).toBe(frozen);
        expect(out.languages.available).toEqual(['en_US', 'fr', 'de_DE']);
        expect(out.languages.showSwitcher).toBe(true);
    });

    it('removes a language with its translations and fingerprints', () => {
        let s = setTranslation(spec(), 'fr', 'el:q1.label', 'Quel forfait ?');
        s = removeLanguage(s, 'fr');
        expect(s.languages.available).toEqual(['en_US']);
        expect(s.translations.fr).toBeUndefined();
        expect(s.translationSources.fr).toBeUndefined();
    });

    it('never removes the default language', () => {
        const out = removeLanguage(spec(), 'en_US');
        expect(out.languages.available).toEqual(['en_US', 'fr']);
        expect(out.languages.default).toBe('en_US');
    });
});

describe('pruneTranslations', () => {
    it('drops keys for deleted questions, options and rules in every language', () => {
        let s = spec();
        ['fr', 'de'].forEach((lang) => {
            [
                'el:q1.label',
                'el:q1.opt:a',
                'el:q1.opt:b',
                'el:q1.msg:vr_two'
            ].forEach((key) => {
                s = setTranslation(s, lang, key, 'T');
            });
        });
        const el = s.pages[0].sections[0].elements[0];
        el.config.options.pop();
        el.validation.pop();
        const out = pruneTranslations(s);
        ['translations', 'translationSources'].forEach((block) => {
            ['fr', 'de'].forEach((lang) => {
                expect(Object.keys(out[block][lang]).sort()).toEqual([
                    'el:q1.label',
                    'el:q1.opt:a'
                ]);
            });
        });
        expect(Object.keys(s.translations.fr)).toHaveLength(4);
        s.pages[0].sections[0].elements = [];
        expect(pruneTranslations(s).translations.fr).toEqual({});
    });
});

describe('rule ids', () => {
    it('mints vr_ + 8 base36 characters', () => {
        expect(mintRuleId()).toMatch(/^vr_[0-9a-z]{8}$/);
        expect(mintRuleId()).not.toBe(mintRuleId());
    });

    it('ensureRuleIds adds ids, renames index keys everywhere, and is idempotent', () => {
        const s = spec();
        const rules = s.pages[0].sections[0].elements[0].validation;
        delete rules[0].id;
        delete rules[1].id;
        s.translations = {
            fr: {
                'el:q1.msg:0': 'Requis',
                'el:q1.msg:1': 'Mauvais',
                'el:q1.label': 'Quel forfait ?'
            }
        };
        s.translationSources = { fr: { 'el:q1.msg:1': 'abc' } };
        const frozen = JSON.stringify(s);
        const out = ensureRuleIds(s);
        expect(JSON.stringify(s)).toBe(frozen);
        const ids = out.pages[0].sections[0].elements[0].validation.map(
            (r) => r.id
        );
        expect(ids[0]).toMatch(/^vr_/);
        expect(ids[0]).not.toBe(ids[1]);
        expect(out.translations.fr).toEqual({
            [`el:q1.msg:${ids[0]}`]: 'Requis',
            [`el:q1.msg:${ids[1]}`]: 'Mauvais',
            'el:q1.label': 'Quel forfait ?'
        });
        expect(out.translationSources.fr).toEqual({
            [`el:q1.msg:${ids[1]}`]: 'abc'
        });
        expect(ensureRuleIds(out)).toEqual(out);
        // the renamed keys now resolve to the right message
        const fr = localizeSpec(out, 'fr');
        expect(
            fr.pages[0].sections[0].elements[0].validation.map((r) => r.message)
        ).toEqual(['Requis', 'Mauvais']);
    });

    it('keeps existing ids and never overwrites an existing id key', () => {
        const s = spec();
        s.translations = {
            fr: { 'el:q1.msg:0': 'old', 'el:q1.msg:vr_one': 'kept' }
        };
        const out = ensureRuleIds(s);
        expect(
            out.pages[0].sections[0].elements[0].validation.map((r) => r.id)
        ).toEqual(['vr_one', 'vr_two']);
        expect(out.translations.fr).toEqual({ 'el:q1.msg:vr_one': 'kept' });
    });

    it('withFreshRuleIds gives a copy new ids and leaves the source alone', () => {
        const el = spec().pages[0].sections[0].elements[0];
        const copy = withFreshRuleIds(el);
        expect(el.validation.map((r) => r.id)).toEqual(['vr_one', 'vr_two']);
        copy.validation.forEach((r, i) => {
            expect(r.id).toMatch(/^vr_/);
            expect(r.id).not.toBe(el.validation[i].id);
            expect(r.message).toBe(el.validation[i].message);
        });
    });
});
