import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock('@salesforce/user/isGuest', () => ({ default: true }), {
    virtual: true
});

/**
 * Address search for a GUEST (public site): the viewer stamps
 * element.address = { formId, searchable, guest, ticket }. A guest searches
 * with the page's bot-check ticket, so no ticket means no box.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

function renderers(root, out = []) {
    for (const el of root.querySelectorAll('*')) {
        if (el.tagName === 'C-FINAL-ELEMENT-RENDERER') {
            out.push(el);
        }
        if (el.shadowRoot) {
            renderers(el.shadowRoot, out);
        }
    }
    return out;
}

const spec = (addressSearch) => ({
    specVersion: 1,
    form: { name: 'Guest' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    submit: { label: 'Submit' },
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    title: 'S',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_addr',
                            type: 'field',
                            label: 'Home address',
                            config: { inputType: 'address', addressSearch }
                        }
                    ]
                }
            ]
        }
    ]
});

async function mount(addressSearch, guestTicket) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = spec(addressSearch);
    el.formId = 'a0F1';
    if (guestTicket !== undefined) {
        el.guestTicket = guestTicket;
    }
    document.body.appendChild(el);
    await flush();
    return el;
}

const stamp = (el) =>
    renderers(el.shadowRoot).find((r) => r.element.id === 'el_addr').element
        .address;

describe('c-final-form-viewer: guest address search', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('with search on and a ticket: searchable, guest, carrying the ticket', async () => {
        const el = await mount(true, 'tk.sig');
        expect(stamp(el)).toEqual({
            formId: 'a0F1',
            searchable: true,
            guest: true,
            ticket: 'tk.sig'
        });
    });

    it('without a ticket there is no search box', async () => {
        const el = await mount(true);
        expect(stamp(el).searchable).toBe(false);
        expect(stamp(el).guest).toBe(true);
        expect(stamp(el).ticket).toBeNull();
    });

    it('with search switched off it is not searchable even with a ticket', async () => {
        const el = await mount(false, 'tk.sig');
        expect(stamp(el).searchable).toBe(false);
    });

    it('picks up a ticket that arrives later, and a refreshed one', async () => {
        const el = await mount(true);
        expect(stamp(el).searchable).toBe(false);
        el.guestTicket = 'first.sig';
        await flush();
        expect(stamp(el).searchable).toBe(true);
        expect(stamp(el).ticket).toBe('first.sig');
        el.guestTicket = 'second.sig';
        await flush();
        expect(stamp(el).ticket).toBe('second.sig');
    });
});
