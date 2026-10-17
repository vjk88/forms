import { createElement } from 'lwc';
import FinalNavScroll from 'c/finalNavScroll';
import {
    LAYOUTS,
    getLayout,
    isOnePerScreen,
    layoutNamesPages
} from 'c/finalLayoutRegistry';

/**
 * Which layouts show each page's NAME on screen, and WHEN (owner 2026-10-11/16:
 * "why are we displaying the section name again when the tab or accordion or
 * stepper already shows it"; docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md).
 *
 * layoutNamesPages answers with one of three words:
 *   'always'  the name is on screen at every width (a tab, an accordion panel
 *             title, a scroll divider, the rail's own Pages button)
 *   'wide'    the name is on screen only while the navigation has room: the side
 *             rail collapses to numbered chips and the wizard strip to dots or a
 *             bar on a phone (a container 540px wide or narrower)
 *   false     no page name on screen (One at a time, Split hero, a wizard strip
 *             set to dots or a progress bar)
 */
describe('layoutNamesPages', () => {
    it.each(['tabs', 'accordion'])('%s always names its pages', (type) => {
        expect(layoutNamesPages(type, {}, 1)).toBe('always');
        expect(layoutNamesPages(type, undefined, 3)).toBe('always');
    });

    it('the side rail names its pages while wide; as a menu (drawer) its Pages button names the current page at every width', () => {
        expect(layoutNamesPages('rail', {}, 2)).toBe('wide');
        expect(layoutNamesPages('rail', undefined, 2)).toBe('wide');
        expect(layoutNamesPages('rail', { narrowBehavior: 'topBar' }, 2)).toBe(
            'wide'
        );
        expect(layoutNamesPages('rail', { narrowBehavior: 'drawer' }, 2)).toBe(
            'always'
        );
    });

    it('wizard steps name their pages while wide, and never when the strip is set to dots or a progress bar', () => {
        expect(layoutNamesPages('stepper', {}, 3)).toBe('wide');
        expect(layoutNamesPages('stepper', { mode: 'numbered' }, 3)).toBe(
            'wide'
        );
        expect(layoutNamesPages('stepper', { mode: 'dots' }, 3)).toBe(false);
        expect(layoutNamesPages('stepper', { mode: 'progressBar' }, 3)).toBe(
            false
        );
    });

    it.each(['oneAtATime', 'splitHero'])('%s never does', (type) => {
        expect(layoutNamesPages(type, { showDividers: true }, 3)).toBe(false);
    });

    it('scroll names its pages only with the dividers option on and more than one page', () => {
        expect(layoutNamesPages('scroll', { showDividers: true }, 3)).toBe(
            'always'
        );
        expect(layoutNamesPages('scroll', { showDividers: true }, 1)).toBe(
            false
        );
        expect(layoutNamesPages('scroll', { showDividers: false }, 3)).toBe(
            false
        );
        expect(layoutNamesPages('scroll', {}, 3)).toBe(false);
        expect(layoutNamesPages('scroll', undefined, 3)).toBe(false);
    });

    it('an unknown or missing layout type behaves as scroll, like getLayout does', () => {
        expect(layoutNamesPages(undefined, { showDividers: true }, 2)).toBe(
            'always'
        );
        expect(layoutNamesPages('nope', {}, 2)).toBe(false);
        expect(getLayout('nope')).toBe(getLayout('scroll'));
    });
});

describe('what to call the thing that names the pages (the Studio tells the author)', () => {
    it.each([
        ['scroll', 'page divider'],
        ['stepper', 'step bar'],
        ['tabs', 'tab'],
        ['accordion', 'panel title'],
        ['rail', 'side rail']
    ])('%s is "%s"', (type, by) => {
        expect(getLayout(type).pageNameBy).toBe(by);
    });

    it('every layout that can name its pages has a name for what does it', () => {
        const namers = Object.values(LAYOUTS).filter((row) => row.pageNames);
        expect(namers).toHaveLength(5);
        expect(namers.filter((row) => !row.pageNameBy)).toEqual([]);
    });

    it('a layout that names no page has nothing to point at', () => {
        const silent = Object.entries(LAYOUTS).filter(
            ([, row]) => !row.pageNames
        );
        expect(silent.map(([type]) => type).sort()).toEqual([
            'oneAtATime',
            'splitHero'
        ]);
        expect(
            silent.map(([type]) =>
                layoutNamesPages(type, { showDividers: true }, 3)
            )
        ).toEqual([false, false]);
    });
});

describe('isOnePerScreen: the viewer and the Studio split pages the same way', () => {
    const survey = (type, onePerScreen) => ({
        form: { type: 'survey' },
        settings: { onePerScreen },
        layout: { type }
    });

    it('a survey with the Paging option on, in a layout that pages', () => {
        expect(isOnePerScreen(survey('stepper', true))).toBe(true);
        expect(isOnePerScreen(survey('oneAtATime', true))).toBe(true);
    });

    it('not when scroll (no paging to ride), the option is off, or it is a plain form', () => {
        expect(isOnePerScreen(survey('scroll', true))).toBe(false);
        expect(isOnePerScreen(survey('stepper', false))).toBe(false);
        expect(
            isOnePerScreen({
                form: { type: 'form' },
                settings: { onePerScreen: true },
                layout: { type: 'stepper' }
            })
        ).toBe(false);
    });

    it('tolerates a half-built spec', () => {
        expect(isOnePerScreen(undefined)).toBe(false);
        expect(isOnePerScreen({})).toBe(false);
    });
});

// The viewer decides from layoutNamesPages whether a section title would repeat a
// page name; Scroll draws its own dividers. Two places must never disagree.
describe('layoutNamesPages agrees with what Scroll actually draws', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a divider is on screen exactly when the registry says the pages are named', () => {
        for (const count of [1, 2, 3]) {
            for (const options of [
                undefined,
                {},
                { showDividers: false },
                { showDividers: true }
            ]) {
                const el = createElement('c-final-nav-scroll', {
                    is: FinalNavScroll
                });
                el.pages = Array.from({ length: count }, (_, i) => ({
                    id: 'pg_' + i,
                    name: 'Page name ' + i,
                    sections: []
                }));
                el.options = options;
                document.body.appendChild(el);
                const drawn =
                    el.shadowRoot.querySelector('h2.divider') !== null;
                expect(drawn).toBe(
                    Boolean(layoutNamesPages('scroll', options, count))
                );
                el.remove();
            }
        }
    });
});
