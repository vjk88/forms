import { createElement } from 'lwc';
import FinalColorControl from 'c/finalColorControl';
import { ACCENT_PRESETS } from 'c/finalDesignRegistry';

// Accent preset swatches (IMPL_PLAN_THEME_CATALOG_CUT P5).

const flush = () => Promise.resolve();
const DRACULA_CARD = '#282a36';

function mount(props) {
    const el = createElement('c-final-color-control', {
        is: FinalColorControl
    });
    Object.assign(el, {
        label: 'Accent',
        value: '#1e3a8a',
        presets: ACCENT_PRESETS,
        ...props
    });
    document.body.appendChild(el);
    return el;
}

const radios = (el) =>
    Array.from(el.shadowRoot.querySelectorAll('button[role="radio"]'));
const byName = (el, name) =>
    radios(el).find((b) => b.getAttribute('aria-label') === name);

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('finalColorControl presets', () => {
    it('renders no swatch row without presets', () => {
        const el = mount({ presets: undefined });
        expect(el.shadowRoot.querySelector('[role="radiogroup"]')).toBeNull();
    });

    it('renders all 15 swatches as one radiogroup, the current color checked', () => {
        const el = mount();
        const group = el.shadowRoot.querySelector('[role="radiogroup"]');
        expect(group.getAttribute('aria-label')).toBe('Accent presets');
        expect(radios(el)).toHaveLength(15);
        expect(byName(el, 'Navy').getAttribute('aria-checked')).toBe('true');
        expect(byName(el, 'Blue').getAttribute('aria-checked')).toBe('false');
    });

    it('has exactly one tab stop (roving tabindex)', () => {
        const el = mount();
        const stops = radios(el).filter(
            (b) => b.getAttribute('tabindex') === '0'
        );
        expect(stops).toHaveLength(1);
        expect(stops[0].getAttribute('aria-label')).toBe('Navy');
    });

    it('dims the 7 swatches under 3:1 on Dracula Dark and keeps them focusable', () => {
        const el = mount({ presetBackground: DRACULA_CARD });
        const off = radios(el)
            .filter((b) => b.getAttribute('aria-disabled') === 'true')
            .map((b) => b.getAttribute('aria-label'));
        expect(off).toEqual([
            'Navy',
            'Indigo',
            'Purple',
            'Teal',
            'Forest',
            'Terracotta',
            'Graphite'
        ]);
        // dimmed ≠ disabled: still a button that can take focus
        expect(byName(el, 'Navy').disabled).toBe(false);
    });

    it('clicking a usable swatch emits presetpick with its color', async () => {
        const el = mount({ presetBackground: '#ffffff' });
        const handler = jest.fn();
        el.addEventListener('presetpick', handler);
        byName(el, 'Pink').click();
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({ value: '#db2777' });
    });

    it('clicking or tapping a dimmed swatch explains instead of applying', async () => {
        const el = mount({ presetBackground: DRACULA_CARD });
        const handler = jest.fn();
        el.addEventListener('presetpick', handler);
        byName(el, 'Navy').click();
        await flush();
        expect(handler).not.toHaveBeenCalled();
        const note = el.shadowRoot.querySelector('.swatch-note');
        expect(note.textContent).toMatch(/Navy is too faint on this theme/);
    });

    it('keyboard focus on a dimmed swatch shows its reason', async () => {
        const el = mount({ presetBackground: DRACULA_CARD });
        byName(el, 'Forest').dispatchEvent(new CustomEvent('focus'));
        await flush();
        expect(el.shadowRoot.querySelector('.swatch-note').textContent).toMatch(
            /Forest is too faint/
        );
        // and the reason is wired as the swatch's description
        const forest = byName(el, 'Forest');
        expect(forest.getAttribute('aria-describedby')).toBeTruthy();
    });

    it('arrow keys move focus without applying; Enter applies', async () => {
        const el = mount({ presetBackground: '#ffffff' });
        const handler = jest.fn();
        el.addEventListener('presetpick', handler);
        const group = el.shadowRoot.querySelector('[role="radiogroup"]');
        byName(el, 'Navy').dispatchEvent(new CustomEvent('focus'));
        group.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
        );
        await flush();
        expect(handler).not.toHaveBeenCalled();
        expect(byName(el, 'Blue').getAttribute('tabindex')).toBe('0');
        group.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe('#3b82f6');
    });
});
