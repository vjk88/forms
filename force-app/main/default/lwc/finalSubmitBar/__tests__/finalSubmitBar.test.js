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

    it('announces "Still sending" in a polite live region screen readers hear', async () => {
        const el = mount({ showSubmit: true, submitting: true });
        await flush();
        const live = () => el.shadowRoot.querySelector('span.sr-only');
        expect(live().getAttribute('aria-live')).toBe('polite');
        expect(live().textContent).toBe('');

        el.slow = true;
        await flush();
        expect(live().textContent).toBe('Still sending…');

        el.submitting = false;
        await flush();
        expect(live().textContent).toBe('');
    });
});

describe('c-final-submit-bar: the list of questions to fix', () => {
    it('renders the heading in the live region, the bullets as buttons outside it, and "and N more"', async () => {
        const el = mount({
            showSubmit: true,
            blockedMessage: 'Please fix these to submit:',
            blockedItems: [
                { key: 'c:a', text: 'Email' },
                { key: 'c:b', text: 'Phone' }
            ],
            blockedMore: 'and 3 more'
        });
        await flush();
        const root = el.shadowRoot;
        const live = root.querySelector('[aria-live="polite"].blocked');
        expect(live.textContent).toBe('Please fix these to submit:');
        expect(live.querySelector('button')).toBeNull();
        const buttons = [...root.querySelectorAll('ul.blocked-list button')];
        expect(buttons.map((b) => b.textContent.trim())).toEqual([
            'Email',
            'Phone'
        ]);
        expect(root.querySelector('.blocked-more').textContent).toBe(
            'and 3 more'
        );
    });

    it('a bullet fires blockedjump with its key', async () => {
        const el = mount({
            showSubmit: true,
            blockedMessage: 'Please fix this to submit:',
            blockedItems: [{ key: 'c:b', text: 'Phone' }]
        });
        const handler = jest.fn();
        el.addEventListener('blockedjump', handler);
        await flush();
        el.shadowRoot.querySelector('.blocked-link').click();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({ key: 'c:b' });
    });

    it('draws no list when there are no items', async () => {
        const el = mount({
            showSubmit: true,
            blockedMessage: 'Plain failure.'
        });
        await flush();
        expect(el.shadowRoot.querySelector('ul.blocked-list')).toBeNull();
    });
});
