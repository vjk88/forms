import { createElement } from 'lwc';
import FinalPageFrame from 'c/finalPageFrame';

function mount(props = {}) {
    const el = createElement('c-final-page-frame', { is: FinalPageFrame });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el.shadowRoot.querySelector('.panel').getAttribute('style');
}

// Max width routing (owner QA 2026-07-08): the carded panel takes the page
// scale; bleed layouts take the TIGHTER scale as --frame-max — and only on an
// EXPLICIT choice, so oneAtATime's 540px card / splitHero's 480px pane locked
// defaults survive an untouched control.
describe('c-final-page-frame width routing', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('carded panel: page scale with medium fallback', () => {
        expect(mount({})).toContain('max-width: 760px');
        expect(mount({ maxWidth: 'wide' })).toContain('max-width: 1040px');
        expect(mount({ maxWidth: 'full' })).toContain('max-width: none');
    });

    it('bleed: explicit choice emits --frame-max on the tighter scale', () => {
        expect(mount({ bleed: true, maxWidth: 'narrow' })).toContain(
            '--frame-max: 480px'
        );
        expect(mount({ bleed: true, maxWidth: 'wide' })).toContain(
            '--frame-max: 680px'
        );
        // 100% not none: the var feeds calc() in grid track sizing
        expect(mount({ bleed: true, maxWidth: 'full' })).toContain(
            '--frame-max: 100%'
        );
    });

    it('bleed: unset means NO var — the layout keeps its locked column', () => {
        const style = mount({ bleed: true, maxWidth: undefined });
        expect(style || '').not.toContain('--frame-max');
        expect(style || '').not.toContain('max-width');
    });
});
