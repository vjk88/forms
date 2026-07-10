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
jest.mock(
    '@salesforce/apex/FormAssetController.uploadImage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FormAssetController.deleteImage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const FIELDS = [
    { apiName: 'Email', label: 'Email', inputType: 'email', required: false },
    {
        apiName: 'LastName',
        label: 'Last Name',
        inputType: 'text',
        required: true
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

const seg = (el, containerLabel) => {
    const flds = el.shadowRoot.querySelectorAll('.pp-fld');
    for (const fld of flds) {
        const label = fld.querySelector('.pp-label');
        if (label && label.textContent === containerLabel) {
            return fld.querySelectorAll('.pp-seg-btn');
        }
    }
    return null;
};

describe('c-final-property-panel (the FormStudio port)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('field inspector: label + Behavior segmented; the binding is READ-ONLY (never a picker)', async () => {
        const el = mount({
            kind: 'element',
            bindingObjectApi: 'Contact',
            node: {
                id: 'el_1',
                type: 'field',
                label: 'Email',
                required: false,
                binding: { object: 'Contact', field: 'Email' },
                config: { inputType: 'email' }
            }
        });
        await flush();

        // binding surfaces as info only — owner: the drag already chose it
        expect(el.shadowRoot.querySelector('.pp-sub').textContent).toContain(
            'Contact.Email'
        );
        expect(el.shadowRoot.querySelector('select.pp-binding')).toBeNull();

        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        const label = el.shadowRoot.querySelector('[data-prop="label"]');
        label.value = 'Work email';
        label.dispatchEvent(new CustomEvent('change'));

        const behavior = seg(el, 'Behavior');
        expect([...behavior].map((b) => b.textContent.trim())).toEqual([
            'Editable',
            'Required',
            'Read only'
        ]);
        behavior[1].click();
        expect(events).toEqual([
            { patch: { label: 'Work email' } },
            { patch: { required: true, readOnly: false } }
        ]);
    });

    it('Display as: picklist choices + the options editor emits configchange', async () => {
        const el = mount({
            kind: 'element',
            bindingObjectApi: 'Contact',
            node: {
                id: 'el_1',
                type: 'field',
                label: 'Level',
                binding: { object: 'Contact', field: 'Level__c' },
                config: {
                    inputType: 'picklist',
                    renderAs: 'Radio_Buttons',
                    options: [{ label: 'A', value: 'A' }]
                }
            }
        });
        await flush();
        const renderAs = el.shadowRoot.querySelector('.pp-renderas');
        expect(renderAs).not.toBeNull();
        const values = [...renderAs.querySelectorAll('option')].map(
            (o) => o.value
        );
        expect(values).toEqual(['Default', 'Radio_Buttons', 'Dropdown']);

        const events = [];
        el.addEventListener('configchange', (e) => events.push(e.detail));
        const optLabel = el.shadowRoot.querySelector(
            '.pp-optrow [data-field="label"]'
        );
        optLabel.value = 'Gold';
        optLabel.dispatchEvent(new CustomEvent('change'));
        expect(events[0].patch.options).toEqual([
            { label: 'Gold', value: 'A' }
        ]);

        el.shadowRoot.querySelector('.pp-add').click();
        expect(events[1].patch.options).toHaveLength(2);
    });

    it('Width renders ONLY in multi-column sections and spans segmented (legacy showWidth)', async () => {
        const one = mount({
            kind: 'element',
            sectionColumns: 1,
            node: { id: 'el_1', type: 'field', label: 'A', config: {} }
        });
        await flush();
        expect(seg(one, 'Width')).toBeNull();
        document.body.removeChild(one);

        const el = mount({
            kind: 'element',
            sectionColumns: 3,
            node: {
                id: 'el_1',
                type: 'field',
                label: 'A',
                width: 1,
                config: {}
            }
        });
        await flush();
        const width = seg(el, 'Width');
        expect([...width].map((b) => b.textContent.trim())).toEqual([
            '1',
            '2',
            'Full'
        ]);
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        width[2].click();
        expect(events).toEqual([{ patch: { width: 3 } }]);
    });

    it('content inspectors: callout tone, spacer size, consent acceptance (all segmented)', async () => {
        const callout = mount({
            kind: 'element',
            node: {
                id: 'el_c',
                type: 'callout',
                label: 'Callout',
                config: { variant: 'info', html: '' }
            }
        });
        await flush();
        const cfg = [];
        callout.addEventListener('configchange', (e) => cfg.push(e.detail));
        seg(callout, 'Tone')[2].click(); // Warning
        expect(cfg).toEqual([{ patch: { variant: 'warning' } }]);
        document.body.removeChild(callout);

        const spacer = mount({
            kind: 'element',
            node: {
                id: 'el_s',
                type: 'spacer',
                label: 'Spacer',
                config: { size: 'medium' }
            }
        });
        await flush();
        const sc = [];
        spacer.addEventListener('configchange', (e) => sc.push(e.detail));
        seg(spacer, 'Size')[2].click();
        expect(sc).toEqual([{ patch: { size: 'large' } }]);
        document.body.removeChild(spacer);

        const consent = mount({
            kind: 'element',
            node: {
                id: 'el_k',
                type: 'consent',
                label: 'Consent',
                required: true,
                config: { html: '<p>Terms</p>' }
            }
        });
        await flush();
        const pc = [];
        consent.addEventListener('propchange', (e) => pc.push(e.detail));
        seg(consent, 'Acceptance')[1].click(); // Optional
        expect(pc).toEqual([{ patch: { required: false } }]);
    });

    it('Empty space: the 1-column note; standalone Block style emits blockstylechange', async () => {
        const empty = mount({
            kind: 'element',
            sectionColumns: 1,
            node: { id: 'el_e', type: 'emptySpace', label: 'Empty space' }
        });
        await flush();
        expect(
            empty.shadowRoot.querySelector('.pp-hint').textContent
        ).toContain('more than one column');
        document.body.removeChild(empty);

        const block = mount({
            kind: 'element',
            blockStyle: 'plain',
            node: {
                id: 'el_r',
                type: 'richText',
                label: 'Display text',
                config: { html: '' }
            }
        });
        await flush();
        const changes = [];
        block.addEventListener('blockstylechange', (e) =>
            changes.push(e.detail)
        );
        seg(block, 'Block style')[1].click(); // Card
        expect(changes).toEqual([{ style: 'card' }]);
    });

    it('section inspector = the legacy surface: columns 1-4, header toggle + icon picker, collapsible', async () => {
        const el = mount({
            kind: 'section',
            node: {
                id: 'sec_1',
                title: 'Contact',
                columns: 1,
                elements: [],
                showHeader: true
            }
        });
        await flush();
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));

        const cols = seg(el, 'Columns');
        expect(cols).toHaveLength(4);
        cols[3].click();
        expect(events.at(-1)).toEqual({ patch: { columns: 4 } });

        // icon picker: search narrows, pick emits utility:name
        const search = el.shadowRoot.querySelector('.pp-icsearch input');
        search.value = 'email';
        search.dispatchEvent(new Event('input'));
        await flush();
        const icons = el.shadowRoot.querySelectorAll('.pp-ic');
        expect(icons).toHaveLength(1);
        icons[0].click();
        expect(events.at(-1)).toEqual({ patch: { icon: 'utility:email' } });

        // header + collapsible toggles
        const toggles = el.shadowRoot.querySelectorAll('.pp-toggle');
        expect(toggles[0].textContent.trim()).toBe('Header shown');
        toggles[0].click();
        expect(events.at(-1)).toEqual({ patch: { showHeader: false } });
        toggles[1].click();
        expect(events.at(-1)).toEqual({ patch: { collapsible: true } });

        // NO delete button anywhere (owner delta)
        expect(el.shadowRoot.textContent).not.toContain('Delete');
    });

    it('repeater inspector stays DEDICATED: legacy labels, max 0 = unlimited, child dedupe', async () => {
        const el = mount({
            kind: 'section',
            node: {
                id: 'sec_r',
                title: 'Team',
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
                    min: 1,
                    max: null
                }
            }
        });
        describeFields.emit(FIELDS);
        await flush();

        // dedicated: repeat controls, never the section surface
        expect(seg(el, 'Display style')).toHaveLength(3);
        expect(seg(el, 'Columns')).toBeNull();
        expect(el.shadowRoot.querySelector('.pp-ro').textContent).toBe(
            'Contact'
        );

        const reps = [];
        el.addEventListener('repeatchange', (e) => reps.push(e.detail));
        const max = el.shadowRoot.querySelector('[data-prop="max"]');
        max.value = '0';
        max.dispatchEvent(new CustomEvent('change'));
        expect(reps).toEqual([{ patch: { max: null } }]); // 0 = unlimited

        const rows = el.shadowRoot.querySelectorAll('.pp-childfield');
        expect(rows).toHaveLength(2);
        const adds = [];
        el.addEventListener('addchildfield', (e) => adds.push(e.detail));
        el.shadowRoot
            .querySelector('.pp-childfield[data-api="LastName"]')
            .click(); // ADDED → refused
        el.shadowRoot.querySelector('.pp-childfield[data-api="Email"]').click();
        expect(adds).toHaveLength(1);
        expect(adds[0].field.apiName).toBe('Email');
    });

    it('visibility group renders on every inspector (rule editor present)', async () => {
        const el = mount({
            kind: 'page',
            node: { id: 'pg_1', name: 'Details', sections: [] },
            ruleSources: [{ id: 'el_1', label: 'Email' }]
        });
        await flush();
        expect(
            el.shadowRoot.querySelector('c-final-rule-editor')
        ).not.toBeNull();
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        const name = el.shadowRoot.querySelector('[data-prop="pagename"]');
        name.value = 'About you';
        name.dispatchEvent(new CustomEvent('change'));
        expect(events).toEqual([{ patch: { name: 'About you' } }]);
    });
});
