import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/** Slider hardening (external review of PR #186): native range control,
 *  step-aligned resting midpoint, string-prefill coercion, external-write
 *  precedence, honest untouched state, sanitized authored bounds. */

const SLIDER = (over = {}, cfgOver = {}) => ({
    id: 'sl1',
    type: 'field',
    label: 'Budget',
    config: {
        inputType: 'number',
        renderAs: 'Slider',
        slider: { min: 50, max: 400, step: 25 },
        valuePrefix: '$',
        leftLabel: 'Tight',
        rightLabel: 'No limit',
        ...cfgOver
    },
    ...over
});

const mount = (element) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
};

const range = (el) => el.shadowRoot.querySelector('input[type="range"]');
const readout = (el) => el.shadowRoot.querySelector('.slider-val');

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('slider', () => {
    it('renders a native range with formatted aria-valuetext and end-label semantics in the name', () => {
        const el = mount(SLIDER());
        const input = range(el);
        expect(input).not.toBeNull();
        expect(input.getAttribute('aria-valuetext')).toBe('$225');
        expect(input.getAttribute('aria-label')).toBe(
            'Budget, 50 = Tight to 400 = No limit'
        );
    });

    it('resting midpoint is step-aligned and the readout reads as untouched', () => {
        // 0..100 step 30 → raw midpoint 50 is off-step; snapped = 60
        const el = mount(
            SLIDER(
                {},
                { slider: { min: 0, max: 100, step: 30 }, valuePrefix: '' }
            )
        );
        expect(range(el).value).toBe('60');
        expect(readout(el).textContent.trim()).toBe('60');
        expect(readout(el).classList.contains('idle')).toBe(true);
    });

    it('coerces a string prefill ("150") instead of falling back to the midpoint', () => {
        const el = mount(SLIDER({ value: '150' }));
        expect(range(el).value).toBe('150');
        expect(readout(el).classList.contains('idle')).toBe(false);
    });

    it('change commits the number through valuechange and drops the idle state', async () => {
        const el = mount(SLIDER());
        const seen = [];
        el.addEventListener('valuechange', (e) => seen.push(e.detail));
        const input = range(el);
        input.value = '300';
        input.dispatchEvent(new CustomEvent('change'));
        await Promise.resolve();
        expect(seen).toEqual([{ elementId: 'sl1', value: 300 }]);
        expect(readout(el).classList.contains('idle')).toBe(false);
        expect(readout(el).textContent.trim()).toBe('$300');
    });

    it('an external el.value write beats the stale local echo', async () => {
        const el = mount(SLIDER());
        const input = range(el);
        input.value = '300';
        input.dispatchEvent(new CustomEvent('change'));
        await Promise.resolve();
        // host writes a DIFFERENT value back (prefill re-fetch / reset flow)
        el.element = SLIDER({ value: 125 });
        await Promise.resolve();
        expect(range(el).value).toBe('125');
        expect(readout(el).textContent.trim()).toBe('$125');
    });

    it('sanitizes broken authored bounds (min ≥ max, step ≤ 0) into a working control', () => {
        const el = mount(
            SLIDER(
                {},
                { slider: { min: 100, max: 0, step: 0 }, valuePrefix: '' }
            )
        );
        const input = range(el);
        expect(Number(input.max)).toBeGreaterThan(Number(input.min));
        expect(Number(input.step)).toBeGreaterThan(0);
    });
});
