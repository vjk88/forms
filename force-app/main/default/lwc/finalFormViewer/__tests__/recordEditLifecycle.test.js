import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/**
 * IMPL_PLAN_RECORD_PAGE_EDIT Slice 2 — loading the record a form edits.
 *
 * The exclusions matter as much as the feature: this same component runs the
 * Studio preview and the authoring canvas, and must NEVER read (or later save
 * over) a real customer record from there.
 */
const EDIT_SPEC = {
    specVersion: 1,
    form: {
        name: 'Edit Contact',
        targetObject: 'Contact',
        saveMode: 'update'
    },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Save' },
    pages: [
        {
            id: 'pg_1',
            sections: [
                {
                    id: 'sec_1',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_title',
                            type: 'field',
                            label: 'Title',
                            binding: { object: 'Contact', field: 'Title' },
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_dept',
                            type: 'field',
                            label: 'Department',
                            binding: { object: 'Contact', field: 'Department' },
                            render: { inputType: 'text' },
                            config: { defaultValue: 'Unassigned' }
                        }
                    ]
                }
            ]
        }
    ]
};

const RECORD = '003000000000001AAA';
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(spec = EDIT_SPEC, props = {}) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.recordId = RECORD;
    el.objectApiName = 'Contact';
    Object.assign(el, props);
    el.spec = JSON.parse(JSON.stringify(spec));
    document.body.appendChild(el);
    return el;
}

/** The edit reader is tagged `__edit__` to keep it distinct from the
 *  Autofill rule readers that share the component. */
const editSource = (el) =>
    Array.from(
        el.shadowRoot.querySelectorAll('c-final-autofill-record-source')
    ).find((n) => n.ruleId === '__edit__') || null;

import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
const nav = (el) => el.shadowRoot.querySelector('x-test');
const loadRecord = (el, values) =>
    editSource(el).dispatchEvent(
        new CustomEvent('recordsuccess', {
            detail: {
                ruleId: '__edit__',
                recordId: editSource(el).recordId,
                generation: editSource(el).generation,
                sessionId: editSource(el).sessionId,
                values
            }
        })
    );
describe('review: record edit lifecycle regressions', () => {
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });
    it('waits for the existing record before allowing a real submit', async () => {
        getSpec.mockResolvedValue(JSON.stringify(EDIT_SPEC));
        submitForm.mockResolvedValue({ recordId: RECORD });
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.recordId = RECORD;
        el.objectApiName = 'Contact';
        el.versionId = 'a0Vtest';
        document.body.appendChild(el);
        await flush();
        await flush();
        expect(editSource(el)).not.toBeNull();
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(submitForm).not.toHaveBeenCalled();
    });
    it('preserves an edit typed while the initial record read is pending', async () => {
        const el = mount();
        await flush();
        await flush();
        nav(el).dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: 'el_title', value: 'Typed while loading' }
            })
        );
        expect(el.answers.el_title).toBe('Typed while loading');
        loadRecord(el, { Title: 'Old server value' });
        await flush();
        expect(el.answers.el_title).toBe('Typed while loading');
    });
    it('switches the edit reader when the host record changes', async () => {
        getSpec.mockResolvedValue(JSON.stringify(EDIT_SPEC));
        submitForm.mockResolvedValue({ recordId: RECORD });
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.recordId = RECORD;
        el.objectApiName = 'Contact';
        el.versionId = 'a0Vtest';
        document.body.appendChild(el);
        await flush();
        await flush();
        loadRecord(el, { Title: 'Record A' });
        await flush();
        el.recordId = '003000000000002AAA';
        await flush();
        await flush();
        loadRecord(el, { Title: 'Record B' });
        await flush();
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(
            JSON.parse(submitForm.mock.calls[0][0].payloadJson).meta.recordId
        ).toBe('003000000000002AAA');
    });
    it('starts Autofill for a lookup hydrated from the existing record', async () => {
        const spec = JSON.parse(JSON.stringify(EDIT_SPEC));
        spec.pages[0].sections[0].elements.push({
            id: 'el_account',
            type: 'field',
            label: 'Account',
            binding: { object: 'Contact', field: 'AccountId' },
            config: { inputType: 'reference', referenceTo: 'Account' }
        });
        spec.settings.prefill = {
            rulesVersion: 1,
            autofillRules: [
                {
                    id: 'af_account',
                    enabled: true,
                    source: {
                        type: 'lookup',
                        elementId: 'el_account',
                        objectApiName: 'Account'
                    },
                    policy: 'preserveEdits',
                    mappings: [{ from: 'Phone', to: 'el_title' }]
                }
            ]
        };
        const el = mount(spec);
        await flush();
        await flush();
        loadRecord(el, { AccountId: '001000000000001AAA', Title: null });
        await flush();
        await flush();
        expect(el.answers.el_account).toBe('001000000000001AAA');
        expect(
            [
                ...el.shadowRoot.querySelectorAll(
                    'c-final-autofill-record-source'
                )
            ].some((s) => s.ruleId === 'af_account')
        ).toBe(true);
    });
    it('shows a load failure instead of an apparently usable empty edit form', async () => {
        const el = mount();
        await flush();
        await flush();
        editSource(el).dispatchEvent(
            new CustomEvent('recorderror', {
                detail: {
                    ruleId: '__edit__',
                    recordId: RECORD,
                    generation: editSource(el).generation,
                    sessionId: editSource(el).sessionId,
                    error: { body: { message: 'Record could not be loaded' } }
                },
                bubbles: true,
                composed: true
            })
        );
        await flush();
        expect(el.shadowRoot.querySelector('[role="alert"]')).not.toBeNull();
    });
});

import { CurrentPageReference } from 'lightning/navigation';
import { notifyRecordUpdateAvailable, getRecord } from 'lightning/uiRecordApi';
const identity = (src) => ({
    ruleId: src.ruleId,
    recordId: src.recordId,
    generation: src.generation,
    sessionId: src.sessionId
});
const emit = (src, type, details = {}) =>
    src.dispatchEvent(
        new CustomEvent(type, { detail: { ...identity(src), ...details } })
    );
const B = '003000000000002AAA';
const change = (el, value) =>
    nav(el).dispatchEvent(
        new CustomEvent('valuechange', {
            detail: { elementId: 'el_title', value }
        })
    );
async function published(props = {}) {
    getSpec.mockResolvedValue(JSON.stringify(EDIT_SPEC));
    submitForm.mockResolvedValue({ recordId: RECORD });
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.recordId = RECORD;
    el.objectApiName = 'Contact';
    el.versionId = 'a0Vtest';
    Object.assign(el, props);
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}
function lookupSpec(policy = 'preserveEdits') {
    const spec = JSON.parse(JSON.stringify(EDIT_SPEC));
    spec.pages[0].sections[0].elements.push({
        id: 'el_account',
        type: 'field',
        label: 'Account',
        binding: { object: 'Contact', field: 'AccountId' },
        config: {
            inputType: 'reference',
            referenceTo: 'Account',
            defaultValue: '001000000000009AAA'
        }
    });
    spec.settings.prefill = {
        rulesVersion: 1,
        autofillRules: [
            {
                id: 'af_account',
                enabled: true,
                source: {
                    type: 'lookup',
                    elementId: 'el_account',
                    objectApiName: 'Account'
                },
                policy,
                mappings: [{ from: 'Phone', to: 'el_title' }]
            }
        ]
    };
    return spec;
}
const ruleSource = (el) =>
    [...el.shadowRoot.querySelectorAll('c-final-autofill-record-source')].find(
        (s) => s.ruleId === 'af_account'
    );
describe('record lifecycle boundaries', () => {
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });
    it.each(['', null, false, 0])(
        'preserves explicit edit %p during hydration',
        async (value) => {
            const el = mount();
            await flush();
            await flush();
            change(el, value);
            loadRecord(el, { Title: 'Server' });
            await flush();
            expect(el.answers.el_title).toBe(value);
        }
    );
    it('uses the real record-reader payload and distinguishes null from omitted fields', async () => {
        const el = mount();
        await flush();
        await flush();
        getRecord.emit({ id: RECORD, fields: { Title: { value: null } } });
        await flush();
        expect(el.answers.el_title).toBeNull();
        expect(el.answers.el_dept).toBe('Unassigned');
    });
    it('blocks a missing ID, handles a late ID, and clears the previous answers when removed', async () => {
        const el = await published({ recordId: null });
        expect(editSource(el)).toBeNull();
        expect(
            el.shadowRoot.querySelector('[role="alert"]').textContent
        ).toContain('existing record');
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(submitForm).not.toHaveBeenCalled();
        el.recordId = RECORD;
        await flush();
        loadRecord(el, { Title: 'A' });
        await flush();
        el.recordId = null;
        await flush();
        expect(el.answers.el_title).toBeUndefined();
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(submitForm).not.toHaveBeenCalled();
    });
    it('handles URL-only record changes without fetching the same spec again', async () => {
        const el = await published({ recordId: null });
        CurrentPageReference.emit({ state: { c__recordId: RECORD } });
        await flush();
        loadRecord(el, { Title: 'A' });
        await flush();
        CurrentPageReference.emit({ state: { c__recordId: B } });
        await flush();
        expect(editSource(el).recordId).toBe(B);
        expect(el.answers.el_title).toBeUndefined();
        loadRecord(el, { Title: 'B' });
        await flush();
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(
            JSON.parse(submitForm.mock.calls[0][0].payloadJson).meta.recordId
        ).toBe(B);
        expect(getSpec).toHaveBeenCalledTimes(1);
    });
    it('ignores stale A success/error after A to B to A and preserves same-ID edits', async () => {
        const el = mount();
        await flush();
        await flush();
        const old = identity(editSource(el));
        el.recordId = B;
        await flush();
        el.recordId = RECORD;
        await flush();
        const src = editSource(el);
        src.dispatchEvent(
            new CustomEvent('recordsuccess', {
                detail: { ...old, values: { Title: 'Stale A' } }
            })
        );
        src.dispatchEvent(
            new CustomEvent('recorderror', { detail: { ...old, error: {} } })
        );
        await flush();
        expect(el.answers.el_title).toBeUndefined();
        expect(el.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        loadRecord(el, { Title: 'Current A' });
        await flush();
        change(el, 'My edit');
        el.recordId = RECORD;
        await flush();
        expect(el.answers.el_title).toBe('My edit');
    });
    it('rejects failure and retries LDS without discarding edits', async () => {
        const el = await published();
        change(el, 'Typed');
        const old = identity(editSource(el));
        emit(editSource(el), 'recorderror', { error: {} });
        await flush();
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(submitForm).not.toHaveBeenCalled();
        el.shadowRoot.querySelector('lightning-button').click();
        await flush();
        await flush();
        expect(notifyRecordUpdateAvailable).toHaveBeenCalledWith([
            { recordId: RECORD }
        ]);
        const src = editSource(el);
        expect(src.generation).not.toBe(old.generation);
        src.dispatchEvent(
            new CustomEvent('recordsuccess', {
                detail: { ...old, values: { Title: 'Stale' } }
            })
        );
        await flush();
        loadRecord(el, { Title: 'Fresh' });
        await flush();
        expect(el.answers.el_title).toBe('Typed');
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        expect(submitForm).toHaveBeenCalledTimes(1);
    });
    it.each(['success', 'error'])(
        'ignores an old submit %s after switching records',
        async (outcome) => {
            const el = await published();
            loadRecord(el, { Title: 'A' });
            await flush();
            let resolve, reject;
            submitForm.mockImplementationOnce(
                () =>
                    new Promise((yes, no) => {
                        resolve = yes;
                        reject = no;
                    })
            );
            nav(el).dispatchEvent(new CustomEvent('submit'));
            await flush();
            el.recordId = B;
            await flush();
            if (outcome === 'success') resolve({ recordId: RECORD });
            else reject({ body: { message: 'Old failure' } });
            await flush();
            expect(
                el.shadowRoot.querySelector('c-final-after-submit')
            ).toBeNull();
            expect(el.submitError).toBeUndefined();
            loadRecord(el, { Title: 'B' });
            await flush();
            nav(el).dispatchEvent(new CustomEvent('submit'));
            await flush();
            expect(
                JSON.parse(submitForm.mock.calls[1][0].payloadJson).meta
                    .recordId
            ).toBe(B);
        }
    );
    it.each(['preserveEdits', 'alwaysReplace'])(
        'hydrates before lookup Autofill using %s',
        async (policy) => {
            const el = mount(lookupSpec(policy));
            await flush();
            await flush();
            expect(ruleSource(el)).toBeUndefined();
            loadRecord(el, {
                AccountId: '001000000000001AAA',
                Title: 'Record value'
            });
            await flush();
            const src = ruleSource(el);
            expect(src.recordId).toBe('001000000000001AAA');
            emit(src, 'recordsuccess', { values: { Phone: 'Autofilled' } });
            await flush();
            expect(el.answers.el_title).toBe(
                policy === 'preserveEdits' ? 'Record value' : 'Autofilled'
            );
            loadRecord(el, {
                AccountId: '001000000000009AAA',
                Title: 'Refresh'
            });
            await flush();
            expect(ruleSource(el)).toBeUndefined();
        }
    );
    it('preserves manual typing during Autofill and clears only rule-owned values', async () => {
        const el = mount(lookupSpec('alwaysReplace'));
        await flush();
        await flush();
        loadRecord(el, { AccountId: '001000000000001AAA', Title: null });
        await flush();
        change(el, 'Typed');
        emit(ruleSource(el), 'recordsuccess', {
            values: { Phone: 'Autofilled' }
        });
        await flush();
        expect(el.answers.el_title).toBe('Typed');
        nav(el).dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: 'el_account', value: '001000000000002AAA' }
            })
        );
        await flush();
        emit(ruleSource(el), 'recordsuccess', { values: { Phone: 'Second' } });
        await flush();
        expect(el.answers.el_title).toBe('Second');
        nav(el).dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: 'el_account', value: null }
            })
        );
        await flush();
        expect(el.answers.el_title).toBeNull();
    });
    it('reads Id and blocks Save even without mapped fields', async () => {
        const spec = JSON.parse(JSON.stringify(EDIT_SPEC));
        for (const field of spec.pages[0].sections[0].elements)
            delete field.binding;
        const el = mount(spec);
        await flush();
        await flush();
        expect(editSource(el).fields).toEqual([]);
        expect(el.shadowRoot.querySelector('c-final-submit-bar').disabled).toBe(
            true
        );
        loadRecord(el, {});
        await flush();
        expect(el.shadowRoot.querySelector('c-final-submit-bar').disabled).toBe(
            false
        );
    });
    it('restarts a pending read after reconnect and retains typing', async () => {
        const el = mount();
        await flush();
        await flush();
        const before = identity(editSource(el));
        change(el, 'Typed');
        el.remove();
        document.body.appendChild(el);
        await flush();
        await flush();
        expect(editSource(el).generation).not.toBe(before.generation);
        loadRecord(el, { Title: 'Record' });
        await flush();
        expect(el.answers.el_title).toBe('Typed');
    });
});

describe('edit request invalidation during retry and Autofill', () => {
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });
    it('ignores an old Autofill error before removing the current request', async () => {
        const el = mount(lookupSpec());
        await flush();
        await flush();
        loadRecord(el, { Title: null, AccountId: '001000000000001AAA' });
        await flush();
        const old = identity(ruleSource(el));
        el.recordId = B;
        await flush();
        loadRecord(el, { Title: null, AccountId: '001000000000002AAA' });
        await flush();
        const current = ruleSource(el);
        current.dispatchEvent(
            new CustomEvent('recorderror', { detail: { ...old, error: {} } })
        );
        await flush();
        expect(el.submitError).toBeUndefined();
        expect(ruleSource(el)).toBe(current);
        emit(current, 'recordsuccess', { values: { Phone: 'Current' } });
        await flush();
        expect(el.answers.el_title).toBe('Current');
    });
    it('does not let a pending retry restart the previous record', async () => {
        const el = mount();
        await flush();
        await flush();
        emit(editSource(el), 'recorderror', { error: {} });
        await flush();
        let finish;
        notifyRecordUpdateAvailable.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        el.shadowRoot.querySelector('lightning-button').click();
        await flush();
        el.recordId = B;
        await flush();
        const next = identity(editSource(el));
        finish();
        await flush();
        expect(identity(editSource(el))).toEqual(next);
        loadRecord(el, { Title: 'B' });
        await flush();
        expect(el.answers.el_title).toBe('B');
    });
});

import Toast from 'lightning/toast';
jest.mock('lightning/toast', () => ({
    __esModule: true,
    default: { show: jest.fn() }
}));
describe('loading presentation and previous-record failure feedback', () => {
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });
    it('hides the editable surface until hydration succeeds, keeping the reader and retry accessible', async () => {
        const el = await published();
        const surface = () =>
            el.shadowRoot.querySelector('[data-edit-surface]');
        expect(surface().hidden).toBe(true);
        expect(editSource(el)).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('lightning-spinner').alternativeText
        ).toBe('Loading record');
        emit(editSource(el), 'recorderror', { error: {} });
        await flush();
        expect(surface().hidden).toBe(true);
        expect(
            el.shadowRoot
                .querySelector('lightning-button')
                .closest('[data-edit-surface]')
        ).toBeNull();
        el.shadowRoot.querySelector('lightning-button').click();
        await flush();
        await flush();
        loadRecord(el, { Title: 'Loaded' });
        await flush();
        expect(surface().hidden).toBe(false);
        el.recordId = B;
        await flush();
        expect(surface().hidden).toBe(true);
    });
    it('shows a sticky toast identifying A when its save fails after navigation to B', async () => {
        const el = await published();
        loadRecord(el, { Title: 'A' });
        await flush();
        let fail;
        submitForm.mockImplementationOnce(
            () =>
                new Promise((resolve, reject) => {
                    fail = reject;
                })
        );
        nav(el).dispatchEvent(new CustomEvent('submit'));
        await flush();
        el.recordId = B;
        await flush();
        loadRecord(el, { Title: 'B' });
        await flush();
        fail({ body: { message: 'Validation failed' } });
        await flush();
        expect(Toast.show).toHaveBeenCalledWith(
            expect.objectContaining({
                label: expect.stringContaining(RECORD),
                mode: 'sticky',
                variant: 'error'
            }),
            expect.anything()
        );
        expect(el.answers.el_title).toBe('B');
        expect(el.submitError).toBeUndefined();
        expect(el.shadowRoot.querySelector('c-final-after-submit')).toBeNull();
    });
});
