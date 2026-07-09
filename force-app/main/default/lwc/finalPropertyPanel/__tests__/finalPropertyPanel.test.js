import { createElement } from 'lwc';
import FinalPropertyPanel from 'c/finalPropertyPanel';
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
    { apiName: 'Email', label: 'Email', inputType: 'email', required: false },
    {
        apiName: 'LastName',
        label: 'Last Name',
        inputType: 'text',
        required: true
    },
    {
        apiName: 'Level__c',
        label: 'Level',
        inputType: 'picklist',
        required: false,
        options: [{ value: 'A', label: 'A' }]
    }
];

function mount(props) {
    const el = createElement('c-final-property-panel', {
        is: FinalPropertyPanel
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve();

describe('c-final-property-panel', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('field inspector edits label/required/placeholder and emits intents', async () => {
        const el = mount({
            kind: 'element',
            bindingObjectApi: 'Contact',
            usedFields: ['Email'],
            node: {
                id: 'el_1',
                type: 'field',
                label: 'Email',
                required: false,
                binding: { object: 'Contact', field: 'Email' },
                config: { inputType: 'email' }
            }
        });
        describeFields.emit(FIELDS);
        await flush();

        expect(el.shadowRoot.querySelector('.pp-sub').textContent).toContain(
            'Contact.Email'
        );

        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        const label = el.shadowRoot.querySelector('[data-prop="label"]');
        label.value = 'Work email';
        label.dispatchEvent(new CustomEvent('change'));

        const required = el.shadowRoot.querySelector('[data-prop="required"]');
        required.checked = true;
        required.dispatchEvent(new CustomEvent('change'));

        expect(events).toEqual([
            { patch: { label: 'Work email' } },
            { patch: { required: true } }
        ]);
    });

    it('binding picker lists fields, disables ones taken ELSEWHERE, emits bindingchange', async () => {
        const el = mount({
            kind: 'element',
            bindingObjectApi: 'Contact',
            usedFields: ['Email', 'LastName'], // Email is its OWN binding
            node: {
                id: 'el_1',
                type: 'field',
                label: 'Email',
                binding: { object: 'Contact', field: 'Email' },
                config: {}
            }
        });
        describeFields.emit(FIELDS);
        await flush();

        const options = el.shadowRoot.querySelectorAll('.pp-binding option');
        const byValue = {};
        options.forEach((o) => {
            byValue[o.value] = o;
        });
        expect(byValue.Email.disabled).toBe(false); // own binding stays pickable
        expect(byValue.LastName.disabled).toBe(true); // taken elsewhere

        const picks = [];
        el.addEventListener('bindingchange', (e) => picks.push(e.detail));
        const select = el.shadowRoot.querySelector('.pp-binding');
        select.value = 'Level__c';
        select.dispatchEvent(new CustomEvent('change'));
        expect(picks[0].field.apiName).toBe('Level__c');
        expect(picks[0].field.options).toBeTruthy();
    });

    it('unbound field shows the placeholder option and an honest subtitle', async () => {
        const el = mount({
            kind: 'element',
            bindingObjectApi: 'Contact',
            usedFields: [],
            node: { id: 'el_1', type: 'field', label: 'First name' }
        });
        describeFields.emit(FIELDS);
        await flush();
        expect(el.shadowRoot.querySelector('.pp-sub').textContent).toContain(
            'not bound'
        );
        const first = el.shadowRoot.querySelector('.pp-binding option');
        expect(first.textContent).toContain('Not bound');
    });

    it('per-type inspectors: spacer edits height, divider has no settings (§5)', async () => {
        const el = mount({
            kind: 'element',
            node: {
                id: 'el_s',
                type: 'spacer',
                label: 'Spacer',
                config: { height: 24 }
            }
        });
        await flush();
        const events = [];
        el.addEventListener('configchange', (e) => events.push(e.detail));
        const height = el.shadowRoot.querySelector('[data-prop="height"]');
        height.value = '48';
        height.dispatchEvent(new CustomEvent('change'));
        expect(events).toEqual([{ patch: { height: 48 } }]);

        el.node = { id: 'el_d', type: 'divider', label: 'Divider' };
        await flush();
        expect(el.shadowRoot.querySelector('.pp-hint').textContent).toContain(
            'no settings'
        );
        expect(el.shadowRoot.querySelector('[data-prop]')).toBeNull();
    });

    it('section inspector edits title/columns/style — never shown for repeaters', async () => {
        const el = mount({
            kind: 'section',
            node: { id: 'sec_1', title: 'Contact', columns: 1, elements: [] }
        });
        await flush();
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        const cols = el.shadowRoot.querySelector('.pp-columns');
        cols.value = '2';
        cols.dispatchEvent(new CustomEvent('change'));
        expect(events).toEqual([{ patch: { columns: 2 } }]);
    });

    it('repeater inspector is DEDICATED (§4): repeat props + child fields deduped in-section', async () => {
        const el = mount({
            kind: 'section',
            node: {
                id: 'sec_r',
                title: 'Team members',
                elements: [
                    {
                        id: 'el_c1',
                        type: 'field',
                        label: 'Last Name',
                        binding: { object: 'Contact', field: 'LastName' }
                    }
                ],
                repeat: {
                    childObject: 'Contact',
                    relationshipField: 'AccountId',
                    style: 'stacked',
                    addLabel: 'Add Contact',
                    entryLabel: 'Contact {index}',
                    min: 1,
                    max: null
                }
            }
        });
        describeFields.emit(FIELDS);
        await flush();

        // dedicated: repeat controls present, generic section style select absent
        expect(el.shadowRoot.querySelector('.pp-repstyle')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.pp-style')).toBeNull();
        expect(el.shadowRoot.querySelector('.pp-sub').textContent).toContain(
            'Contact'
        );

        const rows = el.shadowRoot.querySelectorAll('.pp-childfield');
        expect(rows).toHaveLength(3);
        const added = el.shadowRoot.querySelector('.pp-childfield.added');
        expect(added.textContent).toContain('Last Name');

        const adds = [];
        el.addEventListener('addchildfield', (e) => adds.push(e.detail));
        // an ADDED row refuses the click
        added.click();
        // a fresh row adds
        el.shadowRoot.querySelector('.pp-childfield[data-api="Email"]').click();
        expect(adds).toHaveLength(1);
        expect(adds[0].field.apiName).toBe('Email');

        const reps = [];
        el.addEventListener('repeatchange', (e) => reps.push(e.detail));
        const style = el.shadowRoot.querySelector('.pp-repstyle');
        style.value = 'table';
        style.dispatchEvent(new CustomEvent('change'));
        expect(reps).toEqual([{ patch: { style: 'table' } }]);
    });

    it('page inspector renames the page', async () => {
        const el = mount({
            kind: 'page',
            node: { id: 'pg_1', name: 'Details', sections: [] }
        });
        await flush();
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        const name = el.shadowRoot.querySelector('[data-prop="pagename"]');
        name.value = 'About you';
        name.dispatchEvent(new CustomEvent('change'));
        expect(events).toEqual([{ patch: { name: 'About you' } }]);
    });
});
