import { createElement } from 'lwc';
import FinalObjectPicker from 'c/finalObjectPicker';

const OBJECTS = [
    { label: 'Account', value: 'Account' },
    { label: 'Contact', value: 'Contact' },
    { label: 'Contact Point Email', value: 'ContactPointEmail' },
    { label: 'Partner Application', value: 'Partner_Application__c' }
];

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-object-picker', {
        is: FinalObjectPicker
    });
    Object.assign(el, { objects: OBJECTS }, props);
    document.body.appendChild(el);
    return el;
}

const input = (el) => el.shadowRoot.querySelector('.op-input');
const shown = (el) =>
    [...el.shadowRoot.querySelectorAll('.op-item-label')].map(
        (n) => n.textContent
    );

function type(el, text) {
    const box = input(el);
    box.value = text;
    box.dispatchEvent(new CustomEvent('input'));
}

describe('c-final-object-picker', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('narrows the list as you type, by label or API name', async () => {
        const el = mount();
        type(el, 'cont');
        await flush();
        expect(shown(el)).toEqual(['Contact', 'Contact Point Email']);
        type(el, 'partner_app');
        await flush();
        expect(shown(el)).toEqual(['Partner Application']);
    });

    it('puts names that start with the search first', async () => {
        const el = mount({
            objects: [
                { label: 'Account Contact Role', value: 'AccountContactRole' },
                { label: 'Contact', value: 'Contact' }
            ]
        });
        type(el, 'cont');
        await flush();
        expect(shown(el)).toEqual(['Contact', 'Account Contact Role']);
    });

    it('says so when nothing matches', async () => {
        const el = mount();
        type(el, 'zzz');
        await flush();
        expect(el.shadowRoot.querySelector('.op-empty').textContent).toBe(
            'No objects match'
        );
    });

    it('picks with a click', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('pick', handler);
        type(el, 'cont');
        await flush();
        el.shadowRoot
            .querySelector('[data-value="Contact"]')
            .dispatchEvent(new CustomEvent('mousedown'));
        expect(handler.mock.calls[0][0].detail).toEqual({
            value: 'Contact',
            label: 'Contact'
        });
    });

    it('picks with the keyboard', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('pick', handler);
        type(el, 'cont');
        await flush();
        const box = input(el);
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(handler.mock.calls[0][0].detail.value).toBe('ContactPointEmail');
    });

    it('shows the chosen object by name', async () => {
        const el = mount({ value: 'Contact' });
        await flush();
        expect(input(el).value).toBe('Contact');
    });
});
