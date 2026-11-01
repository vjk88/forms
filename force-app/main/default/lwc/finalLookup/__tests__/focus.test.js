import { createElement } from 'lwc';
import FinalLookup from 'c/finalLookup';

jest.mock(
    '@salesforce/apex/FinalLookupController.search',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalLookupController.searchPreview',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/**
 * The jump to the first red question calls the lookup's focus()
 * (IMPL_PLAN_BLOCKED_MESSAGE §3). A lookup marked for a fix always HOLDS a
 * record, and then there is no search box — only the chosen record and its
 * clear button. focus() used to look for the box alone and did nothing, so a
 * Submit blocked by a marked lookup scrolled to it and left the cursor where
 * it was (UX review of the change).
 */
const flush = () => Promise.resolve().then(() => Promise.resolve());

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

const focusedInside = (el) => el.shadowRoot.activeElement;

describe('c-final-lookup focus()', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('puts the cursor in the search box when nothing is chosen', async () => {
        const el = mount();
        await flush();
        el.focus();
        expect(focusedInside(el)).toBe(
            el.shadowRoot.querySelector('.fl-input')
        );
    });

    it('while a record is held, the clear button takes the cursor', async () => {
        const el = mount({ value: '003a', displayLabel: 'Rose Gonzalez' });
        await flush();
        expect(el.shadowRoot.querySelector('.fl-input')).toBeNull();
        el.focus();
        expect(focusedInside(el)).toBe(
            el.shadowRoot.querySelector('.fl-clear')
        );
    });
});
