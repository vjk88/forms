import { createElement } from 'lwc';
import FinalNavScroll from 'c/finalNavScroll';
import { getLayout, layoutNamesPages } from 'c/finalLayoutRegistry';

/**
 * Which layouts already show each page's NAME on screen (owner 2026-10-11/16:
 * "why are we displaying the section name again when the tab or accordion or
 * stepper already shows it"; docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md).
 *
 *   Side rail, Tabbed pages, Wizard steps, Accordion  a nav item, tab, step or
 *                                                      panel title, always
 *   Continuous scroll                                  a divider heading, only
 *                                                      when the page-dividers
 *                                                      option is on AND there
 *                                                      is more than one page
 *   One at a time, Split hero                          no page name on screen
 */
describe('layoutNamesPages', () => {
    it.each(['rail', 'tabs', 'stepper', 'accordion'])(
        '%s always names its pages',
        (type) => {
            expect(layoutNamesPages(type, {}, 1)).toBe(true);
            expect(layoutNamesPages(type, undefined, 3)).toBe(true);
        }
    );

    it.each(['oneAtATime', 'splitHero'])('%s never does', (type) => {
        expect(layoutNamesPages(type, { showDividers: true }, 3)).toBe(false);
    });

    it('scroll names its pages only with the dividers option on and more than one page', () => {
        expect(layoutNamesPages('scroll', { showDividers: true }, 3)).toBe(
            true
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
            true
        );
        expect(layoutNamesPages('nope', {}, 2)).toBe(false);
        expect(getLayout('nope')).toBe(getLayout('scroll'));
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
                expect(drawn).toBe(layoutNamesPages('scroll', options, count));
                el.remove();
            }
        }
    });
});
