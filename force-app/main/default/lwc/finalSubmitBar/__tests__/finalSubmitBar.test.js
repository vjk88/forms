import { createElement } from 'lwc';
import FinalSubmitBar from 'c/finalSubmitBar';

// DEFERRED #27: in the split arrangement Next stays on the right on every
// page. Page 1 has no Back, so Next carries the class that pins it right.
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props) {
    const el = createElement('c-final-submit-bar', { is: FinalSubmitBar });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-submit-bar: Next stays right in split', () => {
    it('page 1 (no Back): Next is the pinned-right button', async () => {
        const el = mount({ arrangement: 'split', showNext: true });
        await flush();
        expect(el.shadowRoot.querySelector('.bar').className).toContain(
            'arr-split'
        );
        expect(el.shadowRoot.querySelector('.back-link')).toBeNull();
        const next = el.shadowRoot.querySelector('button.primary');
        expect(next.classList.contains('next')).toBe(true);
    });

    it('a lone Submit is not pinned: a one-page form keeps it left', async () => {
        const el = mount({ arrangement: 'split', showSubmit: true });
        await flush();
        const submit = el.shadowRoot.querySelector('button.primary');
        expect(submit.classList.contains('next')).toBe(false);
    });
});

describe('c-final-submit-bar: sending text', () => {
    it('says Submitting while a send is in flight and Still sending once it is slow', async () => {
        const el = mount({ showSubmit: true, submitting: true });
        await flush();
        const text = () =>
            el.shadowRoot.querySelector('button.primary').textContent.trim();
        expect(text()).toBe('Submitting…');

        el.slow = true;
        await flush();
        expect(text()).toBe('Still sending…');
    });
});
