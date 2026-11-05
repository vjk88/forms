import { createElement } from 'lwc';
import FinalLayoutCard from 'c/finalLayoutCard';

jest.mock(
    '@salesforce/resourceUrl/formThemeAssets',
    () => ({ default: '/resource/1/formThemeAssets' }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

// Design's Theme and layout cards draw the form's layout as a picture.
describe('c-final-layout-card picture mode', () => {
    it('is an image, not a button, and a click does nothing', async () => {
        const el = createElement('c-final-layout-card', {
            is: FinalLayoutCard
        });
        Object.assign(el, {
            layout: 'accordion',
            label: 'Accordion',
            picture: true,
            selected: true
        });
        const handler = jest.fn();
        el.addEventListener('select', handler);
        document.body.appendChild(el);
        await flush();
        const root = el.shadowRoot.querySelector('.lc');
        expect(root.getAttribute('role')).toBe('img');
        expect(root.hasAttribute('tabindex')).toBe(false);
        expect(root.hasAttribute('aria-pressed')).toBe(false);
        expect(root.getAttribute('aria-label')).toBe('Accordion');
        expect(el.shadowRoot.querySelector('.lc-check')).toBeNull();
        root.click();
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(handler).not.toHaveBeenCalled();
    });
});
