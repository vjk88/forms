import { LAYOUT_GROUPS } from 'c/finalLayoutCards';
import { listGalleryThemes } from 'c/finalThemeCatalog';
import { layoutCardName } from 'c/finalGalleryPicker';

// One shared card list (IMPL_PLAN_THEME_CATALOG_CUT P3).

const cards = LAYOUT_GROUPS.flatMap((g) => g.cards);

describe('finalLayoutCards', () => {
    it('has the 8 layout cards', () => {
        expect(cards.map((c) => c.name)).toEqual([
            'Scroll',
            'Stepper',
            'Split Hero',
            'Split Hero · Conversational',
            'Side Nav',
            'One at a Time',
            'Tabbed',
            'Accordion'
        ]);
    });

    it('tints every card with a distinct gallery theme', () => {
        const gallery = new Set(listGalleryThemes().map((t) => t.key));
        const tints = cards.map((c) => c.themeKey);
        tints.forEach((k) => expect(gallery.has(k)).toBe(true));
        expect(new Set(tints).size).toBe(tints.length);
    });

    it('is the list the Design panel picker names layouts from', () => {
        expect(layoutCardName('splitHero', 'oneAtATime')).toBe(
            'Split Hero · Conversational'
        );
        expect(layoutCardName('rail', '')).toBe('Side Nav');
    });
});
