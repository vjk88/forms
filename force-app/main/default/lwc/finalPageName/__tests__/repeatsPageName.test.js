import { repeatsPageName } from 'c/finalPageName';

/**
 * The section name shown twice (owner 2026-10-11/16, DEFERRED 37; plan:
 * docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md). The rule, one page at a time.
 * The viewer's own tests (finalFormViewer/__tests__/sectionTitleRepeat.test.js)
 * cover which layouts name their pages and what reaches the navigation.
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

    it.each([
        '',
        '   ',
        undefined,
        'Page 2',
        'page 12',
        'Step 2',
        'Part 3',
        'Section 1',
        '2'
    ])(
        'never without a real page name: %j is no name, so the title is the only one',
        (name) => {
            expect(repeatsPageName(page(name, [sec()]))).toBe(false);
        }
    );

    it('a name that merely starts with such a word is a real name', () => {
        expect(repeatsPageName(page('Page break', [sec()]))).toBe(true);
        expect(repeatsPageName(page('Step by step', [sec()]))).toBe(true);
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
