import { createElement } from 'lwc';
import FinalAddressSearch from 'c/finalAddressSearch';
import status from '@salesforce/apex/FinalAddressController.status';
import suggest from '@salesforce/apex/FinalAddressController.suggest';
import details from '@salesforce/apex/FinalAddressController.details';

jest.mock(
    '@salesforce/apex/FinalAddressController.status',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAddressController.suggest',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAddressController.details',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const ROWS = [
    {
        id: 'p1',
        title: '1 Market St',
        subtitle: 'San Francisco, CA',
        isGroup: false
    },
    {
        id: 'p2',
        title: '10 Market St',
        subtitle: 'San Francisco, CA',
        isGroup: false
    },
    {
        id: 'g1',
        title: 'Market St (12 addresses)',
        subtitle: 'Reno, NV',
        isGroup: true
    }
];

const RESULT = {
    street: '1 Market St',
    city: 'San Francisco',
    province: 'California',
    provinceCode: 'CA',
    postalCode: '94105',
    country: 'United States',
    countryCode: 'US',
    latitude: 37.79,
    longitude: -122.39
};

const CONFIGURED = {
    configured: true,
    provider: 'Google',
    providerLabel: 'Google',
    attribution: 'Results by Google'
};

/* Fake timers drive the debounce, so drain microtasks instead of timers. */
const flush = () =>
    Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => Promise.resolve())
        .then(() => Promise.resolve())
        .then(() => Promise.resolve());

function mount(props = {}) {
    const el = createElement('c-final-address-search', {
        is: FinalAddressSearch
    });
    el.formId = 'a0F1';
    el.elementId = 'el_addr';
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

const input = (el) => el.shadowRoot.querySelector('.fas-input');
const options = (el) => [...el.shadowRoot.querySelectorAll('.fas-opt')];

async function ready(props) {
    const el = mount(props);
    status.emit(CONFIGURED);
    await flush();
    return el;
}

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

describe('c-final-address-search', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        suggest.mockReset();
        details.mockReset();
        suggest.mockResolvedValue(ROWS);
        details.mockResolvedValue(RESULT);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
    });

    describe('status gating', () => {
        it('renders nothing until the status arrives', async () => {
            const el = mount();
            await flush();
            expect(input(el)).toBeNull();
            expect(el.shadowRoot.querySelector('.fas-note')).toBeNull();
        });

        it('renders nothing when no provider is set up', async () => {
            const el = mount();
            status.emit({ configured: false });
            await flush();
            expect(input(el)).toBeNull();
            expect(el.shadowRoot.querySelector('.fas-note')).toBeNull();
        });

        it('renders the box once configured, with a placeholder and a name', async () => {
            const el = await ready({ label: 'Find your address' });
            expect(input(el)).not.toBeNull();
            expect(input(el).getAttribute('placeholder')).toBe(
                'Search for an address'
            );
            expect(input(el).getAttribute('aria-label')).toBe(
                'Find your address'
            );
            expect(input(el).getAttribute('role')).toBe('combobox');
        });

        it('says to type the address when the status call fails', async () => {
            const el = mount();
            status.error({ message: 'nope' });
            await flush();
            expect(input(el)).toBeNull();
            expect(el.shadowRoot.querySelector('.fas-note').textContent).toBe(
                "Address search isn't available right now. Type the address below."
            );
        });
    });

    describe('searching', () => {
        it('waits 300 ms and 3 characters before asking the server', async () => {
            const el = await ready();
            const i = input(el);
            i.value = 'ab';
            i.dispatchEvent(new CustomEvent('input'));
            jest.advanceTimersByTime(1000);
            await flush();
            expect(suggest).not.toHaveBeenCalled();

            i.value = 'abc';
            i.dispatchEvent(new CustomEvent('input'));
            jest.advanceTimersByTime(299);
            await flush();
            expect(suggest).not.toHaveBeenCalled();
            jest.advanceTimersByTime(1);
            await flush();
            expect(suggest).toHaveBeenCalledTimes(1);
        });

        it('sends the form, question, text, a session token and no container', async () => {
            const el = await ready();
            await type(el, '1 Market');
            const args = suggest.mock.calls[0][0];
            expect(args).toMatchObject({
                formId: 'a0F1',
                elementId: 'el_addr',
                text: '1 Market',
                container: null
            });
            expect(args.sessionToken).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
            );
        });

        it('keeps one session token across searches and starts a new one after a pick', async () => {
            const el = await ready();
            input(el).dispatchEvent(new CustomEvent('focus'));
            await type(el, 'abc');
            await type(el, 'abcd');
            const first = suggest.mock.calls[0][0].sessionToken;
            expect(suggest.mock.calls[1][0].sessionToken).toBe(first);

            key(el, 'ArrowDown');
            key(el, 'Enter');
            await flush();
            expect(details.mock.calls[0][0].sessionToken).toBe(first);

            await type(el, 'xyz');
            const next =
                suggest.mock.calls[suggest.mock.calls.length - 1][0]
                    .sessionToken;
            expect(next).not.toBe(first);
        });

        it('shows the options and the provider credit', async () => {
            const el = await ready();
            await type(el, '1 Market');
            expect(options(el).map((o) => o.textContent.trim())).toEqual([
                expect.stringContaining('1 Market St'),
                expect.stringContaining('10 Market St'),
                expect.stringContaining('Market St (12 addresses)')
            ]);
            expect(
                el.shadowRoot.querySelector('.fas-opt-sub').textContent
            ).toBe('San Francisco, CA');
            expect(
                el.shadowRoot
                    .querySelector('.fas-attribution')
                    .textContent.trim()
            ).toBe('Results by Google');
            expect(input(el).getAttribute('aria-expanded')).toBe('true');
        });

        it('shows at most five options', async () => {
            suggest.mockResolvedValue(
                Array.from({ length: 8 }, (_, i) => ({
                    id: `p${i}`,
                    title: `Street ${i}`,
                    isGroup: false
                }))
            );
            const el = await ready();
            await type(el, 'street');
            expect(options(el)).toHaveLength(5);
        });

        it('says so when nothing matches', async () => {
            suggest.mockResolvedValue([]);
            const el = await ready();
            await type(el, 'zzzz');
            expect(options(el)).toHaveLength(0);
            expect(el.shadowRoot.querySelector('.fas-empty').textContent).toBe(
                'No matching addresses'
            );
        });

        it('ignores a stale answer when a newer search is under way', async () => {
            let release;
            suggest
                .mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            release = resolve;
                        })
                )
                .mockResolvedValueOnce([
                    { id: 'new', title: 'Newer result', isGroup: false }
                ]);
            const el = await ready();
            await type(el, 'old');
            await type(el, 'older');
            release([{ id: 'old', title: 'Stale result', isGroup: false }]);
            await flush();
            await flush();
            const titles = options(el).map((o) => o.textContent);
            expect(titles).toHaveLength(1);
            expect(titles[0]).toContain('Newer result');
        });
    });

    describe('keyboard', () => {
        it('arrows move a wrapping active option and name it for assistive tech', async () => {
            const el = await ready();
            await type(el, '1 Market');
            key(el, 'ArrowDown');
            await flush();
            expect(options(el)[0].getAttribute('aria-selected')).toBe('true');
            key(el, 'ArrowUp');
            await flush();
            expect(options(el)[2].getAttribute('aria-selected')).toBe('true');
            expect(input(el).getAttribute('aria-activedescendant')).toBe(
                options(el)[2].id
            );
            key(el, 'ArrowDown');
            await flush();
            expect(options(el)[0].getAttribute('aria-selected')).toBe('true');
        });

        it('Escape closes the list', async () => {
            const el = await ready();
            await type(el, '1 Market');
            key(el, 'Escape');
            await flush();
            expect(options(el)).toHaveLength(0);
            expect(input(el).getAttribute('aria-expanded')).toBe('false');
        });

        it('Enter on the active option picks it; with none active it is left alone', async () => {
            const el = await ready();
            await type(el, '1 Market');
            const plain = new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true
            });
            input(el).dispatchEvent(plain);
            expect(plain.defaultPrevented).toBe(false);
            expect(details).not.toHaveBeenCalled();

            key(el, 'ArrowDown');
            await flush();
            key(el, 'Enter');
            await flush();
            expect(details).toHaveBeenCalledTimes(1);
            expect(details.mock.calls[0][0]).toMatchObject({
                formId: 'a0F1',
                elementId: 'el_addr',
                placeId: 'p1'
            });
        });
    });

    describe('picking', () => {
        it('fetches the details and dispatches addresspick with the result', async () => {
            const el = await ready();
            const picked = jest.fn();
            el.addEventListener('addresspick', picked);
            await type(el, '1 Market');
            options(el)[0].dispatchEvent(new CustomEvent('mousedown'));
            await flush();
            expect(picked).toHaveBeenCalledTimes(1);
            expect(picked.mock.calls[0][0].detail).toEqual(RESULT);
        });

        it('clears and closes the box after a pick', async () => {
            const el = await ready();
            await type(el, '1 Market');
            options(el)[0].dispatchEvent(new CustomEvent('mousedown'));
            await flush();
            await flush();
            expect(input(el).value).toBe('');
            expect(options(el)).toHaveLength(0);
            expect(input(el).getAttribute('aria-expanded')).toBe('false');
        });

        it('opens a group instead of filling anything', async () => {
            suggest.mockResolvedValueOnce(ROWS).mockResolvedValueOnce([
                { id: 'c1', title: '12 Market St Apt 1', isGroup: false },
                { id: 'c2', title: '12 Market St Apt 2', isGroup: false }
            ]);
            const el = await ready();
            const picked = jest.fn();
            el.addEventListener('addresspick', picked);
            await type(el, 'market');
            options(el)[2].dispatchEvent(new CustomEvent('mousedown'));
            await flush();
            await flush();
            expect(details).not.toHaveBeenCalled();
            expect(picked).not.toHaveBeenCalled();
            expect(suggest).toHaveBeenCalledTimes(2);
            expect(suggest.mock.calls[1][0]).toMatchObject({
                text: 'market',
                container: 'g1'
            });
            expect(options(el).map((o) => o.textContent)).toEqual([
                expect.stringContaining('Apt 1'),
                expect.stringContaining('Apt 2')
            ]);

            options(el)[1].dispatchEvent(new CustomEvent('mousedown'));
            await flush();
            expect(details.mock.calls[0][0].placeId).toBe('c2');
            expect(picked).toHaveBeenCalledTimes(1);
        });
    });

    describe('failure', () => {
        it('a failed search hides the box and leaves one quiet line', async () => {
            suggest.mockRejectedValue({
                body: { message: 'FINAL_ADDR:DOWN' }
            });
            const el = await ready();
            await type(el, '1 Market');
            await flush();
            expect(input(el)).toBeNull();
            expect(el.shadowRoot.querySelector('.fas-note').textContent).toBe(
                "Address search isn't available right now. Type the address below."
            );
        });

        it('a failed details call does the same, and emits nothing', async () => {
            details.mockRejectedValue(new Error('boom'));
            const el = await ready();
            const picked = jest.fn();
            el.addEventListener('addresspick', picked);
            await type(el, '1 Market');
            options(el)[0].dispatchEvent(new CustomEvent('mousedown'));
            await flush();
            await flush();
            expect(picked).not.toHaveBeenCalled();
            expect(input(el)).toBeNull();
            expect(el.shadowRoot.querySelector('.fas-note')).not.toBeNull();
        });
    });
});
