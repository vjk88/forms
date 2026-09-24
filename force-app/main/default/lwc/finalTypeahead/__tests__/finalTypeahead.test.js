import { createElement } from 'lwc';
import FinalTypeahead from 'c/finalTypeahead';

const flush = () => new Promise((r) => setTimeout(r, 0));

const ITEMS = [
    { value: 'Industry', label: 'Industry', meta: 'Industry' },
    { value: 'Name', label: 'Account Name', meta: 'Name' },
    {
        value: 'Owner',
        label: 'Owner',
        meta: 'User',
        searchText: 'Owner',
        kind: 'group'
    },
    {
        value: 'Owner.Email',
        label: 'Owner › Email',
        meta: 'Owner.Email',
        searchOnly: true
    }
];

function mount(props = {}) {
    const el = createElement('c-final-typeahead', { is: FinalTypeahead });
    Object.assign(el, { label: 'Field', items: ITEMS }, props);
    document.body.appendChild(el);
    return el;
}

const input = (el) => el.shadowRoot.querySelector('.ta-input');
const shown = (el) =>
    [...el.shadowRoot.querySelectorAll('.ta-item-label')].map((n) =>
        n.textContent.trim().replace(/\s*›$/, '')
    );

function type(el, text) {
    const box = input(el);
    box.value = text;
    box.dispatchEvent(new CustomEvent('input'));
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-typeahead', () => {
    it('lists everything but search-only items until something is typed', async () => {
        const el = mount();
        input(el).dispatchEvent(new CustomEvent('focus'));
        await flush();
        expect(shown(el)).toEqual(['Industry', 'Account Name', 'Owner']);
    });

    it('matches label, value and search words; search-only items join a search', async () => {
        const el = mount();
        type(el, 'mail');
        await flush();
        expect(shown(el)).toEqual(['Owner › Email']);
        type(el, 'name');
        await flush();
        expect(shown(el)).toEqual(['Account Name']);
    });

    it('a group opens instead of picking, by click or →', async () => {
        const el = mount();
        const opened = [];
        const picked = [];
        el.addEventListener('opengroup', (e) => opened.push(e.detail.value));
        el.addEventListener('pick', (e) => picked.push(e.detail.value));
        type(el, 'own');
        await flush();
        el.shadowRoot
            .querySelector('[data-value="Owner"][data-kind="group"]')
            .dispatchEvent(new CustomEvent('mousedown'));
        expect(opened).toEqual(['Owner']);
        expect(picked).toEqual([]);

        type(el, 'own');
        await flush();
        input(el).dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight' })
        );
        expect(opened).toEqual(['Owner', 'Owner']);
    });

    it('the back row stays on top and says back', async () => {
        const el = mount({
            items: [
                { value: '__back', label: 'Back to all fields', kind: 'back' },
                { value: 'Owner.Email', label: 'Owner › Email' }
            ]
        });
        const backs = [];
        el.addEventListener('back', () => backs.push(true));
        type(el, 'zzz');
        await flush();
        expect(shown(el)).toEqual(['‹Back to all fields']);
        el.shadowRoot
            .querySelector('[data-kind="back"]')
            .dispatchEvent(new CustomEvent('mousedown'));
        expect(backs).toEqual([true]);
    });

    it('shows a value it doesn’t list by the label it was given', async () => {
        const el = mount({ value: 'Parent.Type', valueLabel: 'Parent › Type' });
        await flush();
        expect(input(el).value).toBe('Parent › Type');
    });

    it('speaks the lightning error API', async () => {
        const el = mount();
        el.setCustomValidity('Choose a field.');
        expect(el.reportValidity()).toBe(false);
        await flush();
        expect(
            el.shadowRoot.querySelector('.ta-error').textContent.trim()
        ).toBe('Choose a field.');
        expect(input(el).getAttribute('aria-invalid')).toBe('true');
        el.setCustomValidity('');
        expect(el.reportValidity()).toBe(true);
    });

    it('hides the label visually when asked, keeping it for screen readers', async () => {
        const el = mount({ variant: 'label-hidden' });
        await flush();
        expect(el.shadowRoot.querySelector('label').className).toContain(
            'slds-assistive-text'
        );
    });

    it('Escape closes an open list without closing a dialog around it', async () => {
        const el = mount();
        const outer = jest.fn();
        document.body.addEventListener('keydown', outer);
        input(el).dispatchEvent(new CustomEvent('focus'));
        await flush();
        const esc = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            composed: true
        });
        input(el).dispatchEvent(esc);
        await flush();
        expect(shown(el)).toEqual([]);
        expect(outer).not.toHaveBeenCalled();
        // a closed list lets Escape through, so the dialog can close
        input(el).dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            })
        );
        expect(outer).toHaveBeenCalledTimes(1);
        document.body.removeEventListener('keydown', outer);
    });

    it('a click keeps focus in the box, and closing says so', async () => {
        const el = mount();
        const closed = jest.fn();
        el.addEventListener('close', closed);
        input(el).dispatchEvent(new CustomEvent('focus'));
        await flush();
        const down = new CustomEvent('mousedown', { cancelable: true });
        el.shadowRoot.querySelector('.ta-item').dispatchEvent(down);
        expect(down.defaultPrevented).toBe(true);
        expect(closed).toHaveBeenCalledTimes(1);
    });

    it('says when the list is cut short', async () => {
        const many = Array.from({ length: 60 }, (_, i) => ({
            value: `F${i}`,
            label: `Field ${i}`
        }));
        const el = mount({ items: many });
        input(el).dispatchEvent(new CustomEvent('focus'));
        await flush();
        expect(shown(el)).toHaveLength(50);
        expect(el.shadowRoot.querySelector('.ta-note').textContent).toContain(
            'Showing 50 of 60'
        );
    });

    it('Left Arrow in an empty box goes back', async () => {
        const el = mount({
            items: [
                { value: '__back', label: 'Back to all fields', kind: 'back' },
                { value: 'Owner.Email', label: 'Owner › Email' }
            ]
        });
        const back = jest.fn();
        el.addEventListener('back', back);
        input(el).dispatchEvent(new CustomEvent('focus'));
        await flush();
        input(el).dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft' })
        );
        expect(back).toHaveBeenCalledTimes(1);
    });
});
