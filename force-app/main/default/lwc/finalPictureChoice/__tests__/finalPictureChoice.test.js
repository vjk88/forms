import { createElement } from 'lwc';
import FinalPictureChoice from 'c/finalPictureChoice';

const OPTIONS = [
    {
        value: 'default',
        label: 'Text box',
        desc: 'A plain box.',
        art: 'select',
        wide: true
    },
    { value: 'dropdown', label: 'Dropdown', art: 'select' },
    { value: 'radio', label: 'Radio list', art: 'radio' },
    { value: 'chips', label: 'Chips', art: 'chips' },
    { value: 'cards', label: 'Cards', art: 'cards' }
];

function mount(props = {}) {
    const el = createElement('c-final-picture-choice', {
        is: FinalPictureChoice
    });
    Object.assign(el, {
        label: 'Appearance',
        options: OPTIONS,
        value: 'radio',
        ...props
    });
    document.body.appendChild(el);
    return el;
}

const tiles = (el) => [...el.shadowRoot.querySelectorAll('.pc-tile')];
const group = (el) => el.shadowRoot.querySelector('.pc');
const key = (el, k) =>
    group(el).dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true })
    );

describe('c-final-picture-choice', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('is one named radio group: the wide tile first, then the grid', () => {
        const el = mount();
        expect(group(el).getAttribute('role')).toBe('radiogroup');
        expect(group(el).getAttribute('aria-label')).toBe('Appearance');
        expect(tiles(el).map((t) => t.dataset.value)).toEqual([
            'default',
            'dropdown',
            'radio',
            'chips',
            'cards'
        ]);
        expect(tiles(el)[0].classList.contains('pc-wide')).toBe(true);
        expect(tiles(el)[0].querySelector('.pc-desc').textContent).toBe(
            'A plain box.'
        );
    });

    it('checks the chosen tile and gives only it the tab stop', () => {
        const el = mount();
        expect(tiles(el).map((t) => t.getAttribute('aria-checked'))).toEqual([
            'false',
            'false',
            'true',
            'false',
            'false'
        ]);
        expect(tiles(el).map((t) => t.getAttribute('tabindex'))).toEqual([
            '-1',
            '-1',
            '0',
            '-1',
            '-1'
        ]);
    });

    it('draws each tile with its art', () => {
        const el = mount();
        const t = tiles(el);
        expect(t[1].querySelector('.pc-art-select')).not.toBeNull();
        expect(t[2].querySelector('.pc-art-list .pc-art-dot')).not.toBeNull();
        expect(t[3].querySelector('.pc-art-chips')).not.toBeNull();
        expect(t[4].querySelector('.pc-art-cards')).not.toBeNull();
    });

    it('a click fires change with the value', () => {
        const el = mount();
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail.value));
        tiles(el)[3].click();
        expect(seen).toEqual(['chips']);
    });

    it('arrow keys, Home and End move the choice, wrapping at the ends', () => {
        const el = mount();
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail.value));
        key(el, 'ArrowRight');
        key(el, 'ArrowUp');
        key(el, 'Home');
        key(el, 'End');
        key(el, 'a');
        expect(seen).toEqual(['chips', 'dropdown', 'default', 'cards']);
    });

    it('focus follows the choice once the parent passes the new value back', async () => {
        const el = mount();
        el.addEventListener('change', (e) => {
            el.value = e.detail.value;
        });
        key(el, 'ArrowRight');
        await Promise.resolve();
        expect(el.shadowRoot.activeElement).toBe(tiles(el)[3]);
    });
});
