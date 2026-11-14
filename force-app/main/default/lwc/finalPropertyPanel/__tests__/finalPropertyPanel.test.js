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
    '@salesforce/apex/FinalLookupController.listLookupObjects',
    () => ({
        default: jest.fn(() =>
            Promise.resolve([
                { label: 'Account', value: 'Account' },
                { label: 'User', value: 'User' }
            ])
        )
    }),
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

/** The Header / Collapsible / Starts-collapsed switches are lightning-input
 *  toggles: their words are the on/off messages, the state is `checked`. */
function switchWords(t) {
    if (t.checked) {
        return t.messageToggleActive;
    }
    return t.messageToggleInactive;
}
const flipSwitch = (t) => {
    t.checked = !t.checked;
    t.dispatchEvent(new CustomEvent('change'));
};

const seg = (el, containerLabel) => {
    const flds = el.shadowRoot.querySelectorAll('.pp-fld');
    for (const fld of flds) {
        const label = fld.querySelector('.pp-label');
        if (label && label.textContent === containerLabel) {
            // the row is a c-final-button-group (DESIGN_SYSTEM 5.7)
            const group = fld.querySelector('c-final-button-group');
            return group ? group.shadowRoot.querySelectorAll('button') : [];
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

    it('field inspector: label + Rules switches; the binding is READ-ONLY (never a picker)', async () => {
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

        // Rules: two switches. A required read-only field can't be answered,
        // so turning one on turns the other off.
        const rule = (name) =>
            el.shadowRoot.querySelector(`.pp-rules [data-rule="${name}"]`);
        expect(rule('required').label).toBe('Required');
        expect(rule('readOnly').label).toBe('Read only');
        rule('required').checked = true;
        rule('required').dispatchEvent(new CustomEvent('change'));
        rule('readOnly').checked = true;
        rule('readOnly').dispatchEvent(new CustomEvent('change'));
        rule('readOnly').checked = false;
        rule('readOnly').dispatchEvent(new CustomEvent('change'));
        expect(events).toEqual([
            { patch: { label: 'Work email' } },
            { patch: { required: true, readOnly: false } },
            { patch: { readOnly: true, required: false } },
            { patch: { readOnly: false } }
        ]);
        // the old three-way Behavior control is gone
        expect(seg(el, 'Behavior')).toBeNull();
    });

    it('Appearance tiles on a picklist + the options editor emits configchange', async () => {
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
        // choice fields pick their look with tiles, not the Display as list
        expect(el.shadowRoot.querySelector('.pp-renderas')).toBeNull();
        // the tiles live inside c-final-picture-choice (DESIGN_SYSTEM 5.24)
        const tiles = [
            ...el.shadowRoot
                .querySelector('c-final-picture-choice')
                .shadowRoot.querySelectorAll('.pc-tile')
        ];
        expect(tiles.map((t) => t.dataset.value)).toEqual([
            'default',
            'dropdown',
            'radio',
            'chips',
            'cards'
        ]);
        expect(
            tiles
                .filter((t) => t.getAttribute('aria-checked') === 'true')
                .map((t) => t.dataset.value)
        ).toEqual(['radio']);

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

    it('a new option takes its label as its value once; both are required and values are unique (owner 2026-09-27)', async () => {
        const choice = (options, optionStyle) => ({
            kind: 'element',
            node: {
                id: 'el_1',
                type: 'field',
                label: 'Tier',
                config: {
                    inputType: 'picklist',
                    renderAs: 'Radio_Buttons',
                    optionStyle,
                    options
                }
            }
        });
        const el = mount(choice([{ label: '', value: '' }]));
        await flush();
        const events = [];
        el.addEventListener('configchange', (e) => events.push(e.detail));
        const label = el.shadowRoot.querySelector(
            '.pp-optrow [data-field="label"]'
        );
        label.value = 'Gold';
        label.dispatchEvent(new CustomEvent('change'));
        expect(events[0].patch.options).toEqual([
            { label: 'Gold', value: 'Gold' }
        ]);
        // a row nobody has typed in yet stays quiet
        expect(el.shadowRoot.querySelector('.pp-opt-problem')).toBeNull();
        // a plain radio can't draw a sublabel, so none is offered
        expect(el.shadowRoot.querySelector('.pp-sublabel')).toBeNull();
        document.body.removeChild(el);

        const dup = mount(
            choice(
                [
                    { label: 'Gold', value: 'Gold' },
                    { label: 'Platinum', value: 'Gold' }
                ],
                'cards'
            )
        );
        await flush();
        const problems = [
            ...dup.shadowRoot.querySelectorAll('.pp-opt-problem')
        ].map((p) => p.textContent.trim());
        // only the later row, and only its value box
        expect(problems).toEqual([
            'Same value as option 1. Each value must be different.'
        ]);
        const bad = [...dup.shadowRoot.querySelectorAll('.pp-input-bad')].map(
            (i) => i.dataset.field
        );
        expect(bad).toEqual(['value']);
        expect(dup.shadowRoot.querySelector('.pp-sublabel')).not.toBeNull();
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
        const search = el.shadowRoot.querySelector(
            '.pp-icsearch lightning-input'
        );
        search.value = 'email';
        search.dispatchEvent(new CustomEvent('change'));
        await flush();
        const icons = el.shadowRoot.querySelectorAll('.pp-ic');
        expect(icons).toHaveLength(1);
        icons[0].click();
        expect(events.at(-1)).toEqual({ patch: { icon: 'utility:email' } });

        // header + collapsible toggles
        const toggles = el.shadowRoot.querySelectorAll('.pp-switch');
        expect(switchWords(toggles[0])).toBe('Header shown');
        flipSwitch(toggles[0]);
        expect(events.at(-1)).toEqual({ patch: { showHeader: false } });
        flipSwitch(toggles[1]);
        expect(events.at(-1)).toEqual({ patch: { collapsible: true } });

        // NO delete button anywhere (owner delta)
        expect(el.shadowRoot.textContent).not.toContain('Delete');
    });

    describe('a heading the layout tucks away (the page name is already in the navigation)', () => {
        const SECTION = {
            id: 'sec_1',
            title: 'Contact details',
            elements: []
        };
        const hint = (el) =>
            el.shadowRoot.querySelector('[data-id="header-repeat"]');

        it('says why the heading is not on the preview, and the toggle reads off', async () => {
            const el = mount({
                kind: 'section',
                node: SECTION,
                headerRepeat: {
                    pageName: 'Details',
                    by: 'side rail',
                    always: false
                }
            });
            await flush();
            const toggle = el.shadowRoot.querySelector('.pp-switch');
            expect(switchWords(toggle)).toBe('Header hidden');
            expect(toggle.checked).toBe(false);
            const text = hint(el).textContent;
            expect(text).toContain('The side rail already names this page');
            expect(text).toContain('“Details”');
            expect(text).toContain('Screen readers still read it');
            // 'wide': the phone gets the heading back, and the panel says so
            expect(text).toContain('On a narrow screen');
            // no icon picker while the header is off
            expect(el.shadowRoot.querySelector('.pp-icsearch')).toBeNull();
        });

        it('"always": no promise about a narrow screen', async () => {
            const el = mount({
                kind: 'section',
                node: SECTION,
                headerRepeat: { pageName: 'Details', by: 'tab', always: true }
            });
            await flush();
            expect(hint(el).textContent).toContain(
                'The tab already names this page'
            );
            expect(hint(el).textContent).not.toContain('narrow screen');
        });

        it('the first click switches the header ON (an explicit true), which is what shows it anyway', async () => {
            const el = mount({
                kind: 'section',
                node: SECTION,
                headerRepeat: { pageName: 'Details', by: 'tab', always: true }
            });
            await flush();
            const events = [];
            el.addEventListener('propchange', (e) => events.push(e.detail));
            flipSwitch(el.shadowRoot.querySelector('.pp-switch'));
            expect(events).toEqual([{ patch: { showHeader: true } }]);
        });

        it('no explanation when the heading is on screen, and the toggle says shown', async () => {
            const el = mount({ kind: 'section', node: SECTION });
            await flush();
            expect(hint(el)).toBeNull();
            expect(switchWords(el.shadowRoot.querySelector('.pp-switch'))).toBe(
                'Header shown'
            );
        });

        it('a header the author hid by hand shows no explanation (it is simply off)', async () => {
            const el = mount({
                kind: 'section',
                node: { ...SECTION, showHeader: false }
            });
            await flush();
            expect(hint(el)).toBeNull();
            expect(switchWords(el.shadowRoot.querySelector('.pp-switch'))).toBe(
                'Header hidden'
            );
        });
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

    describe('repeating group settings (IMPL_PLAN_RELATED_RECORDS §5–§7)', () => {
        const group = (repeat = {}) =>
            mount({
                kind: 'section',
                node: {
                    id: 'sec_r',
                    title: 'Team',
                    elements: [],
                    repeat: {
                        childObject: 'Contact',
                        relationshipField: 'AccountId',
                        style: 'stacked',
                        min: 1,
                        max: null,
                        ...repeat
                    }
                }
            });
        const edit = (el, prop, value) => {
            const box = el.shadowRoot.querySelector(`[data-prop="${prop}"]`);
            box.value = value;
            box.dispatchEvent(new CustomEvent('change'));
        };

        it('Table can be picked; Tiles is greyed with a line saying it is coming', async () => {
            const el = group({ style: 'table' });
            await flush();
            const buttons = [...seg(el, 'Display style')];
            expect(buttons.map((b) => b.disabled)).toEqual([
                false,
                false,
                true
            ]);
            expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
            const hints = [...el.shadowRoot.querySelectorAll('.pp-hint')].map(
                (p) => p.textContent.trim()
            );
            expect(hints).toContain('Tiles is coming soon.');
            expect(hints).toContain("Shows as cards where there isn't room.");
        });

        it('Read only and Link to record write the repeat block; read-only hides the entry settings', async () => {
            const el = group();
            await flush();
            const reps = [];
            el.addEventListener('repeatchange', (e) => reps.push(e.detail));
            const toggle = (prop, checked) => {
                const box = el.shadowRoot.querySelector(
                    `[data-prop="${prop}"]`
                );
                box.checked = checked;
                box.dispatchEvent(new CustomEvent('change'));
            };
            expect(
                el.shadowRoot.querySelector('[data-prop="link"]').checked
            ).toBe(true);
            toggle('readonly', true);
            toggle('link', false);
            toggle('link', true);
            expect(reps).toEqual([
                { patch: { readOnly: true } },
                { patch: { link: false } },
                { patch: { link: null } }
            ]);
            const ro = group({ readOnly: true });
            await flush();
            expect(
                ro.shadowRoot.querySelector('[data-prop="addlabel"]')
            ).toBeNull();
            expect(ro.shadowRoot.querySelector('[data-prop="min"]')).toBeNull();
        });

        it('Show conditions keep only the filter, and clear when emptied', async () => {
            const el = group();
            await flush();
            const reps = [];
            el.addEventListener('repeatchange', (e) => reps.push(e.detail));
            const editor = el.shadowRoot.querySelector('c-final-lookup-filter');
            expect(editor.conditionsOnly).toBe(true);
            expect(editor.targetObject).toBe('Contact');
            const filter = {
                logic: 'all',
                rows: [{ fieldPath: 'Status', operator: 'eq', value: 'Closed' }]
            };
            editor.dispatchEvent(
                new CustomEvent('lookupconfigchange', {
                    detail: { value: { filter, displayFields: ['x'] } }
                })
            );
            editor.dispatchEvent(
                new CustomEvent('lookupconfigchange', {
                    detail: { value: { filter: { logic: 'all', rows: [] } } }
                })
            );
            expect(reps).toEqual([
                { patch: { show: { filter } } },
                { patch: { show: null } }
            ]);
        });

        it('Entry title and Remove button label write the repeat block', async () => {
            const el = group();
            await flush();
            const reps = [];
            el.addEventListener('repeatchange', (e) => reps.push(e.detail));
            edit(el, 'entrylabel', 'Ticket {index}');
            edit(el, 'removelabel', 'Drop');
            expect(reps).toEqual([
                { patch: { entryLabel: 'Ticket {index}' } },
                { patch: { removeLabel: 'Drop' } }
            ]);
        });

        it('Min and Max take 0–50 whole numbers and never leave Min above Max', async () => {
            const el = group({ min: 2, max: 5 });
            await flush();
            const reps = [];
            el.addEventListener('repeatchange', (e) => reps.push(e.detail));
            edit(el, 'min', '50');
            edit(el, 'min', '51');
            edit(el, 'min', '1.5');
            edit(el, 'min', '-1');
            edit(el, 'max', '51');
            edit(el, 'max', 'x');
            edit(el, 'max', '1');
            // only nothing-crossing, in-range edits save
            expect(reps).toEqual([]);

            edit(el, 'min', '3');
            edit(el, 'max', '50');
            edit(el, 'max', '');
            edit(el, 'max', '0');
            expect(reps).toEqual([
                { patch: { min: 3 } },
                { patch: { max: 50 } },
                { patch: { max: null } },
                { patch: { max: null } }
            ]);
        });

        it('fixing one box saves the other box it was blocking', async () => {
            const el = group({ min: 1, max: 3 });
            await flush();
            const reps = [];
            el.addEventListener('repeatchange', (e) => reps.push(e.detail));
            edit(el, 'min', '5'); // refused: above Max 3
            expect(reps).toEqual([]);
            edit(el, 'max', '10'); // now Min 5 fits, and is saved too
            expect(reps).toEqual([
                { patch: { max: 10 } },
                { patch: { min: 5 } }
            ]);
        });

        it('Max blank accepts Min 50; Min 0 is allowed', async () => {
            const el = group({ min: 1, max: null });
            await flush();
            const reps = [];
            el.addEventListener('repeatchange', (e) => reps.push(e.detail));
            edit(el, 'min', '50');
            edit(el, 'min', '0');
            expect(reps).toEqual([
                { patch: { min: 50 } },
                { patch: { min: 0 } }
            ]);
        });

        it('stored limits a respondent could never meet are named', async () => {
            const el = group({ min: 6, max: 5 });
            await flush();
            expect(el.shadowRoot.querySelector('.pp-error').textContent).toBe(
                'Min rows can’t exceed Max rows.'
            );
        });

        it('Fill on new records: the list gets the group, a fill writes repeat.fill, and a filled field is no question', async () => {
            const el = mount({
                kind: 'section',
                formObjectApi: 'Account',
                node: {
                    id: 'sec_r',
                    title: 'Team',
                    elements: [
                        {
                            id: 'el_x',
                            type: 'field',
                            binding: { object: 'Contact', field: 'LastName' }
                        }
                    ],
                    repeat: {
                        childObject: 'Contact',
                        relationshipField: 'AccountId',
                        fill: [{ field: 'Email', value: 'a@b.c' }]
                    }
                }
            });
            describeFields.emit(FIELDS);
            await flush();
            const fill = el.shadowRoot.querySelector('c-final-repeat-fill');
            expect(fill.childObject).toBe('Contact');
            expect(fill.parentObject).toBe('Account');
            expect(fill.fills).toEqual([{ field: 'Email', value: 'a@b.c' }]);
            expect(fill.takenFields).toEqual(['LastName', 'AccountId']);
            const reps = [];
            el.addEventListener('repeatchange', (e) => reps.push(e.detail));
            fill.dispatchEvent(
                new CustomEvent('fillchange', { detail: { fills: [] } })
            );
            expect(reps).toEqual([{ patch: { fill: null } }]);
            const email = el.shadowRoot.querySelector(
                '.pp-childfield[data-api="Email"]'
            );
            expect(email.textContent).toContain('Filled');
            expect(email.title).toBe('Email is filled on new records');
            const ro = group({ readOnly: true });
            await flush();
            expect(
                ro.shadowRoot.querySelector('c-final-repeat-fill')
            ).toBeNull();
        });

        it('the link field is not offered as a question', async () => {
            const el = group();
            describeFields.emit([
                ...FIELDS,
                {
                    apiName: 'AccountId',
                    label: 'Account ID',
                    inputType: 'reference',
                    required: false
                }
            ]);
            await flush();
            expect(
                el.shadowRoot.querySelector(
                    '.pp-childfield[data-api="AccountId"]'
                )
            ).toBeNull();
            expect(
                el.shadowRoot.querySelectorAll('.pp-childfield')
            ).toHaveLength(2);
        });
    });

    it('visibility group renders on every inspector (conditions summary present)', async () => {
        const el = mount({
            kind: 'page',
            node: { id: 'pg_1', name: 'Details', sections: [] },
            ruleSources: [{ id: 'el_1', label: 'Email' }]
        });
        await flush();
        const summary = el.shadowRoot.querySelector(
            'c-final-conditions-summary'
        );
        expect(summary).not.toBeNull();
        expect(summary.label).toBe('Visibility — Details');
        expect(summary.description).toBe('Choose when this page shows.');

        // an applied dialog becomes the node's visibility, unchanged in shape
        const applied = {
            action: 'show',
            logic: 'all',
            customLogic: null,
            rules: [{ source: 'el_1', operator: 'isBlank', value: null }]
        };
        const props = [];
        el.addEventListener('propchange', (e) => props.push(e.detail));
        summary.dispatchEvent(
            new CustomEvent('conditionschange', { detail: { value: applied } })
        );
        expect(props).toEqual([{ patch: { visibility: applied } }]);
        const events = [];
        el.addEventListener('propchange', (e) => events.push(e.detail));
        const name = el.shadowRoot.querySelector('[data-prop="pagename"]');
        name.value = 'About you';
        name.dispatchEvent(new CustomEvent('change'));
        expect(events).toEqual([{ patch: { name: 'About you' } }]);
    });

    const guestToggle = (el) =>
        [...el.shadowRoot.querySelectorAll('lightning-input')].find(
            (i) => i.label === 'Prefill in guest links'
        );

    // a mapped survey widget (nps → number field); the mapping UI lives in the
    // survey-question branch
    const npsNode = (mode) => ({
        id: 'el_1',
        type: 'nps',
        label: 'Q',
        config: {},
        mapping: mode
            ? { object: 'X', field: 'Score__c', mode }
            : { object: 'X', field: 'Score__c' }
    });
    const numberField = [
        { apiName: 'Score__c', label: 'Score', inputType: 'number' }
    ];

    it('SO-4: a mapped question offers a guest-prefill toggle that emits guestprefillchange', async () => {
        const el = mount({
            kind: 'element',
            mappingFields: numberField,
            node: npsNode(null)
        });
        await flush();
        const toggle = guestToggle(el);
        expect(toggle).toBeTruthy();
        const seen = [];
        el.addEventListener('guestprefillchange', (e) => seen.push(e.detail));
        toggle.checked = true;
        toggle.dispatchEvent(new CustomEvent('change'));
        expect(seen).toEqual([{ value: true }]);
    });

    it('SO-4: a write-only mapping hides the guest-prefill toggle (never prefilled)', async () => {
        const el = mount({
            kind: 'element',
            mappingFields: numberField,
            node: npsNode('write')
        });
        await flush();
        expect(guestToggle(el)).toBeFalsy();
    });
    describe('a record lookup question (unbound)', () => {
        const lookupQuestion = (config, lookupConfig) => ({
            id: 'el_pick',
            type: 'field',
            label: 'Choose a record',
            binding: null,
            config: {
                inputType: 'reference',
                renderAs: 'Filtered_Search',
                ...config
            },
            lookupConfig
        });

        it('asks which object it searches, and offers no Display-as', async () => {
            const el = mount({
                kind: 'element',
                node: lookupQuestion(
                    { referenceTo: null },
                    {
                        targetObject: null
                    }
                )
            });
            await flush();
            await flush();
            const picker = el.shadowRoot.querySelector(
                '.pp-lookup-object c-final-object-picker'
            );
            expect(picker.label).toBe('Object');
            expect(picker.objects.map((o) => o.value)).toEqual([
                'Account',
                'User'
            ]);
            expect(el.shadowRoot.querySelector('.pp-renderas')).toBeNull();
            // nothing to filter until it knows what it searches
            expect(
                el.shadowRoot.querySelector('c-final-lookup-filter')
            ).toBeNull();
        });

        it('picking an object sets what it shows AND searches, in one change', async () => {
            const el = mount({
                kind: 'element',
                node: lookupQuestion(
                    { referenceTo: 'Contact' },
                    {
                        targetObject: 'Contact',
                        displayFields: ['Name']
                    }
                )
            });
            const got = [];
            el.addEventListener('propchange', (e) => got.push(e.detail.patch));
            await flush();
            el.shadowRoot
                .querySelector('.pp-lookup-object c-final-object-picker')
                .dispatchEvent(
                    new CustomEvent('pick', {
                        detail: { value: 'Account', label: 'Account' }
                    })
                );
            expect(got).toHaveLength(1);
            expect(got[0].config.referenceTo).toBe('Account');
            expect(got[0].config.renderAs).toBe('Filtered_Search');
            // the old object's display fields start over
            expect(got[0].lookupConfig).toEqual({ targetObject: 'Account' });
        });

        it('says what changing the object clears only once one is set', async () => {
            const blank = mount({
                kind: 'element',
                node: lookupQuestion(
                    { referenceTo: null },
                    {
                        targetObject: null
                    }
                )
            });
            await flush();
            expect(
                blank.shadowRoot.querySelector('.pp-lookup-object .pp-hint')
            ).toBeNull();
            const set = mount({
                kind: 'element',
                node: lookupQuestion(
                    { referenceTo: 'Account' },
                    {
                        targetObject: 'Account'
                    }
                )
            });
            await flush();
            expect(
                set.shadowRoot.querySelector('.pp-lookup-object .pp-hint')
                    .textContent
            ).toContain('guest access');
        });

        it('a bound lookup never shows the Object picker', async () => {
            const el = mount({
                kind: 'element',
                bindingObjectApi: 'Case',
                node: {
                    id: 'el_ref',
                    type: 'field',
                    label: 'Ref',
                    binding: { object: 'Case', field: 'ContactId' },
                    config: { inputType: 'reference', referenceTo: 'Contact' }
                }
            });
            await flush();
            expect(el.shadowRoot.querySelector('.pp-lookup-object')).toBeNull();
        });
    });

    describe('lookup Display-as', () => {
        const refNode = (config) => ({
            id: 'el_ref',
            type: 'field',
            label: 'Ref',
            binding: { object: 'Task', field: 'WhatId' },
            config: { inputType: 'reference', ...config }
        });

        it('a single-target lookup offers Default and Search with filters', async () => {
            const el = mount({
                kind: 'element',
                bindingObjectApi: 'Case',
                node: refNode({ referenceTo: 'Contact' })
            });
            await flush();
            // lightning-combobox holds its options as data
            const opts = el.shadowRoot
                .querySelector('.pp-renderas')
                .options.map((o) => o.value);
            expect(opts).toEqual(['Default', 'Filtered_Search']);
        });

        it('a polymorphic lookup offers no choice at all, only Default', async () => {
            // Owner ruling 2026-09-13: a system limitation. With one option
            // left the Display-as select is not rendered.
            const el = mount({
                kind: 'element',
                bindingObjectApi: 'Task',
                node: refNode({ polymorphic: true })
            });
            await flush();
            expect(el.shadowRoot.querySelector('.pp-renderas')).toBeNull();
        });

        it('a polymorphic lookup never shows the filter editor, even if renderAs says so', async () => {
            const el = mount({
                kind: 'element',
                bindingObjectApi: 'Task',
                node: refNode({
                    polymorphic: true,
                    renderAs: 'Filtered_Search'
                })
            });
            await flush();
            expect(
                el.shadowRoot.querySelector('c-final-lookup-filter')
            ).toBeNull();
        });
    });

    // IMPL_PLAN_STUDIO_COMPONENT_SWAP rule 3: lightning-input fires change on
    // every keystroke; the inspector's boxes still save only when you leave.
    it('typing in a box saves nothing; leaving it (commit) saves', async () => {
        const el = mount({
            kind: 'element',
            node: {
                id: 'el_m',
                type: 'matrix',
                label: 'Rate us',
                config: { rows: [{ label: 'Speed', value: 'speed' }] }
            }
        });
        await flush();
        const events = [];
        el.addEventListener('configchange', (e) => events.push(e.detail));
        const box = el.shadowRoot.querySelector(
            'lightning-input[data-index="0"]'
        );
        box.value = 'Quality';
        box.dispatchEvent(new CustomEvent('change'));
        expect(events).toEqual([]);
        box.dispatchEvent(new CustomEvent('commit'));
        expect(events.at(-1).patch.rows[0].label).toBe('Quality');
    });
});
