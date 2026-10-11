import { createElement } from 'lwc';
import FinalSectionRenderer from 'c/finalSectionRenderer';

// Stage 3 / S1 (docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md): the Studio's
// section Padding choice is written as an INLINE style, which outranks any
// stylesheet rule. So the narrow-form cap (--c-pad-cap, 12px on a phone, unset
// everywhere else) has to live inside the value itself.
const CAP = 'var(--c-pad-cap, 9999px)';

function styleFor(surface) {
    const el = createElement('c-final-section-renderer', {
        is: FinalSectionRenderer
    });
    el.section = {
        id: 's1',
        title: 'Pad',
        style: 'card',
        surface,
        elements: []
    };
    document.body.appendChild(el);
    return el.shadowRoot.querySelector('.section').getAttribute('style') || '';
}

describe('c-final-section-renderer authored padding', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it.each([
        ['sm', 'var(--c-space-3)'],
        ['md', 'var(--c-section-pad)'],
        ['lg', 'var(--c-space-6)']
    ])('%s is its size, capped on a phone', (choice, size) => {
        expect(styleFor({ padding: choice })).toContain(
            `padding: min(${size}, ${CAP})`
        );
    });

    it('none stays zero (a cap can only shrink a padding, never grow it)', () => {
        expect(styleFor({ padding: 'none' })).toContain('padding: 0');
        expect(styleFor({ padding: 'none' })).not.toContain('--c-pad-cap');
    });

    it('no padding choice writes no padding at all (the section look decides)', () => {
        expect(styleFor({})).not.toContain('padding');
    });
});
