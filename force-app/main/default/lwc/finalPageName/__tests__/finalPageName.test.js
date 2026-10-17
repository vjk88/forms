import { isRealPageName } from 'c/finalPageName';

describe('isRealPageName', () => {
    it.each([
        'Details',
        'Contact',
        'More',
        'Page break',
        'Step by step',
        'Part of the deal',
        'About you',
        'Page 2 of the form'
    ])('"%s" is a name somebody chose', (name) => {
        expect(isRealPageName(name)).toBe(true);
    });

    it.each([
        '',
        '   ',
        undefined,
        null,
        '2',
        '12',
        'Page 2',
        'page 12',
        'Page2',
        'Page',
        'Step 3',
        'Part 1',
        'Section 1',
        'Screen 4',
        'Stage 2',
        'Tab 2',
        'Untitled',
        'untitled 2'
    ])('%j is a placeholder', (name) => {
        expect(isRealPageName(name)).toBe(false);
    });
});
