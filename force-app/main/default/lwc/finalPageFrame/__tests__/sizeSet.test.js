import { createElement } from 'lwc';
import FinalPageFrame from 'c/finalPageFrame';

function mount(props = {}) {
    const el = createElement('c-final-page-frame', { is: FinalPageFrame });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el.shadowRoot.querySelector('.page');
}

// The viewer picks the text-size set; the frame only publishes it as attributes
// the stylesheet keys on (the numbers live in finalPageFrame.css alone).
describe('c-final-page-frame size set', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('unset or standard: no attributes, so the Standard set is in force', () => {
        expect(mount({}).hasAttribute('data-size-set')).toBe(false);
        expect(
            mount({ sizeSet: 'standard' }).hasAttribute('data-size-set')
        ).toBe(false);
        expect(mount({}).hasAttribute('data-single')).toBe(false);
    });

    it('section at a time publishes data-size-set="section"', () => {
        expect(
            mount({ sizeSet: 'section' }).getAttribute('data-size-set')
        ).toBe('section');
    });

    it('a one-question-per-page form publishes data-single', () => {
        expect(mount({ single: true }).hasAttribute('data-single')).toBe(true);
    });

    it('an unknown set is ignored rather than invented', () => {
        expect(mount({ sizeSet: 'huge' }).hasAttribute('data-size-set')).toBe(
            false
        );
    });
});
