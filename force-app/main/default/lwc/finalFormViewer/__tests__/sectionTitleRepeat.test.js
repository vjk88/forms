import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

/**
 * The section name shown twice (owner 2026-10-11/16, DEFERRED 37; plan:
 * docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md).
 *
 * Side rail, Tabs, Wizard steps and Accordion name every page in the navigation
 * ("1 Details"), and the one section card under it then said "Details" (or
 * "Contact details") again. Measured on the 60 form versions in the dev org: a
 * page has exactly one titled section in 65 cases, the title is the page name in
 * 1 and a different phrase in 64 (the starter is page "Details" + section
 * "<Object> details"), so the rule cannot wait for an exact match.
 *
 * THE RULE: in a layout that names its pages, a page with ONE section does not
 * show that section's title as a second heading. The page name in the navigation
 * is the heading. It is hidden visually, not removed (screen readers keep it),
 * and only where the name really is on screen: always for Tabs, Accordion and
 * Scroll dividers, and only while wide for the side rail and the wizard strip,
 * whose labels give way to chips and dots on a phone (UX review 2026-10-16).
 * Not applied when it would lose something: the page has no real name, the
 * header carries a description or an icon, the section folds, or the author
 * switched the header on by hand. Decided from the sections the author BUILT,
 * so a section that appears after an answer cannot make a title pop in.
 */
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

    it.each([
        ['tabs', {}, 'always'],
        ['accordion', {}, 'always'],
        ['rail', {}, 'wide'],
        ['rail', { narrowBehavior: 'drawer' }, 'always'],
        ['stepper', {}, 'wide'],
        ['scroll', { showDividers: true }, 'always']
    ])(
        '%s %j: the lone section is marked "%s", the page with two sections is not',
        async (type, options, mode) => {
            const pages = pagesOf(await mount(SPEC(type, options)));
            expect(pages[0].sections[0].titleRepeatsPage).toBe(mode);
            expect(pages[1].sections[0].titleRepeatsPage).toBeFalsy();
            expect(pages[1].sections[1].titleRepeatsPage).toBeFalsy();
        }
    );

    it.each([
        ['scroll', {}],
        ['scroll', { showDividers: false }],
        ['oneAtATime', {}],
        ['splitHero', {}],
        ['stepper', { mode: 'dots' }],
        ['stepper', { mode: 'progressBar' }]
    ])('%s %j names no page, so nothing is marked', async (type, options) => {
        const pages = pagesOf(await mount(SPEC(type, options)));
        expect(pages[0].sections[0].titleRepeatsPage).toBeFalsy();
    });

    it('one question per screen (virtual pages) is left alone', async () => {
        const pages = pagesOf(await mount(SPEC('stepper', {}, true)));
        expect(pages.every((p) => !p.sections[0].titleRepeatsPage)).toBe(true);
    });

    it('decided from the sections the author built: a second section that is hidden by a rule right now keeps the first title steady, so nothing pops in when it appears', async () => {
        const spec = SPEC('tabs', {});
        // page 1 gets a second section that a rule hides until "el_a" is answered
        spec.pages[0].sections.push({
            id: 'sec_late',
            title: 'Partner',
            style: 'card',
            columns: 1,
            visibility: {
                action: 'show',
                logic: 'all',
                rules: [{ source: 'el_a', operator: 'equals', value: 'Yes' }]
            },
            elements: [el('el_p')]
        });
        const pages = pagesOf(await mount(spec));
        expect(pages[0].sections).toHaveLength(1); // the rule hides "Partner" for now
        expect(pages[0].sections[0].titleRepeatsPage).toBeFalsy();
    });
});
