import { createElement } from 'lwc';
import FinalPropertyPanel from 'c/finalPropertyPanel';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';

/** Appearance picker (IMPL_PLAN_APPEARANCE_PICKER, DEFERRED 36): one picker
 *  replaces "Display as" + "Choice look" on choice fields. */

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
    '@salesforce/apex/FinalLookupController.listLookupObjects',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAssetController.uploadImage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAssetController.deleteImage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const OWN = [
    { label: 'Power', value: 'Electrical', emoji: '⚡', description: 'Wiring' },
    { label: 'Devices', value: 'Electronic' },
    { label: 'Walls', value: 'Structural' }
];
const SCHEMA = [
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Electronic', label: 'Electronic' },
    { value: 'Structural', label: 'Structural' }
];

function mount(node, extra = {}) {
    const el = createElement('c-final-property-panel', {
        is: FinalPropertyPanel
    });
    Object.assign(el, { kind: 'element', node, ...extra });
    document.body.appendChild(el);
    return el;
}

const bound = (config) => ({
    id: 'el_type',
    type: 'field',
    label: 'Case Type',
    binding: { object: 'Case', field: 'Type' },
    config: {
        inputType: 'picklist',
        options: OWN,
        schemaOptions: SCHEMA,
        ...config
    }
});

const textField = (config) => ({
    id: 'el_topic',
    type: 'field',
    label: 'Topics',
    binding: { object: 'Case', field: 'Topics__c' },
    config: { inputType: 'text', options: OWN, ...config }
});

const flush = () => Promise.resolve();
const $ = (el, sel) => el.shadowRoot.querySelector(sel);
const $$ = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];
const tile = (el, look) => $(el, `.pp-look[data-look="${look}"]`);
const picked = (el) =>
    $$(el, '.pp-look')
        .filter((t) => t.getAttribute('aria-checked') === 'true')
        .map((t) => t.dataset.look);
const listen = (el, name) => {
    const events = [];
    el.addEventListener(name, (e) => events.push(e.detail.patch));
    return events;
};

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('Appearance picker', () => {
    it('bug 36: Chips then Dropdown really becomes a dropdown (both keys written)', async () => {
        const el = mount(
            bound({ renderAs: 'Radio_Buttons', optionStyle: 'chips' })
        );
        await flush();
        expect(picked(el)).toEqual(['chips']);
        const events = listen(el, 'configchange');
        tile(el, 'dropdown').click();
        expect(events).toEqual([
            { renderAs: 'Dropdown', optionStyle: undefined }
        ]);
        expect('optionStyle' in events[0]).toBe(true);
    });

    it('a form stuck in the old bug opens on the look respondents see', async () => {
        const el = mount(bound({ renderAs: 'Dropdown', optionStyle: 'chips' }));
        await flush();
        expect(picked(el)).toEqual(['chips']);
    });

    it('the form-level default decides the tile when the field has none', async () => {
        const el = mount(bound({ renderAs: undefined }), {
            fieldDefaults: { picklist: 'Radio_Buttons' }
        });
        await flush();
        expect(picked(el)).toEqual(['radio']);
    });

    it('the old Choice look row and its explainer are gone', async () => {
        const el = mount(bound({ renderAs: 'Radio_Buttons' }));
        await flush();
        const text = el.shadowRoot.textContent;
        expect(text).not.toContain('Choice look');
        expect(text).not.toContain('"Display as" picks the control');
    });

    it('tiles are one radio group with a roving tab stop', async () => {
        const el = mount(bound({ renderAs: 'Dropdown' }));
        await flush();
        expect($(el, '.pp-looks').getAttribute('role')).toBe('radiogroup');
        const stops = $$(el, '.pp-look').map((t) => t.getAttribute('tabindex'));
        expect(stops).toEqual(['-1', '0', '-1', '-1', '-1']);
    });

    it('arrow keys move through the tiles and pick', async () => {
        const el = mount(bound({ renderAs: 'Dropdown' }));
        await flush();
        const events = listen(el, 'configchange');
        $(el, '.pp-looks').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
        );
        $(el, '.pp-looks').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
        );
        expect(events[0]).toEqual({
            renderAs: 'Radio_Buttons',
            optionStyle: undefined
        });
        expect(events[1].renderAs).toBe('Default');
    });

    describe('Default to schema on a picklist', () => {
        it("shows Salesforce's choices read-only, not the editable rows", async () => {
            const el = mount(bound({ renderAs: 'Default' }));
            await flush();
            expect(picked(el)).toEqual(['default']);
            expect($(el, '.pp-optrow')).toBeNull();
            expect($(el, '.pp-add')).toBeNull();
            const rows = $$(el, 'li.pp-schema-row').map((r) =>
                r.textContent.trim()
            );
            expect(rows).toHaveLength(3);
            expect(rows[0]).toContain('Electrical');
            expect(rows[0]).not.toContain('⚡');
            expect(el.shadowRoot.textContent).toContain(
                'These are this field’s choices in Salesforce.'
            );
        });

        it('picking it refreshes Salesforce’s choices from describe', async () => {
            const el = mount(bound({ renderAs: 'Dropdown' }));
            await flush();
            describeFields.emit([
                {
                    apiName: 'Type',
                    options: [
                        { value: 'Electrical', label: 'Electrical' },
                        { value: 'Mechanical', label: 'Mechanical' }
                    ]
                }
            ]);
            await flush();
            const events = listen(el, 'configchange');
            tile(el, 'default').click();
            expect(events[0]).toEqual({
                renderAs: 'Default',
                optionStyle: undefined,
                schemaOptions: [
                    { value: 'Electrical', label: 'Electrical' },
                    { value: 'Mechanical', label: 'Mechanical' }
                ]
            });
        });

        it("the author's own rows are kept for when another look is picked", async () => {
            const el = mount(bound({ renderAs: 'Default' }));
            await flush();
            const events = listen(el, 'configchange');
            tile(el, 'cards').click();
            // no options patch: the rows were never touched
            expect(events).toEqual([
                { renderAs: 'Radio_Buttons', optionStyle: 'cards' }
            ]);
        });

        it('a picklist never offers several answers (Salesforce decides)', async () => {
            const el = mount(bound({ renderAs: 'Radio_Buttons' }));
            await flush();
            expect($(el, '.pp-several')).toBeNull();
        });
    });

    describe('Allow several answers (text fields with own options)', () => {
        it('shows under the tiles, and turning it on makes Radio list Checkboxes', async () => {
            const el = mount(textField({ renderAs: 'Radio_Buttons' }));
            await flush();
            expect($(el, '.pp-several')).not.toBeNull();
            const events = listen(el, 'configchange');
            const sw = $(el, '[data-rule="several"]');
            sw.checked = true;
            sw.dispatchEvent(new CustomEvent('change'));
            expect(events).toEqual([
                { renderAs: 'Checkbox_Group', optionStyle: undefined }
            ]);
        });

        it('a multi field shows Checkboxes on the radio tile, and chips keep it', async () => {
            const el = mount(textField({ renderAs: 'Checkbox_Group' }));
            await flush();
            expect(tile(el, 'radio').textContent).toContain('Checkboxes');
            const events = listen(el, 'configchange');
            tile(el, 'chips').click();
            expect(events).toEqual([
                { renderAs: 'Checkbox_Group', optionStyle: 'chips' }
            ]);
        });

        it('is greyed on Dropdown', async () => {
            const el = mount(textField({ renderAs: 'Dropdown' }));
            await flush();
            expect($(el, '[data-rule="several"]').disabled).toBe(true);
            expect(el.shadowRoot.textContent).toContain(
                'A dropdown takes one answer.'
            );
        });

        it('a text field on Default is a text box: no switch, no options', async () => {
            const el = mount(textField({ renderAs: 'Default' }));
            await flush();
            expect($(el, '.pp-several')).toBeNull();
            expect($(el, '.pp-options')).toBeNull();
            expect(tile(el, 'default').textContent).toContain(
                'A plain text box.'
            );
        });
    });

    it('an unbound choice question has no Default tile and offers several answers', async () => {
        const el = mount({
            id: 'q1',
            type: 'field',
            label: 'Choose any that apply',
            config: {
                inputType: 'picklist',
                renderAs: 'Checkbox_Group',
                options: OWN
            }
        });
        await flush();
        expect(tile(el, 'default')).toBeNull();
        expect(picked(el)).toEqual(['radio']);
        expect($(el, '[data-rule="several"]').checked).toBe(true);
    });

    it('a field with no rows yet gets Salesforce’s choices to start from', async () => {
        const el = mount(bound({ renderAs: 'Default', options: [] }));
        await flush();
        const events = listen(el, 'configchange');
        tile(el, 'radio').click();
        expect(events[0].options).toEqual([
            { label: 'Electrical', value: 'Electrical' },
            { label: 'Electronic', value: 'Electronic' },
            { label: 'Structural', value: 'Structural' }
        ]);
    });

    it('the Other switch sits with the options for radio, chips and cards', async () => {
        const radio = mount(textField({ renderAs: 'Radio_Buttons' }));
        await flush();
        expect(radio.shadowRoot.textContent).toContain(
            'Allow “Other…” with free text'
        );
        document.body.removeChild(radio);
        const dd = mount(textField({ renderAs: 'Dropdown' }));
        await flush();
        expect(dd.shadowRoot.textContent).not.toContain('Allow “Other…”');
    });

    it('Text & guidance holds help, caption, show-caption-as and placeholder', async () => {
        const el = mount(bound({ renderAs: 'Default' }));
        await flush();
        const group = $(el, '.pp-guidance');
        expect(group.querySelector('.pp-grouptitle').textContent).toBe(
            'Text & guidance'
        );
        expect(group.querySelector('[data-prop="help"]')).not.toBeNull();
        expect(group.querySelector('[data-prop="placeholder"]')).not.toBeNull();
        expect(group.textContent).toContain('Show caption as');
        expect(el.shadowRoot.textContent).not.toContain('Advanced');
    });

    it('other field types keep the Display as list', async () => {
        const el = mount({
            id: 'el_n',
            type: 'field',
            label: 'Budget',
            binding: { object: 'Case', field: 'Budget__c' },
            config: { inputType: 'number' }
        });
        await flush();
        expect($(el, '.pp-looks')).toBeNull();
        expect($(el, '.pp-renderas')).not.toBeNull();
    });
});

describe('reordering options (the ⋮⋮ handle)', () => {
    const grips = (el) => $$(el, '.pp-grip');

    it('↑ / ↓ move the whole option (label, value, emoji, sublabel) and say where', async () => {
        const el = mount(
            textField({ renderAs: 'Radio_Buttons', optionStyle: 'cards' })
        );
        await flush();
        const events = listen(el, 'configchange');
        grips(el)[0].dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown' })
        );
        expect(events[0].options).toEqual([OWN[1], OWN[0], OWN[2]]);
        await flush();
        expect($(el, '.pp-sr').textContent).toBe('Power, position 2 of 3');
    });

    it('the first row cannot go up and the last cannot go down', async () => {
        const el = mount(textField({ renderAs: 'Radio_Buttons' }));
        await flush();
        const events = listen(el, 'configchange');
        grips(el)[0].dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowUp' })
        );
        grips(el)[2].dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown' })
        );
        expect(events).toEqual([]);
    });

    it('drag and drop moves a row below another', async () => {
        const el = mount(textField({ renderAs: 'Radio_Buttons' }));
        await flush();
        const events = listen(el, 'configchange');
        const rows = $$(el, '.pp-optgroup');
        rows[2].getBoundingClientRect = () => ({ top: 0, height: 40 });
        grips(el)[0].dispatchEvent(new CustomEvent('dragstart'));
        const over = new CustomEvent('dragover', { cancelable: true });
        over.clientY = 30; // lower half: after the last row
        rows[2].dispatchEvent(over);
        expect(over.defaultPrevented).toBe(true);
        await flush();
        expect($$(el, '.pp-optgroup')[2].classList.contains('drop-after')).toBe(
            true
        );
        rows[2].dispatchEvent(new CustomEvent('drop', { cancelable: true }));
        expect(events[0].options).toEqual([OWN[1], OWN[2], OWN[0]]);
    });

    it('a drag that did not start on an option is not accepted', async () => {
        const el = mount(textField({ renderAs: 'Radio_Buttons' }));
        await flush();
        const over = new CustomEvent('dragover', { cancelable: true });
        $$(el, '.pp-optgroup')[1].dispatchEvent(over);
        expect(over.defaultPrevented).toBe(false);
    });

    it('the handle has a name that says how to use it', async () => {
        const el = mount(textField({ renderAs: 'Radio_Buttons' }));
        await flush();
        // the position is announced once, by the live region after a move
        expect(grips(el)[1].getAttribute('aria-label')).toBe(
            'Move Devices. Use the up and down arrow keys.'
        );
        expect(
            $(el, '.pp-optrow [data-field="label"]').getAttribute('aria-label')
        ).toBe('Option 1 label');
        expect($(el, '.pp-x').getAttribute('aria-label')).toBe('Remove Power');
    });

    it('removing the last option keeps a blank row, so Chips stays Chips', async () => {
        const el = mount(
            textField({
                renderAs: 'Radio_Buttons',
                optionStyle: 'chips',
                options: [OWN[0]]
            })
        );
        await flush();
        const events = listen(el, 'configchange');
        $(el, '.pp-x').click();
        expect(events).toEqual([{ options: [{ label: '', value: '' }] }]);
    });
});
