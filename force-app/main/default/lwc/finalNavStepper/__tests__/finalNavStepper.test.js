import { createElement } from 'lwc';
import FinalNavStepper from 'c/finalNavStepper';

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
});
