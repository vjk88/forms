import {
    t,
    tn,
    resolveLanguage,
    normalizeLanguage,
    loadLanguage,
    setLabelOverrides,
    clearLabelOverrides,
    pickLanguage,
    localizeSpec,
    listTexts,
    TEXT_KEYS
} from 'c/finalTranslate';
import { EN } from '../defaults';
import runtimeLabels from '@salesforce/apex/FinalGuestController.runtimeLabels';

jest.mock(
    '@salesforce/apex/FinalGuestController.runtimeLabels',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

afterEach(() => {
    clearLabelOverrides();
    runtimeLabels.mockReset();
    window.history.replaceState({}, '', '/');
});

describe('t()', () => {
    it('falls back to the English default when the label import is the jest stub', () => {
        expect(t('Final_Run_Next')).toBe('Next');
        expect(t('Final_Run_Submit')).toBe(EN.Final_Run_Submit);
    });

    it('prefers an override, then falls back again when it is cleared', () => {
        setLabelOverrides({ Final_Run_Next: 'Suivant' });
        expect(t('Final_Run_Next')).toBe('Suivant');
        expect(t('Final_Run_Back')).toBe('Back');
        clearLabelOverrides();
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('ignores an empty override', () => {
        setLabelOverrides({ Final_Run_Next: '' });
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('returns the name itself for an unknown label', () => {
        expect(t('Final_Run_DoesNotExist')).toBe('Final_Run_DoesNotExist');
    });

    it('replaces {0}, {1} placeholders and keeps unmatched ones', () => {
        expect(t('Final_Run_PageOf', 2, 5)).toBe('2 of 5');
        expect(t('Final_Run_PageOf', 0, 3)).toBe('0 of 3');
        expect(t('Final_Run_PageOf', 2)).toBe('2 of {1}');
        // the repeat-entry title keeps its own {index} token
        expect(t('Final_Run_EntryDefault')).toBe('Entry {index}');
    });

    it('does not treat a replacement value as a pattern', () => {
        expect(t('Final_Run_ClearNamed', '$& $1')).toBe('Clear $& $1');
    });

    it('applies placeholders to an override too', () => {
        setLabelOverrides({ Final_Run_PageOf: '{1} sur {0}' });
        expect(t('Final_Run_PageOf', 2, 5)).toBe('5 sur 2');
    });
});

describe('tn()', () => {
    it('picks singular for 1 and plural otherwise, passing n as {0}', () => {
        expect(
            tn(
                'Final_Run_FixFieldsContinueOne',
                'Final_Run_FixFieldsContinueMany',
                1
            )
        ).toBe('Fix 1 field to continue');
        expect(
            tn(
                'Final_Run_FixFieldsContinueOne',
                'Final_Run_FixFieldsContinueMany',
                3
            )
        ).toBe('Fix 3 fields to continue');
        expect(
            tn('Final_Run_MinEntriesOne', 'Final_Run_MinEntriesMany', 2)
        ).toBe('Fill in at least 2 entries.');
    });
});

describe('language codes', () => {
    it.each([
        ['fr', 'fr'],
        ['fr_CA', 'fr_CA'],
        ['fr-CA', 'fr_CA'],
        ['fr-ca', 'fr_CA'],
        ['haw', 'haw'],
        ['  de  ', 'de']
    ])('normalises %s to %s', (input, expected) => {
        expect(normalizeLanguage(input)).toBe(expected);
        expect(resolveLanguage({ param: input })).toBe(expected);
    });

    it.each([
        'FR',
        'french',
        'f',
        'fr_',
        'fr-CAN',
        'en_US_x',
        '../x',
        'fr;x',
        '',
        null,
        undefined
    ])('rejects %p', (input) => {
        expect(normalizeLanguage(input)).toBeNull();
    });

    it('reads ?lang= from the URL when no param is given', () => {
        window.history.replaceState({}, '', '/form?lang=fr-CA');
        expect(resolveLanguage({})).toBe('fr_CA');
        expect(resolveLanguage()).toBe('fr_CA');
    });

    it('reads ?c__lang= too, and prefers the host-supplied param', () => {
        window.history.replaceState({}, '', '/form?c__lang=de');
        expect(resolveLanguage({})).toBe('de');
        expect(resolveLanguage({ param: 'es' })).toBe('es');
    });

    it('is null with no param and no URL language', () => {
        window.history.replaceState({}, '', '/form?other=1');
        expect(resolveLanguage({})).toBeNull();
    });

    it('is null for a bad URL value', () => {
        window.history.replaceState({}, '', '/form?lang=%3Cscript%3E');
        expect(resolveLanguage({})).toBeNull();
    });
});

describe('loadLanguage()', () => {
    it('sets overrides from Apex', async () => {
        runtimeLabels.mockResolvedValue({ Final_Run_Next: 'Weiter' });
        await loadLanguage('de');
        expect(runtimeLabels).toHaveBeenCalledWith({ lang: 'de' });
        expect(t('Final_Run_Next')).toBe('Weiter');
        expect(t('Final_Run_Back')).toBe('Back');
    });

    it('clears overrides for a null language without calling Apex', async () => {
        setLabelOverrides({ Final_Run_Next: 'Weiter' });
        await loadLanguage(null);
        expect(runtimeLabels).not.toHaveBeenCalled();
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('swallows an Apex error and falls back to the defaults', async () => {
        setLabelOverrides({ Final_Run_Next: 'stale' });
        runtimeLabels.mockRejectedValue(new Error('boom'));
        await expect(loadLanguage('fr')).resolves.toBeUndefined();
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('treats an empty Apex answer as no translations', async () => {
        runtimeLabels.mockResolvedValue(undefined);
        await loadLanguage('fr');
        expect(t('Final_Run_Next')).toBe('Next');
    });
});

// ---------------------------------------------------------------------------
// Author text (PR 2)
// ---------------------------------------------------------------------------

const en = (name) => `EN:${name}`;

/** A spec with EVERY author text set to EN:<name>; ids and values are plain. */
function fullSpec() {
    return {
        specVersion: 1,
        languages: { default: 'en_US', available: ['en_US', 'fr', 'de_DE'] },
        header: {
            title: en('header.title'),
            description: en('header.description'),
            brandName: en('header.brandName'),
            highlight: { text: en('header.highlight'), variant: 'badge' },
            logo: { url: '/logo.png' }
        },
        layout: {
            type: 'splitHero',
            options: {
                paneTitle: en('pane.title'),
                paneSubtitle: en('pane.subtitle'),
                paneBrandName: en('pane.brandName'),
                paneHighlight: { text: en('pane.highlight') },
                advanceLabel: en('layout.advanceLabel')
            }
        },
        submit: {
            label: en('submit.label'),
            nextLabel: en('submit.nextLabel'),
            backLabel: en('submit.backLabel')
        },
        settings: {
            completion: {
                title: en('done.title'),
                message: en('done.message'),
                buttonLabel: en('done.buttonLabel')
            },
            availability: { closedMessage: en('closed.message') }
        },
        pages: [
            {
                id: 'pg_1',
                name: en('page:pg_1.name'),
                sections: [
                    {
                        id: 'sec_1',
                        title: en('sec:sec_1.title'),
                        description: en('sec:sec_1.description'),
                        repeat: {
                            addLabel: en('sec:sec_1.addLabel'),
                            removeLabel: en('sec:sec_1.removeLabel'),
                            entryLabel: en('sec:sec_1.entryLabel') + ' {index}'
                        },
                        elements: [
                            {
                                id: 'q1',
                                type: 'field',
                                label: en('el:q1.label'),
                                help: en('el:q1.help'),
                                description: en('el:q1.description'),
                                placeholder: en('el:q1.placeholder'),
                                config: {
                                    leftLabel: en('el:q1.leftLabel'),
                                    rightLabel: en('el:q1.rightLabel'),
                                    yesLabel: en('el:q1.yesLabel'),
                                    noLabel: en('el:q1.noLabel'),
                                    valuePrefix: en('el:q1.valuePrefix'),
                                    valueSuffix: en('el:q1.valueSuffix'),
                                    html: en('el:q1.html'),
                                    alt: en('el:q1.alt'),
                                    accept: '.pdf',
                                    options: [
                                        {
                                            value: 'yes',
                                            label: en('el:q1.opt:yes'),
                                            description: en('el:q1.optdesc:yes')
                                        },
                                        {
                                            value: 'no',
                                            label: en('el:q1.opt:no')
                                        }
                                    ],
                                    points: [
                                        { value: 1, label: en('el:q1.point:1') }
                                    ],
                                    rows: [
                                        {
                                            value: 'r1',
                                            label: en('el:q1.row:r1')
                                        }
                                    ],
                                    schemaOptions: [
                                        {
                                            value: 'a',
                                            label: 'Salesforce label'
                                        }
                                    ]
                                },
                                validation: [
                                    {
                                        type: 'required',
                                        message: en('el:q1.msg:0')
                                    },
                                    {
                                        type: 'pattern',
                                        message: en('el:q1.msg:1')
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    };
}

/** Translations for every text the inventory lists: FR:<key>. */
function withFrench(spec) {
    const fr = {};
    listTexts(spec).forEach(({ key }) => {
        fr[key] = `FR:${key}`;
    });
    return { ...spec, translations: { fr } };
}

function walkStrings(value, visit, path = '') {
    if (typeof value === 'string') {
        visit(value, path);
    } else if (Array.isArray(value)) {
        value.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
        Object.keys(value).forEach((k) =>
            walkStrings(value[k], visit, `${path}.${k}`)
        );
    }
}

describe('TEXT_KEYS inventory', () => {
    it('lists the documented key families', () => {
        const keys = listTexts(fullSpec()).map((x) => x.key);
        [
            'header.title',
            'header.description',
            'header.brandName',
            'header.highlight',
            'pane.title',
            'pane.subtitle',
            'pane.brandName',
            'pane.highlight',
            'page:pg_1.name',
            'sec:sec_1.title',
            'sec:sec_1.description',
            'sec:sec_1.addLabel',
            'sec:sec_1.removeLabel',
            'sec:sec_1.entryLabel',
            'el:q1.label',
            'el:q1.help',
            'el:q1.description',
            'el:q1.placeholder',
            'el:q1.leftLabel',
            'el:q1.rightLabel',
            'el:q1.yesLabel',
            'el:q1.noLabel',
            'el:q1.valuePrefix',
            'el:q1.valueSuffix',
            'el:q1.html',
            'el:q1.alt',
            'el:q1.opt:yes',
            'el:q1.optdesc:yes',
            'el:q1.point:1',
            'el:q1.row:r1',
            'el:q1.msg:0',
            'el:q1.msg:1',
            'submit.label',
            'submit.nextLabel',
            'submit.backLabel',
            'layout.advanceLabel',
            'done.title',
            'done.message',
            'done.buttonLabel',
            'closed.message'
        ].forEach((k) => expect(keys).toContain(k));
        expect(TEXT_KEYS.root.length).toBeGreaterThan(10);
    });

    it('never lists values, ids, urls or schema options', () => {
        const keys = listTexts(fullSpec()).map((x) => x.key);
        expect(keys.some((k) => /accept|schema|logo|url/i.test(k))).toBe(false);
    });

    it('localizeSpec leaves no EN: text behind (the inventory guard)', () => {
        const spec = withFrench(fullSpec());
        const out = localizeSpec(spec, 'fr');
        const left = [];
        walkStrings(out, (text, path) => {
            if (text.startsWith('EN:')) {
                left.push(path);
            }
        });
        expect(left).toEqual([]);
        expect(out.pages[0].sections[0].elements[0].label).toBe(
            'FR:el:q1.label'
        );
    });
});

describe('localizeSpec', () => {
    it('swaps every key family', () => {
        const out = localizeSpec(withFrench(fullSpec()), 'fr');
        const el = out.pages[0].sections[0].elements[0];
        expect(out.header.title).toBe('FR:header.title');
        expect(out.header.highlight.text).toBe('FR:header.highlight');
        expect(out.layout.options.paneHighlight.text).toBe('FR:pane.highlight');
        expect(out.layout.options.advanceLabel).toBe('FR:layout.advanceLabel');
        expect(out.submit.nextLabel).toBe('FR:submit.nextLabel');
        expect(out.settings.completion.buttonLabel).toBe('FR:done.buttonLabel');
        expect(out.settings.availability.closedMessage).toBe(
            'FR:closed.message'
        );
        expect(out.pages[0].name).toBe('FR:page:pg_1.name');
        expect(out.pages[0].sections[0].repeat.addLabel).toBe(
            'FR:sec:sec_1.addLabel'
        );
        expect(el.config.options[0].label).toBe('FR:el:q1.opt:yes');
        expect(el.config.options[0].description).toBe('FR:el:q1.optdesc:yes');
        expect(el.config.points[0].label).toBe('FR:el:q1.point:1');
        expect(el.config.rows[0].label).toBe('FR:el:q1.row:r1');
        expect(el.validation[1].message).toBe('FR:el:q1.msg:1');
    });

    it('never touches values, ids, urls, accept or schema options', () => {
        const spec = withFrench(fullSpec());
        const out = localizeSpec(spec, 'fr');
        const el = out.pages[0].sections[0].elements[0];
        expect(el.id).toBe('q1');
        expect(el.config.options.map((o) => o.value)).toEqual(['yes', 'no']);
        expect(el.config.points[0].value).toBe(1);
        expect(el.config.accept).toBe('.pdf');
        expect(el.config.schemaOptions[0].label).toBe('Salesforce label');
        expect(out.header.logo.url).toBe('/logo.png');
    });

    it('falls back to the default text per key', () => {
        const spec = fullSpec();
        spec.translations = {
            fr: { 'el:q1.label': 'Votre nom', 'submit.label': '' }
        };
        const out = localizeSpec(spec, 'fr');
        const el = out.pages[0].sections[0].elements[0];
        expect(el.label).toBe('Votre nom');
        expect(el.help).toBe('EN:el:q1.help');
        expect(out.submit.label).toBe('EN:submit.label');
    });

    it('uses the base language for a regional code, exact code first', () => {
        const spec = fullSpec();
        spec.translations = {
            fr: { 'el:q1.label': 'Nom', 'el:q1.help': 'Aide' },
            fr_CA: { 'el:q1.label': 'Nom (CA)' }
        };
        const out = localizeSpec(spec, 'fr-CA');
        const el = out.pages[0].sections[0].elements[0];
        expect(el.label).toBe('Nom (CA)');
        expect(el.help).toBe('Aide');
    });

    it('does not mutate the input', () => {
        const spec = withFrench(fullSpec());
        const before = JSON.stringify(spec);
        const out = localizeSpec(spec, 'fr');
        expect(out).not.toBe(spec);
        expect(JSON.stringify(spec)).toBe(before);
    });

    it('returns the spec itself with no language, the default or no translations', () => {
        const spec = withFrench(fullSpec());
        expect(localizeSpec(spec, null)).toBe(spec);
        expect(localizeSpec(spec, 'en-US')).toBe(spec);
        expect(localizeSpec(spec, 'ja')).toBe(spec);
        const plain = fullSpec();
        expect(localizeSpec(plain, 'fr')).toBe(plain);
    });

    it('keys a page with no id by its index', () => {
        const spec = {
            pages: [{ name: 'A' }, { name: 'B' }],
            translations: { fr: { 'page:1.name': 'Bé' } }
        };
        const out = localizeSpec(spec, 'fr');
        expect(out.pages.map((p) => p.name)).toEqual(['A', 'Bé']);
    });
});

describe('pickLanguage', () => {
    const spec = {
        languages: { default: 'en_US', available: ['en_US', 'fr', 'de_DE'] }
    };

    it('without a languages block it is the link param only (PR 1)', () => {
        expect(pickLanguage({ spec: {}, param: 'fr-CA' })).toBe('fr_CA');
        expect(
            pickLanguage({ spec: {}, userLang: 'de', browserLangs: ['de'] })
        ).toBeNull();
    });

    it('prefers the link param over the user and the browser', () => {
        expect(
            pickLanguage({
                spec,
                param: 'de',
                userLang: 'fr',
                browserLangs: ['fr']
            })
        ).toBe('de_DE');
    });

    it('then the signed-in user language, then each browser language', () => {
        expect(
            pickLanguage({ spec, userLang: 'fr-FR', browserLangs: ['de'] })
        ).toBe('fr');
        expect(
            pickLanguage({
                spec,
                userLang: 'ja',
                browserLangs: ['ko', 'de-DE', 'fr']
            })
        ).toBe('de_DE');
    });

    it('a guest has no user language: the browser decides', () => {
        expect(
            pickLanguage({ spec, userLang: null, browserLangs: ['de', 'fr'] })
        ).toBe('de_DE');
    });

    it('matches the exact code, then the base language', () => {
        expect(pickLanguage({ spec, param: 'fr-CA' })).toBe('fr');
        expect(pickLanguage({ spec, param: 'de' })).toBe('de_DE');
        expect(pickLanguage({ spec, param: 'de-DE' })).toBe('de_DE');
    });

    it('skips unavailable languages and ends at the default', () => {
        expect(
            pickLanguage({
                spec,
                param: 'ja',
                userLang: 'ko',
                browserLangs: ['zh', 'fr']
            })
        ).toBe('fr');
        expect(
            pickLanguage({
                spec,
                param: 'ja',
                userLang: null,
                browserLangs: []
            })
        ).toBe('en_US');
        expect(
            pickLanguage({
                spec,
                param: 'not a code',
                userLang: null,
                browserLangs: []
            })
        ).toBe('en_US');
    });

    it('with undefined user/browser it reads the platform (jest stubs)', () => {
        // the stubs say a signed-in en-US user
        expect(pickLanguage({ spec })).toBe('en_US');
    });
});
