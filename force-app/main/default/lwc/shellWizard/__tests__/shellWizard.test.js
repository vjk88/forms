import { createElement } from 'lwc';
import ShellWizard from 'c/shellWizard';

const PAGES = [
    { pageKey: 'p1', label: 'One', zones: [] },
    { pageKey: 'p2', label: 'Two', zones: [] },
    { pageKey: 'p3', label: 'Three', zones: [] }
];
const baseModel = (stepperMode) => ({
    collapsed: false,
    shell: { nav: 'stepper', stepperMode },
    header: { title: 'T' },
    labels: { back: 'Back', next: 'Next', submit: 'Submit', draftBadge: 'DRAFT', stepWord: 'Step' },
    pages: PAGES
});
const nav = (idx) => ({
    currentPageKey: PAGES[idx].pageKey,
    currentIndex: idx,
    total: PAGES.length,
    isFirst: idx === 0,
    isLast: idx === PAGES.length - 1,
    states: {}
});

function mount(stepperMode, idx = 1) {
    const el = createElement('c-shell-wizard', { is: ShellWizard });
    el.model = baseModel(stepperMode);
    el.nav = nav(idx);
    el.mode = 'live';
    document.body.appendChild(el);
    return el;
}
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

describe('c-shell-wizard stepperMode (T3.4)', () => {
    it.each([
        ['vertical', 'mode-vertical'],
        ['horizontal', 'mode-horizontal'],
        ['progress', 'mode-progress']
    ])('renders %s mode with class %s', (mode, cls) => {
        const el = mount(mode);
        const wiz = el.shadowRoot.querySelector('.wizard');
        expect(wiz.classList.contains(cls)).toBe(true);
    });

    it('defaults to vertical when stepperMode is absent', () => {
        const el = mount(undefined);
        expect(el.shadowRoot.querySelector('.wizard').classList.contains('mode-vertical')).toBe(true);
    });

    it('derives horizontal from the legacy stepperPlacement: top', () => {
        const el = createElement('c-shell-wizard', { is: ShellWizard });
        el.model = { ...baseModel(undefined), shell: { nav: 'stepper', stepperPlacement: 'top' } };
        el.nav = nav(0);
        document.body.appendChild(el);
        expect(el.shadowRoot.querySelector('.wizard').classList.contains('mode-horizontal')).toBe(true);
    });

    it('renders one node per page with a progress fill reflecting position', () => {
        const el = mount('vertical', 1); // step 2 of 3 → 67%
        const nodes = el.shadowRoot.querySelectorAll('.rail-node');
        expect(nodes.length).toBe(3);
        const fill = el.shadowRoot.querySelector('.pb-fill');
        expect(fill.style.width).toBe('67%');
    });

    it('exposes the progress bar with correct ARIA bounds', () => {
        const el = mount('progress', 2);
        const pb = el.shadowRoot.querySelector('.progressbar');
        expect(pb.getAttribute('aria-valuenow')).toBe('3');
        expect(pb.getAttribute('aria-valuemax')).toBe('3');
    });
});
