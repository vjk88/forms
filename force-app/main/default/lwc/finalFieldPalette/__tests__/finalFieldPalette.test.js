import { createElement } from 'lwc';
import FinalFieldPalette from 'c/finalFieldPalette';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';

jest.mock(
    '@salesforce/apex/FinalStudioController.describeFields',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const FIELDS = [
    { apiName: 'LastName', label: 'Last Name', inputType: 'text', required: true },
    { apiName: 'Email', label: 'Email', inputType: 'email', required: false }
];

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-field-palette', {
        is: FinalFieldPalette
    });
    Object.assign(el, { objectApi: 'Contact' }, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-field-palette', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('lists describe fields; used ones dim as ADDED and refuse re-add', async () => {
        const el = mount({ usedFields: ['Email'] });
        describeFields.emit(FIELDS);
        await flush();
        const items = el.shadowRoot.querySelectorAll('.fp-item');
        expect(items).toHaveLength(2);
        expect(
            el.shadowRoot.querySelector('.fp-item.added .fp-label').textContent
        ).toContain('Email');

        const handler = jest.fn();
        el.addEventListener('addfield', handler);
        items[1].click(); // Email = added → refused
        expect(handler).not.toHaveBeenCalled();
        items[0].click();
        expect(handler.mock.calls[0][0].detail.field.apiName).toBe('LastName');
    });

    it('Fields header names the primary object; absent without one', async () => {
        const el = mount();
        describeFields.emit(FIELDS);
        await flush();
        expect(
            el.shadowRoot.querySelector('.fp-head-label').textContent
        ).toBe('Fields — Contact');
        expect(el.shadowRoot.querySelector('.fp-head-sub').textContent).toBe(
            'primary object'
        );

        el.objectApi = undefined; // no target object → note, no header
        await flush();
        expect(el.shadowRoot.querySelector('.fp-head')).toBeNull();
        expect(el.shadowRoot.querySelector('.fp-note')).not.toBeNull();

        el.objectApi = 'Contact';
        await flush();
        el.shadowRoot.querySelector('[data-tab="blocks"]').click();
        await flush();
        expect(el.shadowRoot.querySelector('.fp-head')).toBeNull();
    });

    it('search filters; Blocks/Logic tabs are honest stubs', async () => {
        const el = mount();
        describeFields.emit(FIELDS);
        await flush();
        const search = el.shadowRoot.querySelector('.fp-search');
        search.value = 'email';
        search.dispatchEvent(new Event('input'));
        await flush();
        expect(el.shadowRoot.querySelectorAll('.fp-item')).toHaveLength(1);

        el.shadowRoot.querySelector('[data-tab="logic"]').click();
        await flush();
        expect(el.shadowRoot.querySelector('.fp-note').textContent).toContain(
            'rules slice'
        );
    });
});
