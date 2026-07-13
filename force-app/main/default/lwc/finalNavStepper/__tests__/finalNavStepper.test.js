import { createElement } from 'lwc';
import FinalNavStepper, { computeFitTier } from 'c/finalNavStepper';

const PAGES = [
    { id: 'p1', name: 'One', sections: [] },
    { id: 'p2', name: 'Two', sections: [] },
    { id: 'p3', name: 'Three', sections: [] }
];

function mount(options) {
    const el = createElement('c-final-nav-stepper', { is: FinalNavStepper });
    el.pages = PAGES;
    el.pageValidity = [true, false, false];
    el.options = options;
    document.body.appendChild(el);
    return el;
}

describe('c-final-nav-stepper', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('defaults: numbered list, dots as the narrow collapse, no bar markup', () => {
        const el = mount(undefined);
        const steps = el.shadowRoot.querySelector('.steps');
        expect(steps.className).toContain('mode-numbered');
        expect(steps.className).toContain('narrow-dots');
        expect(el.shadowRoot.querySelector('.step-list')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.progress-track')).toBeNull();
    });

    it('narrowMode progressBar mounts the bar ALONGSIDE the list (CSS swaps them)', () => {
        const el = mount({ narrowMode: 'progressBar' });
        const steps = el.shadowRoot.querySelector('.steps');
        expect(steps.className).toContain('narrow-bar');
        expect(el.shadowRoot.querySelector('.step-list')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.progress-track')).not.toBeNull();
    });

    it('mode progressBar renders the bar only', () => {
        const el = mount({ mode: 'progressBar' });
        expect(el.shadowRoot.querySelector('.step-list')).toBeNull();
        expect(el.shadowRoot.querySelector('.progress-track')).not.toBeNull();
    });

    it('gated by default: steps past the first invalid page lock; free unlocks', () => {
        const el = mount(undefined);
        let btns = [...el.shadowRoot.querySelectorAll('.step-btn')];
        expect(btns.map((b) => b.disabled)).toEqual([false, false, true]);

        const free = mount({ navigation: 'free' });
        btns = [...free.shadowRoot.querySelectorAll('.step-btn')];
        expect(btns.map((b) => b.disabled)).toEqual([false, false, false]);
    });

    it('strip is unpainted by default (paint-when-pinned) and mounts its tripwire', () => {
        const el = mount(undefined);
        expect(el.shadowRoot.querySelector('.steps').className).not.toContain(
            'is-stuck'
        );
        expect(el.shadowRoot.querySelector('.stuck-sentinel')).not.toBeNull();
    });

    it('computeFitTier: full when labels fit, compact when only numbers fit, collapse below that', () => {
        // 3 steps: labeled needs 360, compact needs 3*44+140=272
        expect(computeFitTier(900, 3)).toBe('full');
        expect(computeFitTier(300, 3)).toBe('compact');
        expect(computeFitTier(200, 3)).toBe('collapse');
        // 6 long-label steps on a wide desktop card: labeled needs 720
        expect(computeFitTier(650, 6)).toBe('compact');
        // degenerate inputs never throw
        expect(computeFitTier(0, 3)).toBe('full');
        expect(computeFitTier(800, 0)).toBe('full');
    });
});
