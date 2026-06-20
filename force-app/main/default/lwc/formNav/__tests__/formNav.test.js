import { createElement } from 'lwc';
import FormNav from 'c/formNav';

const PAGES = [
    { pageKey: 'p1', label: 'One' },
    { pageKey: 'p2', label: 'Two' },
    { pageKey: 'p3', label: 'Three' }
];
const nav = (idx) => ({
    currentPageKey: PAGES[idx].pageKey,
    currentIndex: idx,
    total: PAGES.length,
    isFirst: idx === 0,
    isLast: idx === PAGES.length - 1,
    states: { p1: 'complete' }
});

function mount({ displayMode = 'progress', clickable = false, idx = 1 } = {}) {
    const el = createElement('c-form-nav', { is: FormNav });
    el.pages = PAGES;
    el.nav = nav(idx);
    el.displayMode = displayMode;
    el.clickable = clickable;
    el.labels = { stepWord: 'Step' };
    document.body.appendChild(el);
    return el;
}
afterEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

describe('c-form-nav', () => {
    it('progress mode shows a fill reflecting position and ARIA bounds', () => {
        const el = mount({ displayMode: 'progress', idx: 1 }); // step 2 of 3 → 67%
        const pb = el.shadowRoot.querySelector('.fn-progress');
        expect(pb.getAttribute('aria-valuenow')).toBe('2');
        expect(pb.getAttribute('aria-valuemax')).toBe('3');
        expect(el.shadowRoot.querySelector('.fn-fill').style.width).toBe('67%');
        expect(el.shadowRoot.querySelector('.fn-steps')).toBeNull();
    });

    it('horizontal mode renders one step per page', () => {
        const el = mount({ displayMode: 'horizontal' });
        expect(el.shadowRoot.querySelectorAll('.fn-step').length).toBe(3);
        expect(el.shadowRoot.querySelector('.fn-progress')).toBeNull();
    });

    it('linear (clickable=false) disables future steps, enables past', () => {
        const el = mount({ displayMode: 'horizontal', clickable: false, idx: 1 });
        const steps = el.shadowRoot.querySelectorAll('.fn-step');
        expect(steps[0].disabled).toBe(false); // past
        expect(steps[1].disabled).toBe(false); // current
        expect(steps[2].disabled).toBe(true); // future
    });

    it('free (clickable=true) enables every step', () => {
        const el = mount({ displayMode: 'horizontal', clickable: true, idx: 0 });
        const steps = el.shadowRoot.querySelectorAll('.fn-step');
        expect([...steps].every((s) => s.disabled === false)).toBe(true);
    });

    it('dispatches navrequest with the page key on a step click', () => {
        const el = mount({ displayMode: 'horizontal', clickable: true, idx: 0 });
        const handler = jest.fn();
        el.addEventListener('navrequest', handler);
        el.shadowRoot.querySelectorAll('.fn-step')[2].click();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({ pageKey: 'p3' });
    });

    it('defaults an invalid displayMode to progress', () => {
        const el = mount({ displayMode: 'bogus' });
        expect(el.shadowRoot.querySelector('.fn-progress')).not.toBeNull();
    });
});
