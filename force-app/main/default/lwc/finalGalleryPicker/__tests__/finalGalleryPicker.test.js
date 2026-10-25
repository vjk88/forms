import { createElement } from 'lwc';
import FinalGalleryPicker from 'c/finalGalleryPicker';

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-gallery-picker', {
        is: FinalGalleryPicker
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-gallery-picker', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('theme mode: builtin gallery previews in the current layout; custom themes get cards', async () => {
        const el = mount({
            mode: 'theme',
            layout: 'splitHero',
            paneFlow: 'oneAtATime',
            themeValue: 'custom:a0A1',
            customThemes: [
                { id: 'a0A1', name: 'Brand Purple', baseTheme: 'nordic' },
                { id: 'a0A2', name: 'Other', baseTheme: 'terracotta' }
            ]
        });
        await flush();
        const gallery = el.shadowRoot.querySelector('c-final-theme-gallery');
        expect(gallery).not.toBeNull();
        expect(gallery.layout).toBe('splitHero');
        expect(gallery.paneFlow).toBe('oneAtATime');
        // current theme is custom → no builtin reads as selected
        expect(gallery.selectedThemeKey).toBe('');
        const cards = el.shadowRoot.querySelectorAll('c-final-theme-card');
        expect(cards.length).toBe(2);
        expect(cards[0].themeKey).toBe('nordic'); // base-theme tint
        expect(cards[0].label).toBe('Brand Purple');
        expect(cards[0].selected).toBe(true);
        expect(cards[1].selected).toBe(false);
        expect(el.shadowRoot.querySelector('c-final-layout-card')).toBeNull();
    });

    it('builtin pick re-emits themepick with the raw key', async () => {
        const el = mount({ mode: 'theme', layout: 'scroll' });
        const handler = jest.fn();
        el.addEventListener('themepick', handler);
        el.shadowRoot.querySelector('c-final-theme-gallery').dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: 'editorialIvory' }
            })
        );
        expect(handler.mock.calls[0][0].detail).toEqual({
            value: 'editorialIvory'
        });
    });

    it('custom card pick emits themepick with the composite custom:<id>', async () => {
        const el = mount({
            mode: 'theme',
            customThemes: [{ id: 'a0A1', name: 'Brand', baseTheme: 'nordic' }]
        });
        await flush();
        const handler = jest.fn();
        el.addEventListener('themepick', handler);
        el.shadowRoot
            .querySelector('c-final-theme-card')
            .dispatchEvent(new CustomEvent('select', { detail: {} }));
        expect(handler.mock.calls[0][0].detail).toEqual({
            value: 'custom:a0A1'
        });
    });

    it('layout mode: the grouped roster renders 8 cards, current one selected', async () => {
        const el = mount({
            mode: 'layout',
            layout: 'splitHero',
            paneFlow: 'oneAtATime'
        });
        await flush();
        const cards = [
            ...el.shadowRoot.querySelectorAll('c-final-layout-card')
        ];
        expect(cards.length).toBe(8);
        const selected = cards.filter((c) => c.selected);
        expect(selected.length).toBe(1);
        expect(selected[0].layout).toBe('splitHero');
        expect(selected[0].paneFlow).toBe('oneAtATime');
        expect(el.shadowRoot.querySelector('c-final-theme-gallery')).toBeNull();
    });

    it('layout card pick re-emits layoutpick { layout, paneFlow }', async () => {
        const el = mount({ mode: 'layout', layout: 'scroll' });
        const handler = jest.fn();
        el.addEventListener('layoutpick', handler);
        el.shadowRoot.querySelector('c-final-layout-card').dispatchEvent(
            new CustomEvent('select', {
                detail: { layout: 'stepper', paneFlow: undefined }
            })
        );
        expect(handler.mock.calls[0][0].detail).toEqual({
            layout: 'stepper',
            paneFlow: ''
        });
    });

    it('closes via X, scrim, and Escape', async () => {
        const el = mount({ mode: 'theme' });
        const handler = jest.fn();
        el.addEventListener('close', handler);
        el.shadowRoot.querySelector('lightning-button-icon').click();
        el.shadowRoot.querySelector('.gal-scrim').click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(handler).toHaveBeenCalledTimes(3);
        // teardown removes the document listener
        document.body.removeChild(el);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(handler).toHaveBeenCalledTimes(3);
    });
});

describe('c-final-gallery-picker: brand themes (B2)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('the theme step opens with "Create from your brand"', async () => {
        const el = mount({ mode: 'theme', themeValue: 'nordic' });
        await flush();
        const handler = jest.fn();
        el.addEventListener('brandcreate', handler);
        const brand = el.shadowRoot.querySelector('.gal-brand');
        expect(brand.textContent).toContain('Create from your brand');
        brand.click();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('custom themes preview their own recipe, not their base theme', async () => {
        const recipe = { palette: { accent: '#e11d48', pageBg: '#fef2f4' } };
        const el = mount({
            mode: 'theme',
            themeValue: 'nordic',
            customThemes: [
                {
                    id: 'a0A1',
                    name: 'Acme brand',
                    baseTheme: 'nordic',
                    themeJson: JSON.stringify(recipe)
                },
                {
                    id: 'a0A2',
                    name: 'Broken',
                    baseTheme: 'dracula',
                    themeJson: '{not json'
                }
            ]
        });
        await flush();
        const cards = [
            ...el.shadowRoot.querySelectorAll('c-final-theme-card[data-id]')
        ];
        expect(cards[0].themeProps).toEqual(recipe);
        // a broken recipe falls back to its base theme
        expect(cards[1].themeProps).toBeNull();
        expect(cards[1].themeKey).toBe('dracula');
        expect(el.shadowRoot.textContent).not.toContain(
            "Previewed on their base theme's palette"
        );
    });
});
