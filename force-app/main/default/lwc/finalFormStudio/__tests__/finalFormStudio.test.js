import { createElement } from 'lwc';
import FinalFormStudio from 'c/finalFormStudio';
import { CurrentPageReference } from 'lightning/navigation';
import loadStudio from '@salesforce/apex/FinalStudioController.loadStudio';
import saveDraft from '@salesforce/apex/FinalStudioController.saveDraft';
import listVersions from '@salesforce/apex/FinalStudioController.listVersions';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';

// capture NavigationMixin.Navigate calls (lwc-recipes pattern)
const NAVIGATE = [];
jest.mock(
    'lightning/navigation',
    () => {
        const {
            createTestWireAdapter
        } = require('@salesforce/wire-service-jest-util');
        const Navigate = Symbol('Navigate');
        const NavigationMixin = (Base) =>
            class extends Base {
                [Navigate](pageRef) {
                    NAVIGATE.push(pageRef);
                }
            };
        NavigationMixin.Navigate = Navigate;
        return {
            CurrentPageReference: createTestWireAdapter(jest.fn()),
            NavigationMixin
        };
    },
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/FinalStudioController.loadStudio',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.saveDraft',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.discardDraft',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.listVersions',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.publishSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'T' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: { source: 'builtin', name: 'editorialIvory', overrides: {} },
    pages: [],
    submit: { label: 'Submit' }
};

const VERSIONS = [
    { id: 'a0V2', versionNumber: 2, isActive: false, isDraft: true },
    { id: 'a0V1', versionNumber: 1, isActive: true, isDraft: false }
];

function mount() {
    const el = createElement('c-final-form-studio', { is: FinalFormStudio });
    document.body.appendChild(el);
    return el;
}

// previews render through the device stage now — drill into its shadow
function previewViewer(el) {
    const stage = el.shadowRoot.querySelector('c-final-preview-stage');
    return stage && stage.shadowRoot.querySelector('c-final-form-viewer');
}

const flush = () => new Promise((r) => setTimeout(r, 0));
// fake-timer flush: n sequential microtask ticks without touching the clock
const micro = (n) => {
    return n ? Promise.resolve().then(() => micro(n - 1)) : Promise.resolve();
};

describe('c-final-form-studio', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        NAVIGATE.length = 0;
        jest.clearAllMocks();
        jest.useRealTimers(); // a failed fake-timer test must not starve the next
    });

    it('URL contract: no c__formId → redirect to the Forms tab', async () => {
        mount();
        CurrentPageReference.emit({ state: {} });
        await flush();
        expect(NAVIGATE).toHaveLength(1);
        expect(NAVIGATE[0].attributes.apiName).toBe('Final_Forms');
        expect(loadStudio).not.toHaveBeenCalled();
    });

    it('hosted mode (VF full page): hostFormId seeds the load, Exit uses exitUrl', async () => {
        loadStudio.mockResolvedValue({
            name: 'Hosted',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V9',
            versionNumber: 1,
            activeVersionNumber: null
        });
        listVersions.mockResolvedValue([]);
        const orig = window.location;
        const assign = jest.fn();
        delete window.location;
        window.location = { assign };

        const el = createElement('c-final-form-studio', {
            is: FinalFormStudio
        });
        el.hostFormId = 'a0F7';
        el.exitUrl = 'https://org.my.salesforce.com/lightning/n/Final_Forms';
        document.body.appendChild(el);
        await flush();
        await flush();

        // no CurrentPageReference emission anywhere — the seed did the load
        expect(loadStudio).toHaveBeenCalledWith({ formId: 'a0F7' });
        el.shadowRoot.querySelector('.st-exit').click();
        expect(assign).toHaveBeenCalledWith(
            'https://org.my.salesforce.com/lightning/n/Final_Forms'
        );
        expect(NAVIGATE).toHaveLength(0);

        window.location = orig;
    });

    it('loads the draft, shows the chip fallback (no version list), renders panel + live preview', async () => {
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        listVersions.mockRejectedValue(new Error('down'));
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await flush();
        await flush();
        expect(loadStudio).toHaveBeenCalledWith({ formId: 'a0F1' });
        expect(el.shadowRoot.querySelector('.st-chip').textContent).toBe(
            'v2 · Draft'
        );
        expect(
            el.shadowRoot.querySelector('c-final-design-panel')
        ).not.toBeNull();
        expect(previewViewer(el)).not.toBeNull();
        // the mode toggle lives in the LEFT cluster — before the spacer
        const bar = el.shadowRoot.querySelector('.st-bar');
        const kids = Array.from(bar.children);
        expect(kids.indexOf(bar.querySelector('.st-modes'))).toBeLessThan(
            kids.indexOf(bar.querySelector('.st-spacer'))
        );
    });

    it('specchange autosaves ONCE after the debounce window', async () => {
        jest.useFakeTimers();
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: null,
            versionNumber: 1,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V9');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const panel = el.shadowRoot.querySelector('c-final-design-panel');
        const edited = JSON.parse(JSON.stringify(SPEC));
        edited.submit.label = 'Send';
        panel.dispatchEvent(
            new CustomEvent('specchange', { detail: { spec: edited } })
        );
        panel.dispatchEvent(
            new CustomEvent('specchange', { detail: { spec: edited } })
        );
        await Promise.resolve(); // LWC re-render is microtask-based
        expect(el.shadowRoot.querySelector('.st-saved').textContent).toBe(
            'Unsaved changes'
        );
        jest.advanceTimersByTime(1000);
        expect(saveDraft).toHaveBeenCalledTimes(1);
        expect(
            JSON.parse(saveDraft.mock.calls[0][0].specJson).submit.label
        ).toBe('Send');
        jest.useRealTimers();
    });

    it('Build mode: palette click-add mints an element with id/binding/validation and autosaves', async () => {
        jest.useFakeTimers();
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();
        const palette = el.shadowRoot.querySelector('c-final-field-palette');
        expect(palette).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('c-final-builder-canvas')
        ).not.toBeNull();

        palette.dispatchEvent(
            new CustomEvent('addfield', {
                detail: {
                    field: {
                        apiName: 'Email',
                        label: 'Email',
                        inputType: 'email',
                        required: true
                    }
                }
            })
        );
        jest.advanceTimersByTime(1000);
        expect(saveDraft).toHaveBeenCalledTimes(1);
        const saved = JSON.parse(saveDraft.mock.calls[0][0].specJson);
        const added = saved.pages[0].sections[0].elements.at(-1);
        expect(added.id).toMatch(/^el_[a-z0-9]{8,}$/);
        expect(added.binding.field).toBe('Email');
        expect(added.config.inputType).toBe('email');
        expect(added.validation[0].type).toBe('required');
        jest.useRealTimers();
    });

    it('DnD intents: dropfield at position, moveelement across sections, movepage keeps the active page', async () => {
        jest.useFakeTimers();
        const structured = JSON.parse(JSON.stringify(SPEC));
        structured.pages = [
            {
                id: 'pg_1',
                name: 'One',
                sections: [
                    {
                        id: 'sec_1',
                        title: 'A',
                        elements: [
                            { id: 'el_1', type: 'field', label: 'First' },
                            { id: 'el_2', type: 'field', label: 'Second' }
                        ]
                    },
                    { id: 'sec_2', title: 'B', elements: [] }
                ]
            },
            { id: 'pg_2', name: 'Two', sections: [] }
        ];
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(structured),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();
        const canvas = el.shadowRoot.querySelector('c-final-builder-canvas');

        // palette field dropped BEFORE el_2
        canvas.dispatchEvent(
            new CustomEvent('dropfield', {
                detail: {
                    field: {
                        apiName: 'Email',
                        label: 'Email',
                        inputType: 'email'
                    },
                    sectionId: 'sec_1',
                    beforeId: 'el_2'
                }
            })
        );
        // el_1 moved to the empty section
        canvas.dispatchEvent(
            new CustomEvent('moveelement', {
                detail: { id: 'el_1', sectionId: 'sec_2', beforeId: null }
            })
        );
        // pg_2 reordered before pg_1 — the active page (pg_1) stays shown
        canvas.dispatchEvent(
            new CustomEvent('movepage', {
                detail: { id: 'pg_2', beforeId: 'pg_1' }
            })
        );
        jest.advanceTimersByTime(1000);
        expect(saveDraft).toHaveBeenCalledTimes(1);
        const saved = JSON.parse(saveDraft.mock.calls[0][0].specJson);
        expect(saved.pages.map((p) => p.id)).toEqual(['pg_2', 'pg_1']);
        const pg1 = saved.pages[1];
        expect(pg1.sections[0].elements.map((e) => e.label)).toEqual([
            'Email',
            'Second'
        ]);
        expect(pg1.sections[1].elements.map((e) => e.id)).toEqual(['el_1']);
        // blueprint still shows pg_1 (index followed the page across the move)
        await Promise.resolve();
        await Promise.resolve();
        const chips = el.shadowRoot
            .querySelector('c-final-builder-canvas')
            .shadowRoot.querySelectorAll('.bc-chip');
        expect(chips[1].classList.contains('on')).toBe(true);
        jest.useRealTimers();
    });

    it('content blocks: standalone wrapper in a gap, element into a section, click-add appends (§3/§6)', async () => {
        jest.useFakeTimers();
        const structured = JSON.parse(JSON.stringify(SPEC));
        structured.pages = [
            {
                id: 'pg_1',
                name: 'One',
                sections: [
                    {
                        id: 'sec_1',
                        title: 'A',
                        elements: [
                            { id: 'el_1', type: 'field', label: 'First' }
                        ]
                    }
                ]
            }
        ];
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(structured),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();
        const canvas = el.shadowRoot.querySelector('c-final-builder-canvas');
        const palette = el.shadowRoot.querySelector('c-final-field-palette');

        // standalone divider dropped in the gap BEFORE sec_1
        canvas.dispatchEvent(
            new CustomEvent('dropblock', {
                detail: {
                    blockType: 'divider',
                    beforeSectionId: 'sec_1',
                    pageId: 'pg_1'
                }
            })
        );
        // display text dropped INTO sec_1 before el_1
        canvas.dispatchEvent(
            new CustomEvent('dropblock', {
                detail: {
                    blockType: 'richText',
                    sectionId: 'sec_1',
                    beforeId: 'el_1'
                }
            })
        );
        // click-add a spacer → standalone at the page's end
        palette.dispatchEvent(
            new CustomEvent('addblock', { detail: { blockType: 'spacer' } })
        );
        jest.advanceTimersByTime(1000);
        expect(saveDraft).toHaveBeenCalledTimes(1);
        const saved = JSON.parse(saveDraft.mock.calls[0][0].specJson);
        const pg = saved.pages[0];
        expect(pg.sections.map((s) => Boolean(s.block))).toEqual([
            true,
            false,
            true
        ]);
        // §6 shape: wrapper carries ONE content element, chromeless
        expect(pg.sections[0].style).toBe('plain');
        expect(pg.sections[0].elements).toHaveLength(1);
        expect(pg.sections[0].elements[0].type).toBe('divider');
        expect(pg.sections[0].elements[0].binding).toBeNull();
        // in-section drop landed before el_1
        expect(pg.sections[1].elements.map((e) => e.type)).toEqual([
            'richText',
            'field'
        ]);
        expect(pg.sections[2].elements[0].type).toBe('spacer');
        jest.useRealTimers();
    });

    it('preview click selects the element and opens properties (authoring sync)', async () => {
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify({
                ...SPEC,
                pages: [
                    {
                        id: 'pg_1',
                        name: 'One',
                        sections: [
                            {
                                id: 'sec_1',
                                title: 'A',
                                elements: [
                                    {
                                        id: 'el_9',
                                        type: 'field',
                                        label: 'Nickname'
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();

        const stage = el.shadowRoot.querySelector(
            '.st-buildpreview c-final-preview-stage'
        );
        const preview = stage.shadowRoot.querySelector('c-final-form-viewer');
        expect(preview.authoring).toBe(true);
        preview.dispatchEvent(
            new CustomEvent('elementselect', {
                detail: { elementId: 'el_9' }
            })
        );
        await Promise.resolve();
        const panel = el.shadowRoot.querySelector('c-final-property-panel');
        expect(panel).not.toBeNull();
        expect(panel.kind).toBe('element');
        expect(panel.node.label).toBe('Nickname');
    });

    it('property intents: required sugar syncs the validation entry; rebind rewires config (§5)', async () => {
        jest.useFakeTimers();
        const structured = JSON.parse(JSON.stringify(SPEC));
        structured.pages = [
            {
                id: 'pg_1',
                name: 'One',
                sections: [
                    {
                        id: 'sec_1',
                        title: 'A',
                        elements: [
                            {
                                id: 'el_1',
                                type: 'field',
                                label: 'First',
                                required: false,
                                validation: [],
                                config: { inputType: 'text' }
                            }
                        ]
                    }
                ]
            }
        ];
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            objectApi: 'Contact',
            specJson: JSON.stringify(structured),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await micro(4);
        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();
        const canvas = el.shadowRoot.querySelector('c-final-builder-canvas');
        canvas.dispatchEvent(
            new CustomEvent('select', {
                detail: { kind: 'element', id: 'el_1' }
            })
        );
        await Promise.resolve();
        const panel = el.shadowRoot.querySelector('c-final-property-panel');

        panel.dispatchEvent(
            new CustomEvent('propchange', {
                detail: { patch: { required: true } }
            })
        );
        jest.advanceTimersByTime(1000);
        const saved = JSON.parse(saveDraft.mock.calls[0][0].specJson);
        const elx = saved.pages[0].sections[0].elements[0];
        expect(elx.required).toBe(true);
        expect(elx.validation).toEqual([
            { type: 'required', message: 'First is required.' }
        ]);
        jest.useRealTimers();
    });

    it('FormStudio port intents: Empty space routes INSIDE (never a wrapper); block style patches the wrapper; consent mints required', async () => {
        jest.useFakeTimers();
        const structured = JSON.parse(JSON.stringify(SPEC));
        structured.pages = [
            {
                id: 'pg_1',
                name: 'One',
                sections: [
                    {
                        id: 'sec_1',
                        title: 'A',
                        columns: 2,
                        elements: [
                            { id: 'el_1', type: 'field', label: 'First' }
                        ]
                    }
                ]
            }
        ];
        loadStudio.mockResolvedValue({
            name: 'Port',
            objectApi: 'Contact',
            specJson: JSON.stringify(structured),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await micro(4);
        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();
        const palette = el.shadowRoot.querySelector('c-final-field-palette');
        const canvas = el.shadowRoot.querySelector('c-final-builder-canvas');

        // Empty space click-add: joins the page's LAST SECTION
        palette.dispatchEvent(
            new CustomEvent('addblock', {
                detail: { blockType: 'emptySpace' }
            })
        );
        // consent standalone block: wrapper section + required entry
        palette.dispatchEvent(
            new CustomEvent('addblock', { detail: { blockType: 'consent' } })
        );
        jest.advanceTimersByTime(1000);
        const draft1 = JSON.parse(saveDraft.mock.calls.at(-1)[0].specJson);
        const wrapId = draft1.pages[0].sections.find((s) => s.block).id;

        // a canvas click on the block section resolves to its element —
        // the panel exposes the WRAPPER style (consent is NOT plain-only)
        canvas.dispatchEvent(
            new CustomEvent('select', {
                detail: { kind: 'section', id: wrapId }
            })
        );
        await Promise.resolve();
        const panel = el.shadowRoot.querySelector('c-final-property-panel');
        expect(panel.kind).toBe('element');
        expect(panel.blockStyle).toBe('plain');
        expect(panel.sectionColumns).toBe(1);
        panel.dispatchEvent(
            new CustomEvent('blockstylechange', {
                detail: { style: 'card' }
            })
        );

        // width patch flows through propchange like any other prop
        canvas.dispatchEvent(
            new CustomEvent('select', {
                detail: { kind: 'element', id: 'el_1' }
            })
        );
        await Promise.resolve();
        el.shadowRoot.querySelector('c-final-property-panel').dispatchEvent(
            new CustomEvent('propchange', {
                detail: { patch: { width: 2 } }
            })
        );

        jest.advanceTimersByTime(1000);
        const saved = JSON.parse(saveDraft.mock.calls.at(-1)[0].specJson);
        const pg = saved.pages[0];
        expect(pg.sections.map((s) => Boolean(s.block))).toEqual([false, true]);
        const sec1 = pg.sections[0];
        // Empty space landed INSIDE sec_1, never as a wrapper
        expect(sec1.elements.map((e) => e.type)).toEqual([
            'field',
            'emptySpace'
        ]);
        expect(sec1.elements[0].width).toBe(2);
        const consentWrap = pg.sections[1];
        expect(consentWrap.style).toBe('card');
        expect(consentWrap.elements[0].type).toBe('consent');
        expect(consentWrap.elements[0].required).toBe(true);
        expect(consentWrap.elements[0].validation[0].type).toBe('required');
        jest.useRealTimers();
    });

    it('rules slice: Logic index aggregates rules + checks; jump selects and opens props; checks merge keeps required', async () => {
        jest.useFakeTimers();
        const structured = JSON.parse(JSON.stringify(SPEC));
        structured.pages = [
            {
                id: 'pg_1',
                name: 'One',
                sections: [
                    {
                        id: 'sec_1',
                        title: 'A',
                        elements: [
                            {
                                id: 'el_1',
                                type: 'field',
                                label: 'Email',
                                required: true,
                                validation: [
                                    { type: 'required', message: 'Need it.' }
                                ],
                                config: { inputType: 'email' }
                            }
                        ]
                    }
                ]
            },
            {
                id: 'pg_2',
                name: 'Two',
                visibility: {
                    action: 'show',
                    logic: 'all',
                    rules: [
                        { source: 'el_1', operator: 'isNotBlank', value: null }
                    ]
                },
                sections: []
            }
        ];
        loadStudio.mockResolvedValue({
            name: 'Rules',
            objectApi: 'Contact',
            specJson: JSON.stringify(structured),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await micro(4);
        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();

        // the palette's Logic tab receives the aggregate index
        const palette = el.shadowRoot.querySelector('c-final-field-palette');
        expect(palette.logicIndex).toHaveLength(1);
        expect(palette.logicIndex[0]).toMatchObject({
            kind: 'page',
            id: 'pg_2',
            label: 'Two',
            summary: 'Shown by 1 rule'
        });

        // jump → page selected on ITS page index, props open
        palette.dispatchEvent(
            new CustomEvent('logicjump', {
                detail: { kind: 'page', id: 'pg_2' }
            })
        );
        await Promise.resolve();
        const panel = el.shadowRoot.querySelector('c-final-property-panel');
        expect(panel.kind).toBe('page');
        expect(panel.node.id).toBe('pg_2');
        // rule plumbing reaches the panel
        expect(panel.ruleSources).toEqual([{ id: 'el_1', label: 'Email' }]);
        expect(panel.ruleIndex.get('el_1').type).toBe('field');

        // checks editor emission merges UNDER the required entry — select
        // the field first (checks belong to elements)
        const canvas = el.shadowRoot.querySelector('c-final-builder-canvas');
        canvas.dispatchEvent(
            new CustomEvent('pagechange', { detail: { index: 0 } })
        );
        canvas.dispatchEvent(
            new CustomEvent('select', {
                detail: { kind: 'element', id: 'el_1' }
            })
        );
        await Promise.resolve();
        el.shadowRoot.querySelector('c-final-property-panel').dispatchEvent(
            new CustomEvent('validationchange', {
                detail: {
                    entries: [{ type: 'range', min: 1, max: 9, message: '1-9' }]
                }
            })
        );
        jest.advanceTimersByTime(1000);
        const saved = JSON.parse(saveDraft.mock.calls.at(-1)[0].specJson);
        expect(saved.pages[0].sections[0].elements[0].validation).toEqual([
            { type: 'required', message: 'Need it.' },
            { type: 'range', min: 1, max: 9, message: '1-9' }
        ]);
        jest.useRealTimers();
    });

    it('repeater flow (§4): drop opens the picker, pick mints the section AT the position, child fields bind to the child', async () => {
        jest.useFakeTimers();
        const structured = JSON.parse(JSON.stringify(SPEC));
        structured.form.targetObject = 'Account';
        structured.pages = [
            {
                id: 'pg_1',
                name: 'One',
                sections: [
                    { id: 'sec_1', title: 'A', elements: [] },
                    { id: 'sec_2', title: 'B', elements: [] }
                ]
            }
        ];
        loadStudio.mockResolvedValue({
            name: 'Accounts',
            objectApi: 'Account',
            specJson: JSON.stringify(structured),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await micro(4);
        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await Promise.resolve();
        const canvas = el.shadowRoot.querySelector('c-final-builder-canvas');

        // nothing mints before a child object is picked
        canvas.dispatchEvent(
            new CustomEvent('droprepeater', {
                detail: { beforeSectionId: 'sec_2', pageId: 'pg_1' }
            })
        );
        await Promise.resolve();
        const picker = el.shadowRoot.querySelector(
            'c-final-relationship-picker'
        );
        expect(picker).not.toBeNull();
        expect(saveDraft).not.toHaveBeenCalled();

        picker.dispatchEvent(
            new CustomEvent('pick', {
                detail: {
                    relationship: {
                        relationshipName: 'Contacts',
                        childObject: 'Contact',
                        childObjectLabel: 'Contact',
                        linkingField: 'AccountId'
                    }
                }
            })
        );
        await Promise.resolve();
        // picker gone, inspector open on the new group
        expect(
            el.shadowRoot.querySelector('c-final-relationship-picker')
        ).toBeNull();
        const panel = el.shadowRoot.querySelector('c-final-property-panel');
        expect(panel.kind).toBe('section');
        expect(panel.node.repeat.childObject).toBe('Contact');

        // §4.4: the inspector's child list adds CHILD-bound elements
        panel.dispatchEvent(
            new CustomEvent('addchildfield', {
                detail: {
                    field: {
                        apiName: 'LastName',
                        label: 'Last Name',
                        inputType: 'text',
                        required: true
                    }
                }
            })
        );
        panel.dispatchEvent(
            new CustomEvent('repeatchange', {
                detail: { patch: { style: 'table' } }
            })
        );
        jest.advanceTimersByTime(1000);
        const saved = JSON.parse(saveDraft.mock.calls.at(-1)[0].specJson);
        const pg = saved.pages[0];
        // minted AT the drop position: between sec_1 and sec_2
        expect(pg.sections.map((s) => s.title)).toEqual(['A', 'Contact', 'B']);
        const rep = pg.sections[1];
        expect(rep.repeat.relationshipField).toBe('AccountId');
        expect(rep.repeat.style).toBe('table');
        expect(rep.repeat.entryLabel).toBe('Contact {index}');
        expect(rep.elements[0].binding).toEqual({
            object: 'Contact',
            field: 'LastName'
        });
        expect(rep.elements[0].validation[0].type).toBe('required');
        jest.useRealTimers();
    });

    it('strips the resolved publish artifact so theme picks repaint the preview', async () => {
        jest.useFakeTimers();
        const published = JSON.parse(JSON.stringify(SPEC));
        published.resolved = {
            tokens: { '--c-page-bg': '#111' },
            engineVersion: 1,
            resolvedAt: '2026-07-08T00:00:00.000Z'
        };
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(published),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // the live preview must get a spec WITHOUT the frozen snapshot,
        // otherwise the viewer never runs the theme engine again
        const viewer = previewViewer(el);
        expect(viewer.spec.resolved).toBeUndefined();
        expect(viewer.spec.theme.name).toBe('editorialIvory');

        // and the draft autosaved after an edit stays clean of it too
        const panel = el.shadowRoot.querySelector('c-final-design-panel');
        const edited = JSON.parse(JSON.stringify(viewer.spec));
        edited.theme.name = 'neonNights';
        panel.dispatchEvent(
            new CustomEvent('specchange', { detail: { spec: edited } })
        );
        jest.advanceTimersByTime(1000);
        expect(saveDraft).toHaveBeenCalledTimes(1);
        const saved = JSON.parse(saveDraft.mock.calls[0][0].specJson);
        expect(saved.resolved).toBeUndefined();
        expect(saved.theme.name).toBe('neonNights');
        jest.useRealTimers();
    });

    it('versions dropdown replaces the chip, newest first, draft selected', async () => {
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V2',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        listVersions.mockResolvedValue(VERSIONS);
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await flush();
        await flush();
        expect(el.shadowRoot.querySelector('.st-chip')).toBeNull();
        const options = Array.from(
            el.shadowRoot.querySelectorAll('.st-verselect option')
        );
        expect(options.map((o) => o.textContent)).toEqual([
            'v2 · Draft',
            'v1 · Published'
        ]);
        expect(el.shadowRoot.querySelector('.st-verselect').value).toBe('a0V2');
    });

    it('viewing a published version is read-only: notice, publish disabled, autosave NEVER fires', async () => {
        jest.useFakeTimers();
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V2',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        listVersions.mockResolvedValue(VERSIONS);
        saveDraft.mockResolvedValue('a0V2');
        const published = JSON.parse(JSON.stringify(SPEC));
        published.resolved = {
            tokens: { '--c-page-bg': '#111' },
            engineVersion: 1
        };
        getSpec.mockResolvedValue(JSON.stringify(published));
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await micro(8);

        // a pending edit is flushed ONCE on the way out — never lost
        const panel = el.shadowRoot.querySelector('c-final-design-panel');
        const edited = JSON.parse(JSON.stringify(SPEC));
        edited.submit.label = 'Send';
        panel.dispatchEvent(
            new CustomEvent('specchange', { detail: { spec: edited } })
        );
        const select = el.shadowRoot.querySelector('.st-verselect');
        select.value = 'a0V1';
        select.dispatchEvent(new CustomEvent('change'));
        await micro(8);
        expect(saveDraft).toHaveBeenCalledTimes(1);

        // panel replaced by the notice; publish belongs to the draft only
        expect(el.shadowRoot.querySelector('c-final-design-panel')).toBeNull();
        expect(
            el.shadowRoot.querySelector('.st-notice-title').textContent
        ).toBe('Viewing v1 (published) — read-only.');
        expect(el.shadowRoot.querySelector('.st-saved')).toBeNull();
        expect(
            el.shadowRoot.querySelector('.st-bar .st-primary').disabled
        ).toBe(true);
        // read-only viewing keeps `resolved` — the frozen tokens ARE what
        // was published
        const viewer = previewViewer(el);
        expect(viewer.spec.resolved).toBeDefined();

        jest.advanceTimersByTime(5000);
        expect(saveDraft).toHaveBeenCalledTimes(1); // no autosave while viewing
        jest.useRealTimers();
    });

    it('read-only covers Build mode too; Back to draft restores editing', async () => {
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V2',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        listVersions.mockResolvedValue(VERSIONS);
        const published = JSON.parse(JSON.stringify(SPEC));
        published.resolved = { tokens: { '--c-page-bg': '#111' } };
        getSpec.mockResolvedValue(JSON.stringify(published));
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await flush();
        await flush();

        el.shadowRoot.querySelectorAll('.st-mode')[0].click(); // Build
        await flush();
        const select = el.shadowRoot.querySelector('.st-verselect');
        select.value = 'a0V1';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(el.shadowRoot.querySelector('c-final-field-palette')).toBeNull();
        expect(
            el.shadowRoot.querySelector('c-final-builder-canvas')
        ).toBeNull();
        expect(el.shadowRoot.querySelector('.st-notice')).not.toBeNull();

        el.shadowRoot.querySelector('.st-notice-btn').click();
        await flush();
        expect(el.shadowRoot.querySelector('.st-notice')).toBeNull();
        expect(
            el.shadowRoot.querySelector('c-final-field-palette')
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('c-final-builder-canvas')
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('.st-bar .st-primary').disabled
        ).toBe(false);
        // the select's LIVE value snaps back to the draft (selectedness is
        // a dirty flag — the attribute alone won't move it)
        expect(el.shadowRoot.querySelector('.st-verselect').value).toBe('a0V2');
        // and the draft spec is intact, publish-artifact free
        const viewer = previewViewer(el);
        expect(viewer.spec.resolved).toBeUndefined();
    });

    it('undo/redo (slice 6): steps restore, persist via autosave, and never re-record', async () => {
        jest.useFakeTimers();
        loadStudio.mockResolvedValue({
            name: 'History',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V1');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await micro(4);

        // fresh load: nothing to step through
        expect(el.shadowRoot.querySelector('.st-undo').disabled).toBe(true);
        expect(el.shadowRoot.querySelector('.st-redo').disabled).toBe(true);

        const panel = el.shadowRoot.querySelector('c-final-design-panel');
        const edit = (label) => {
            const spec = JSON.parse(JSON.stringify(SPEC));
            spec.submit.label = label;
            panel.dispatchEvent(
                new CustomEvent('specchange', { detail: { spec } })
            );
        };
        edit('One');
        jest.advanceTimersByTime(2000); // past coalescing AND the autosave
        edit('Two');
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
        expect(el.shadowRoot.querySelector('.st-undo').disabled).toBe(false);

        el.shadowRoot.querySelector('.st-undo').click();
        await Promise.resolve();
        const viewer = previewViewer(el);
        expect(viewer.spec.submit.label).toBe('One');
        // the restored state autosaves like any edit
        jest.advanceTimersByTime(1000);
        expect(
            JSON.parse(saveDraft.mock.calls.at(-1)[0].specJson).submit.label
        ).toBe('One');

        // one more step back reaches the loaded state; redo walks forward
        el.shadowRoot.querySelector('.st-undo').click();
        await Promise.resolve();
        expect(viewer.spec.submit.label).toBe('Submit');
        expect(el.shadowRoot.querySelector('.st-undo').disabled).toBe(true);
        el.shadowRoot.querySelector('.st-redo').click();
        await Promise.resolve();
        expect(viewer.spec.submit.label).toBe('One');

        // a NEW edit kills the redo branch (undo never re-records)
        edit('Three');
        await Promise.resolve();
        expect(el.shadowRoot.querySelector('.st-redo').disabled).toBe(true);
        jest.useRealTimers();
    });

    it('bad id → friendly not-found with a way back, never a spinner', async () => {
        loadStudio.mockRejectedValue(new Error('nope'));
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'BAD' } });
        await flush();
        await flush();
        expect(
            el.shadowRoot.querySelector('.st-notfound h2').textContent
        ).toContain("isn't available");
        expect(el.shadowRoot.querySelector('lightning-spinner')).toBeNull();
    });
});
