import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

// IMPL_PLAN_TEXT_CONTRAST PR A (PR 408 review): an unpicked star or heart is
// drawn as an outline; a thumb emoji paints its own colours, so it is marked
// to go grey instead (finalElementRenderer.css .emoji-glyph).

const mount = (config) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = { id: 'r1', type: 'rating', label: 'Rate', config };
    document.body.appendChild(el);
    return el;
};
const icons = (el) => [...el.shadowRoot.querySelectorAll('.scale-icon')];

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('rating idle glyphs', () => {
    it('thumbs carry emoji-glyph', () => {
        const row = icons(mount({ icon: 'thumb' }));
        expect(row).toHaveLength(5);
        row.forEach((i) =>
            expect(i.classList.contains('emoji-glyph')).toBe(true)
        );
    });

    it.each([{}, { icon: 'star' }, { icon: 'heart' }])(
        'text glyphs (%o) do not',
        (config) => {
            icons(mount(config)).forEach((i) =>
                expect(i.classList.contains('emoji-glyph')).toBe(false)
            );
        }
    );
});
