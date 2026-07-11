import { createElement } from 'lwc';
import FinalPageFrame from 'c/finalPageFrame';

function mount(props = {}) {
    const el = createElement('c-final-page-frame', { is: FinalPageFrame });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el.shadowRoot.querySelector('.page');
}

// The embedded surface is tri-state: undefined auto-detects from the URL
// (jsdom's path is never /lightning/, so auto = NOT embedded here); previews
// FORCE true so page corner rounding + viewport-fill render regardless of
// where the studio is hosted (the /apex/FinalStudio host broke the sniff).
describe('c-final-page-frame embedded surface', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('auto (undefined): not embedded outside /lightning/', () => {
        const page = mount({});
        expect(page.classList.contains('page--embedded')).toBe(false);
    });

    it('forced true: embedded treatments apply on any host', () => {
        const page = mount({ embedded: true });
        expect(page.classList.contains('page--embedded')).toBe(true);
    });

    it('forced false: never embedded', () => {
        const page = mount({ embedded: false });
        expect(page.classList.contains('page--embedded')).toBe(false);
    });

    it('forced embed composes with bleed', () => {
        const page = mount({ embedded: true, bleed: true });
        expect(page.classList.contains('page--embedded')).toBe(true);
        expect(page.classList.contains('page--bleed')).toBe(true);
    });
});
