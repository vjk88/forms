import { createElement } from 'lwc';
import FinalTranslatePane from 'c/finalTranslatePane';
import {
    addLanguage,
    setTranslation,
    textFingerprint,
    translationProgress
} from 'c/finalTranslate';

const LANGS = [
    { code: 'en_US', label: 'English' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'es', label: 'Spanish' }
];

const LONG =
    'How satisfied are you with the support you received from our team over the last quarter?';

function baseSpec() {
    return {
        header: { title: 'Customer survey' },
        submit: { label: 'Send feedback' },
        settings: {
            completion: { message: '<p>Thanks! <b>We read</b> it.</p>' }
        },
        pages: [
            {
                id: 'pg1',
                name: 'About you',
                sections: [
                    {
                        id: 'sec1',
                        title: 'Your details',
                        elements: [
                            { id: 'q1', type: 'field', label: 'Your name' },
                            { id: 'q2', type: 'field', label: LONG },
                            {
                                id: 'q3',
                                type: 'field',
                                label: 'Which plan?',
                                config: {
                                    options: [
                                        { value: 'basic', label: 'Basic' },
                                        { value: 'pro', label: 'Professional' }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }
        ]
    };
}

/** English + French (header done, name done) + German offered, nothing in it. */
function twoLangs() {
    let s = addLanguage(addLanguage(baseSpec(), 'fr'), 'de');
    s = setTranslation(s, 'fr', 'header.title', 'Enquête client');
    s = setTranslation(s, 'fr', 'el:q1.label', 'Votre nom');
    return s;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(spec, props = {}) {
    const el = createElement('c-final-translate-pane', {
        is: FinalTranslatePane
    });
    el.spec = spec;
    el.languages = LANGS;
    Object.assign(el, props);
    document.body.appendChild(el);
    await flush();
    return el;
}

const sr = (el) => el.shadowRoot;
const rows = (el) => [...sr(el).querySelectorAll('.tr-row')];
const rowKeys = (el) => rows(el).map((r) => r.dataset.row);
const inputOf = (el, key) =>
    sr(el).querySelector(`[data-key="${key}"]:not(button)`);
const pill = (el, key) =>
    sr(el).querySelector(`[data-row="${key}"] .tr-pill`).textContent;
const filterBtn = (el, value) =>
    sr(el)
        .querySelector('c-final-button-group')
        .shadowRoot.querySelector(`button[data-value="${value}"]`);

function type(input, value) {
    input.dispatchEvent(new CustomEvent('change', { detail: { value } }));
}

describe('c-final-translate-pane', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
    });

    describe('languages', () => {
        it('shows the default card and one card per language with counts', async () => {
            const spec = twoLangs();
            const el = await mount(spec);
            const def = sr(el).querySelector('[data-id="default-language"]');
            expect(def.textContent).toContain('English');
            expect(def.textContent).toContain('Default');
            expect(def.textContent).toContain('Written in Build');
            const p = translationProgress(spec, 'fr');
            expect(def.textContent).toContain(`${p.total} texts`);
            const cards = sr(el).querySelectorAll('button.tr-lang');
            expect(cards).toHaveLength(2);
            expect(cards[0].textContent).toContain('French');
            expect(cards[0].textContent).toContain(`2 / ${p.total}`);
            expect(cards[0].textContent).toContain(`${p.total - 2} missing`);
            expect(cards[1].textContent).toContain('German');
            expect(cards[1].textContent).toContain(`0 / ${p.total}`);
            expect(cards[0].getAttribute('aria-current')).toBe('true');
            expect(cards[1].getAttribute('aria-current')).toBe('false');
            expect(sr(el).querySelector('.tr-title').textContent).toBe(
                'French'
            );
        });

        it('says how many changed in English on the card', async () => {
            let spec = twoLangs();
            spec.header.title = 'Customer feedback';
            const el = await mount(spec);
            const card = sr(el).querySelector('button.tr-lang');
            expect(card.textContent).toContain('1 changed in English');
        });

        it('uses the default language name, falling back to Intl names', async () => {
            const spec = addLanguage(baseSpec(), 'fr');
            const el = await mount(spec, { languages: [] });
            expect(
                sr(el).querySelector('[data-id="default-language"]').textContent
            ).toContain('English');
            expect(
                sr(el).querySelector('button.tr-lang').textContent
            ).toContain('French');
        });

        it('selecting a card shows that language and reports it', async () => {
            const el = await mount(twoLangs());
            const seen = [];
            el.addEventListener('languagechange', (e) => seen.push(e.detail));
            sr(el).querySelector('button.tr-lang[data-code="de"]').click();
            await flush();
            expect(sr(el).querySelector('.tr-title').textContent).toBe(
                'German'
            );
            expect(seen).toEqual([{ code: 'de', label: 'German' }]);
        });

        it('opens on the language the Studio passes in', async () => {
            const el = await mount(twoLangs(), { selectedLanguage: 'de' });
            expect(sr(el).querySelector('.tr-title').textContent).toBe(
                'German'
            );
        });
    });

    describe('grid', () => {
        it('lists groups and rows with Where, English, translation and status', async () => {
            const el = await mount(twoLangs());
            filterBtn(el, 'all').click();
            await flush();
            const groups = [...sr(el).querySelectorAll('.tr-group')].map((g) =>
                g.textContent.trim()
            );
            expect(groups).toEqual([
                'Form header',
                'Page 1 · About you',
                'Page 1 · About you · Section: Your details',
                'Page 1 · About you · Question: Your name',
                `Page 1 · About you · Question: ${LONG}`,
                'Page 1 · About you · Question: Which plan?',
                'Buttons',
                'After submit'
            ]);
            const nameRow = sr(el).querySelector('[data-row="el:q1.label"]');
            expect(nameRow.querySelector('.tr-what').textContent).toContain(
                'Question'
            );
            expect(nameRow.querySelector('.tr-src').textContent).toContain(
                'Your name'
            );
            expect(inputOf(el, 'el:q1.label').value).toBe('Votre nom');
            expect(pill(el, 'el:q1.label')).toBe('Done');
            expect(pill(el, 'el:q3.opt:basic')).toBe('Missing');
            expect(inputOf(el, 'el:q3.opt:basic').placeholder).toBe(
                'Shows the English until translated'
            );
        });

        it('defaults to Needs work, and All when nothing needs work', async () => {
            const el = await mount(twoLangs());
            const keys = rowKeys(el);
            expect(keys).not.toContain('header.title');
            expect(keys).toContain('el:q3.opt:basic');

            let done = addLanguage(baseSpec(), 'fr');
            filterBtn(el, 'all').click();
            await flush();
            rowKeys(el).forEach((k) => {
                done = setTranslation(done, 'fr', k, 'fr');
            });
            const el2 = await mount(done);
            expect(rowKeys(el2)).toContain('header.title');
            expect(
                sr(el2).querySelector('button.tr-lang').textContent
            ).toContain('All done');
        });

        it('switches between All, Needs work and Done with counts', async () => {
            const spec = twoLangs();
            const p = translationProgress(spec, 'fr');
            const el = await mount(spec);
            const labels = [
                ...sr(el)
                    .querySelector('c-final-button-group')
                    .shadowRoot.querySelectorAll('button')
            ].map((b) => b.textContent.trim());
            expect(labels).toEqual([
                `All ${p.total}`,
                `Needs work ${p.total - 2}`,
                'Done 2'
            ]);
            filterBtn(el, 'done').click();
            await flush();
            expect(rowKeys(el)).toEqual(['header.title', 'el:q1.label']);
            filterBtn(el, 'all').click();
            await flush();
            expect(rowKeys(el)).toHaveLength(p.total);
            filterBtn(el, 'needs').click();
            await flush();
            expect(rowKeys(el)).toHaveLength(p.total - 2);
        });

        it('search filters on the English or the translation', async () => {
            const el = await mount(twoLangs());
            filterBtn(el, 'all').click();
            await flush();
            const search = sr(el).querySelector('[data-id="search"]');
            type(search, 'professional');
            await flush();
            expect(rowKeys(el)).toEqual(['el:q3.opt:pro']);
            type(search, 'votre');
            await flush();
            expect(rowKeys(el)).toEqual(['el:q1.label']);
        });

        it('uses a textarea for long English and lightning-input for short', async () => {
            const el = await mount(twoLangs());
            expect(
                sr(el).querySelector(
                    'lightning-textarea[data-key="el:q2.label"]'
                )
            ).not.toBeNull();
            expect(
                sr(el).querySelector(
                    'lightning-input[data-key="el:q3.opt:pro"]'
                )
            ).not.toBeNull();
        });

        it('rich rows use the rich text editor and show the English as plain text', async () => {
            const el = await mount(twoLangs());
            const rich = sr(el).querySelector(
                'lightning-input-rich-text[data-key="done.message"]'
            );
            expect(rich).not.toBeNull();
            const row = sr(el).querySelector('[data-row="done.message"]');
            expect(row.querySelector('.tr-src').textContent).toContain(
                'Thanks! We read it.'
            );
            expect(row.querySelector('.tr-src').textContent).not.toContain(
                '<b>'
            );
            expect(row.querySelector('.tr-rich').textContent).toBe(
                'Formatted text'
            );
        });
    });

    describe('editing', () => {
        it('commits on blur with the translation and the English fingerprint', async () => {
            const el = await mount(twoLangs());
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            const input = inputOf(el, 'el:q3.opt:pro');
            type(input, 'Professionnel');
            expect(seen).toHaveLength(0); // not per keystroke
            input.dispatchEvent(new CustomEvent('blur'));
            expect(seen).toHaveLength(1);
            expect(seen[0].translations.fr['el:q3.opt:pro']).toBe(
                'Professionnel'
            );
            expect(seen[0].translationSources.fr['el:q3.opt:pro']).toBe(
                textFingerprint('Professional')
            );
        });

        it('commits after a pause without a blur', async () => {
            const el = await mount(twoLangs());
            jest.useFakeTimers();
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            const input = inputOf(el, 'el:q3.opt:pro');
            type(input, 'Pro');
            jest.advanceTimersByTime(300);
            type(input, 'Professionnel');
            jest.advanceTimersByTime(300);
            expect(seen).toHaveLength(0);
            jest.advanceTimersByTime(300);
            expect(seen).toHaveLength(1);
            expect(seen[0].translations.fr['el:q3.opt:pro']).toBe(
                'Professionnel'
            );
        });

        it('does not emit when nothing changed', async () => {
            const el = await mount(twoLangs());
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            filterBtn(el, 'all').click();
            await flush();
            const input = inputOf(el, 'el:q1.label');
            type(input, 'Votre nom');
            input.dispatchEvent(new CustomEvent('blur'));
            expect(seen).toHaveLength(0);
        });

        it('clearing a translation removes it and its fingerprint', async () => {
            const el = await mount(twoLangs());
            filterBtn(el, 'all').click();
            await flush();
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            const input = inputOf(el, 'el:q1.label');
            type(input, '');
            input.dispatchEvent(new CustomEvent('blur'));
            expect(seen).toHaveLength(1);
            expect(seen[0].translations.fr['el:q1.label']).toBeUndefined();
            expect(
                seen[0].translationSources.fr['el:q1.label']
            ).toBeUndefined();
        });

        it('keeps a row on screen after it stops needing work', async () => {
            const el = await mount(twoLangs());
            const input = inputOf(el, 'el:q3.opt:pro');
            type(input, 'Professionnel');
            let emitted;
            el.addEventListener('specchange', (e) => (emitted = e.detail.spec));
            input.dispatchEvent(new CustomEvent('blur'));
            el.spec = emitted;
            await flush();
            expect(rowKeys(el)).toContain('el:q3.opt:pro');
            expect(pill(el, 'el:q3.opt:pro')).toBe('Done');
        });

        it('an emptied rich editor counts as cleared', async () => {
            const spec = setTranslation(
                twoLangs(),
                'fr',
                'done.message',
                '<p>Merci</p>'
            );
            const el = await mount(spec);
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            filterBtn(el, 'all').click();
            await flush();
            const rich = inputOf(el, 'done.message');
            type(rich, '<p><br></p>');
            rich.dispatchEvent(new CustomEvent('blur'));
            expect(seen[0].translations.fr['done.message']).toBeUndefined();
        });

        it('shows Check when the English changed, and Still correct re-stamps it', async () => {
            const spec = twoLangs();
            spec.header.title = 'Customer feedback';
            const el = await mount(spec);
            expect(pill(el, 'header.title')).toBe('Check');
            expect(
                sr(el).querySelector('[data-row="header.title"] .tr-was')
                    .textContent
            ).toContain('English changed since this was translated');
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            sr(el).querySelector('.tr-still[data-key="header.title"]').click();
            expect(seen).toHaveLength(1);
            expect(seen[0].translations.fr['header.title']).toBe(
                'Enquête client'
            );
            expect(seen[0].translationSources.fr['header.title']).toBe(
                textFingerprint('Customer feedback')
            );
        });
    });

    describe('adding and removing a language', () => {
        it('offers only org languages not yet added, and adds the pick', async () => {
            const el = await mount(twoLangs());
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            sr(el).querySelector('[data-id="add-language"]').click();
            await flush();
            const combo = sr(el).querySelector('lightning-combobox');
            expect(combo.options.map((o) => o.value)).toEqual(['es']);
            combo.dispatchEvent(
                new CustomEvent('change', { detail: { value: 'es' } })
            );
            await flush();
            expect(seen).toHaveLength(1);
            expect(seen[0].languages.available).toEqual([
                'en_US',
                'fr',
                'de',
                'es'
            ]);
            el.spec = seen[0];
            await flush();
            expect(sr(el).querySelector('.tr-title').textContent).toBe(
                'Spanish'
            );
        });

        it('removes a language only after the inline confirm', async () => {
            const spec = twoLangs();
            const el = await mount(spec);
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            sr(el).querySelector('.tr-remove').click();
            await flush();
            const ask = sr(el).querySelector('[role="alertdialog"]');
            expect(ask.textContent).toContain(
                'Remove French and its 2 translations?'
            );
            expect(seen).toHaveLength(0);
            sr(el).querySelector('.tr-ask-cancel').click();
            await flush();
            expect(sr(el).querySelector('[role="alertdialog"]')).toBeNull();
            expect(seen).toHaveLength(0);

            sr(el).querySelector('.tr-remove').click();
            await flush();
            sr(el).querySelector('.tr-ask-confirm').click();
            await flush();
            expect(seen).toHaveLength(1);
            expect(seen[0].languages.available).toEqual(['en_US', 'de']);
            expect(seen[0].translations.fr).toBeUndefined();
        });

        it('Escape closes the confirm without removing', async () => {
            const el = await mount(twoLangs());
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            sr(el).querySelector('.tr-remove').click();
            await flush();
            sr(el)
                .querySelector('[role="alertdialog"]')
                .dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'Escape',
                        bubbles: true
                    })
                );
            await flush();
            expect(sr(el).querySelector('[role="alertdialog"]')).toBeNull();
            expect(seen).toHaveLength(0);
        });
    });

    describe('empty states', () => {
        it('with no other language, explains and offers Add a language', async () => {
            const el = await mount(baseSpec());
            const lead = sr(el).querySelector('[data-id="no-languages"]');
            expect(lead.textContent).toContain('Add a language');
            expect(sr(el).querySelector('.tr-grid')).toBeNull();
            sr(el).querySelector('[data-id="add-language-lead"]').click();
            await flush();
            expect(sr(el).querySelector('lightning-combobox')).not.toBeNull();
        });

        it('says nothing needs work when the filter is empty', async () => {
            const el = await mount(twoLangs());
            filterBtn(el, 'done').click();
            await flush();
            type(sr(el).querySelector('[data-id="search"]'), 'zzzz');
            await flush();
            expect(
                sr(el).querySelector('[data-id="no-rows"]').textContent
            ).toContain('No texts match');
            type(sr(el).querySelector('[data-id="search"]'), '');
            sr(el).querySelector('button.tr-lang[data-code="de"]').click();
            await flush();
            filterBtn(el, 'done').click();
            await flush();
            expect(
                sr(el).querySelector('[data-id="no-rows"]').textContent.trim()
            ).toBe('Nothing is done in German yet.');
        });

        it('names the language when nothing needs work', async () => {
            let spec = addLanguage(baseSpec(), 'fr');
            const probe = await mount(spec);
            filterBtn(probe, 'all').click();
            await flush();
            rowKeys(probe).forEach((k) => {
                spec = setTranslation(spec, 'fr', k, 'x');
            });
            const el = await mount(spec);
            filterBtn(el, 'needs').click();
            await flush();
            expect(
                sr(el).querySelector('[data-id="no-rows"]').textContent.trim()
            ).toBe('Nothing needs work in French.');
        });
    });
    describe('the language menu switch', () => {
        const toggleOf = (el) =>
            sr(el).querySelector('lightning-input.tr-switcher-toggle');

        it('is hidden until a language other than the default exists', async () => {
            const el = await mount(baseSpec());
            expect(toggleOf(el)).toBeNull();
        });

        it('shows on by default with a hint naming the languages', async () => {
            const el = await mount(twoLangs());
            expect(toggleOf(el)).not.toBeNull();
            expect(toggleOf(el).label).toBe('Show a language menu on the form');
            expect(toggleOf(el).checked).toBe(true);
            expect(sr(el).querySelector('.tr-switcher-hint').textContent).toBe(
                'Respondents can switch between English, French, German.'
            );
        });

        it('turning it off, then on, emits showSwitcher false then true', async () => {
            const el = await mount(twoLangs());
            const seen = [];
            el.addEventListener('specchange', (e) => seen.push(e.detail.spec));
            toggleOf(el).dispatchEvent(
                new CustomEvent('change', { detail: { checked: false } })
            );
            expect(seen[0].languages.showSwitcher).toBe(false);
            expect(seen[0].languages.available).toEqual(['en_US', 'fr', 'de']);

            el.spec = seen[0];
            await flush();
            expect(toggleOf(el).checked).toBe(false);
            toggleOf(el).dispatchEvent(
                new CustomEvent('change', { detail: { checked: true } })
            );
            expect(seen[1].languages.showSwitcher).toBe(true);
        });
    });
});
