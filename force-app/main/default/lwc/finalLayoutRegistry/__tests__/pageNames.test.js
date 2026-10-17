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
