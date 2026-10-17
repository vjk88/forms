import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import { repeatsPageName } from '../sectionTitleRepeat';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

/**
 * The section name shown twice (owner 2026-10-11/16, DEFERRED 37; plan:
 * docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md).
 *
 * Side rail, Tabs, Wizard steps and Accordion name every page in the navigation
 * ("1 Details"), and then the section card under it said "Details" (or "Contact
 * details") again. Measured on the 60 form versions in the dev org: a page has
 * exactly one titled section in 65 cases, the title is the page name in 1 and a
 * different phrase in 64 (the starter is page "Details" + section
 * "<Object> details"), so the rule cannot wait for an exact match.
 *
 * THE RULE: in a layout that names its pages, a page with ONE section does not
 * show that section's title as a second heading. The page name in the navigation
 * is the heading. It is hidden visually, not removed (screen readers keep it).
 * Not applied when it would lose something: the page has no real name (the
 * navigation says "Page 2"), the header carries a description or an icon, the
 * section folds, or the author switched the header on by hand.
 */
const page = (name, sections) => ({ id: 'pg', name, sections });
const sec = (extra = {}) => ({
    id: 's1',
    title: 'Contact details',
    elements: [],
    ...extra
});

describe('repeatsPageName (the rule, one page at a time)', () => {
    it('hides the title of a lone section when the page has a real name, whatever the title says', () => {
        expect(repeatsPageName(page('Details', [sec()]))).toBe(true);
        expect(
            repeatsPageName(page('Details', [sec({ title: 'Details' })]))
        ).toBe(true);
        expect(repeatsPageName(page('More', [sec({ title: 'Address' })]))).toBe(
            true
        );
    });

    it('never when the page has several sections: their titles tell them apart', () => {
        expect(
            repeatsPageName(page('Details', [sec(), sec({ id: 's2' })]))
        ).toBe(false);
    });

    it('never without a real page name: the navigation says "Page N", so the title is the only name', () => {
        expect(repeatsPageName(page('', [sec()]))).toBe(false);
        expect(repeatsPageName(page(undefined, [sec()]))).toBe(false);
        expect(repeatsPageName(page('   ', [sec()]))).toBe(false);
        expect(repeatsPageName(page('Page 2', [sec()]))).toBe(false);
        expect(repeatsPageName(page('page 12', [sec()]))).toBe(false);
        // "Page" followed by words is a real name
        expect(repeatsPageName(page('Page break', [sec()]))).toBe(true);
    });

    it('never when hiding the title would lose something', () => {
        expect(
            repeatsPageName(page('Details', [sec({ description: 'Why' })]))
        ).toBe(false);
        expect(
            repeatsPageName(page('Details', [sec({ icon: 'utility:user' })]))
        ).toBe(false);
        expect(
            repeatsPageName(page('Details', [sec({ collapsible: true })]))
        ).toBe(false);
        expect(
            repeatsPageName(page('Details', [sec({ repeat: { min: 1 } })]))
        ).toBe(false);
    });

    it('respects the author: an untitled section has nothing to hide, a hidden header is already hidden, and a header switched ON by hand stays', () => {
        expect(repeatsPageName(page('Details', [sec({ title: '' })]))).toBe(
            false
        );
        expect(
            repeatsPageName(page('Details', [sec({ showHeader: false })]))
        ).toBe(false);
        expect(
            repeatsPageName(page('Details', [sec({ showHeader: true })]))
        ).toBe(false);
    });
});

const el = (id) => ({
    id,
    type: 'field',
    label: id,
    render: { inputType: 'text' }
});

const SPEC = (layoutType, options, onePerScreen) => ({
    specVersion: 1,
    form: { name: 'S', type: onePerScreen ? 'survey' : 'form' },
    layout: { type: layoutType, options },
    header: { style: 'none' },
    theme: null,
    submit: { label: 'Send' },
    settings: { onePerScreen: Boolean(onePerScreen) },
    pages: [
        {
            id: 'pg_1',
            name: 'Details',
            sections: [
                {
                    id: 'sec_1',
                    title: 'Contact details',
                    style: 'card',
                    columns: 1,
                    elements: [el('el_a')]
                }
            ]
        },
        {
            id: 'pg_2',
            name: 'Preferences',
            sections: [
                {
                    id: 'sec_2',
                    title: 'Mail',
                    style: 'card',
                    columns: 1,
                    elements: [el('el_b')]
                },
                {
                    id: 'sec_3',
                    title: 'Phone',
                    style: 'card',
                    columns: 1,
                    elements: [el('el_c')]
                }
            ]
        }
    ]
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(spec) {
    const cmp = createElement('c-final-form-viewer', { is: FinalFormViewer });
    cmp.spec = spec;
    document.body.appendChild(cmp);
    await flush();
    await flush();
    return cmp;
}

// the dynamic nav (lwc:is) mounts as x-test under sfdx-lwc-jest and still
// carries the real nav @api surface (pages etc.)
const pagesOf = (cmp) =>
    cmp.shadowRoot.querySelector('c-final-page-frame').querySelector('x-test')
        .pages;

describe('the viewer marks the repeats it hands to the layout', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it.each(['rail', 'tabs', 'stepper', 'accordion'])(
        '%s: the lone section is marked, the page with two sections is not',
        async (type) => {
            const pages = pagesOf(await mount(SPEC(type, {})));
            expect(pages[0].sections[0].titleRepeatsPage).toBe(true);
            expect(pages[1].sections[0].titleRepeatsPage).toBeFalsy();
            expect(pages[1].sections[1].titleRepeatsPage).toBeFalsy();
        }
    );

    it('scroll: marked only when the page dividers are on (and there is more than one page)', async () => {
        const withDividers = pagesOf(
            await mount(SPEC('scroll', { showDividers: true }))
        );
        expect(withDividers[0].sections[0].titleRepeatsPage).toBe(true);
        const without = pagesOf(await mount(SPEC('scroll', {})));
        expect(without[0].sections[0].titleRepeatsPage).toBeFalsy();
    });

    it.each(['oneAtATime', 'splitHero'])(
        '%s names no pages, so nothing is marked',
        async (type) => {
            const pages = pagesOf(await mount(SPEC(type, {})));
            expect(pages[0].sections[0].titleRepeatsPage).toBeFalsy();
        }
    );

    it('one question per screen (virtual pages) is left alone', async () => {
        const pages = pagesOf(await mount(SPEC('stepper', {}, true)));
        expect(pages.every((p) => !p.sections[0].titleRepeatsPage)).toBe(true);
    });
});
