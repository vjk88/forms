import { createElement } from 'lwc';
import FinalLookup from 'c/finalLookup';
import search from '@salesforce/apex/FinalLookupController.search';

jest.mock(
    '@salesforce/apex/FinalLookupController.search',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const ROWS = [
    { id: '003a', title: 'Rose Gonzalez', subtitle: 'Edge Communications' },
    { id: '003b', title: 'Sean Forbes', subtitle: 'Edge Communications' },
    { id: '003c', title: 'Stella Pavlova', subtitle: 'United Oil' }
];

/* Fake timers are on for the debounce, so a setTimeout-based flush would wait
   forever. Drain microtasks instead: promise continuations and LWC's rerender
   both land there. */
const flush = async () => {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
};

function mount(props = {}) {
    const el = createElement('c-final-lookup', { is: FinalLookup });
    el.elementId = 'el_contact';
    el.label = 'Contact';
    el.formId = 'a00';
    el.versionId = 'a04';
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

const input = (el) => el.shadowRoot.querySelector('.fl-input');
const options = (el) => [...el.shadowRoot.querySelectorAll('.fl-opt')];

/** Type, then let the debounce and the Apex promise settle. */
async function type(el, value) {
    const i = input(el);
    i.value = value;
    i.dispatchEvent(new CustomEvent('input'));
    jest.runOnlyPendingTimers();
    await flush();
    await flush();
}

function key(el, k) {
    input(el).dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true })
    );
}

describe('c-final-lookup', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        search.mockResolvedValue(ROWS);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('does not search below the two-character minimum', async () => {
        const el = mount();
        await type(el, 'a');
        expect(search).not.toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('.fl-empty').textContent).toContain(
            '2 or more'
        );
    });

    it('searches after the debounce and renders rows with their subtitle', async () => {
        const el = mount();
        await type(el, 'ros');
        expect(search).toHaveBeenCalledTimes(1);
        expect(search.mock.calls[0][0].elementId).toBe('el_contact');
        const opts = options(el);
        expect(opts).toHaveLength(3);
        expect(opts[0].textContent).toContain('Rose Gonzalez');
        expect(opts[0].textContent).toContain('Edge Communications');
    });

    it('sends the current answers so the server can resolve its own filter', async () => {
        const el = mount({ answers: { el_account: '001x' } });
        await type(el, 'ros');
        expect(JSON.parse(search.mock.calls[0][0].answersJson)).toEqual({
            el_account: '001x'
        });
    });

    it('never sends filter criteria or a target object', async () => {
        const el = mount();
        await type(el, 'ros');
        const sent = Object.keys(search.mock.calls[0][0]);
        expect(sent).toEqual(
            expect.arrayContaining(['formId', 'versionId', 'elementId', 'term'])
        );
        expect(sent).not.toContain('filter');
        expect(sent).not.toContain('targetObject');
    });

    it('only the last keystroke wins when responses arrive out of order', async () => {
        const el = mount();
        let resolveFirst;
        search.mockReturnValueOnce(
            new Promise((r) => {
                resolveFirst = r;
            })
        );
        search.mockResolvedValueOnce([
            { id: '003z', title: 'Later', subtitle: null }
        ]);
        await type(el, 'ro');
        await type(el, 'ros');
        resolveFirst(ROWS); // the stale one lands last
        await flush();
        await flush();
        const opts = options(el);
        expect(opts).toHaveLength(1);
        expect(opts[0].textContent).toContain('Later');
    });

    it('arrow keys move the active option and wrap at both ends', async () => {
        const el = mount();
        await type(el, 'ros');
        key(el, 'ArrowDown');
        await flush();
        expect(options(el)[0].className).toContain('fl-opt-active');
        key(el, 'ArrowUp');
        await flush();
        expect(options(el)[2].className).toContain('fl-opt-active');
    });

    it('Home and End jump to the ends of the list', async () => {
        const el = mount();
        await type(el, 'ros');
        key(el, 'End');
        await flush();
        expect(options(el)[2].getAttribute('aria-selected')).toBe('true');
        key(el, 'Home');
        await flush();
        expect(options(el)[0].getAttribute('aria-selected')).toBe('true');
    });

    it('points aria-activedescendant at the rendered option id', async () => {
        const el = mount();
        await type(el, 'ros');
        key(el, 'ArrowDown');
        await flush();
        const active = el.shadowRoot.querySelector('.fl-opt-active');
        expect(input(el).getAttribute('aria-activedescendant')).toBe(active.id);
    });

    it('Enter selects the active option and emits the frozen contract', async () => {
        const el = mount();
        const heard = [];
        el.addEventListener('valuechange', (e) => heard.push(e.detail));
        await type(el, 'ros');
        key(el, 'ArrowDown');
        await flush();
        key(el, 'Enter');
        await flush();
        expect(heard).toHaveLength(1);
        expect(heard[0].elementId).toBe('el_contact');
        expect(heard[0].value).toBe('003a');
        expect(el.shadowRoot.querySelector('.fl-pill-text').textContent).toBe(
            'Rose Gonzalez'
        );
    });

    it('Enter with nothing active does not swallow the key', async () => {
        const el = mount();
        await type(el, 'ros');
        const ev = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true
        });
        input(el).dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
    });

    it('Escape closes the list without choosing anything', async () => {
        const el = mount();
        const heard = jest.fn();
        el.addEventListener('valuechange', heard);
        await type(el, 'ros');
        key(el, 'Escape');
        await flush();
        expect(el.shadowRoot.querySelector('.fl-listbox')).toBeNull();
        expect(heard).not.toHaveBeenCalled();
    });

    it('clicking an option selects it', async () => {
        const el = mount();
        const heard = [];
        el.addEventListener('valuechange', (e) => heard.push(e.detail));
        await type(el, 'ros');
        options(el)[1].dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true })
        );
        await flush();
        expect(heard[0].value).toBe('003b');
    });

    it('clearing emits a null value', async () => {
        const el = mount({ value: '003a', displayLabel: 'Rose Gonzalez' });
        await flush();
        const heard = [];
        el.addEventListener('valuechange', (e) => heard.push(e.detail));
        el.shadowRoot.querySelector('.fl-clear').click();
        await flush();
        expect(heard).toHaveLength(1);
        expect(heard[0].value).toBeNull();
    });

    it('clearSelection() is imperative and emits nothing', async () => {
        const el = mount({ value: '003a', displayLabel: 'Rose Gonzalez' });
        await flush();
        const heard = jest.fn();
        el.addEventListener('valuechange', heard);
        el.clearSelection();
        await flush();
        expect(heard).not.toHaveBeenCalled();
        expect(el.value).toBeNull();
    });

    it('read-only renders an immutable pill with no clear button', async () => {
        const el = mount({
            value: '003a',
            displayLabel: 'Rose Gonzalez',
            readOnly: true
        });
        await flush();
        expect(el.shadowRoot.querySelector('.fl-clear')).toBeNull();
        expect(el.shadowRoot.querySelector('.fl-input')).toBeNull();
        expect(el.shadowRoot.querySelector('.fl-pill-text').textContent).toBe(
            'Rose Gonzalez'
        );
    });

    it('a parent-supplied error renders once and marks the field invalid', async () => {
        const el = mount({
            validationError: 'Sean Forbes is not available for United Oil.'
        });
        await flush();
        const errors = el.shadowRoot.querySelectorAll('.fl-error');
        expect(errors).toHaveLength(1);
        expect(errors[0].textContent).toContain('not available');
        expect(input(el).getAttribute('aria-invalid')).toBe('true');
    });

    it('announces the result count to a screen reader', async () => {
        const el = mount();
        await type(el, 'ros');
        expect(el.shadowRoot.querySelector('.fl-status').textContent).toBe(
            '3 results'
        );
    });

    it('a failed search shows nothing rather than stale rows', async () => {
        const el = mount();
        await type(el, 'ros');
        expect(options(el)).toHaveLength(3);
        search.mockRejectedValueOnce(new Error('boom'));
        await type(el, 'rose');
        expect(options(el)).toHaveLength(0);
        expect(el.shadowRoot.querySelector('.fl-empty').textContent).toContain(
            'No matches'
        );
    });
});
