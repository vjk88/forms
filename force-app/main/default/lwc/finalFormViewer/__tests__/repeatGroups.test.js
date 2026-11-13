import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getSpecEnvelope from '@salesforce/apex/FinalSpecController.getSpecEnvelope';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpecEnvelope',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/**
 * Repeating groups at runtime (IMPL_PLAN_RELATED_RECORDS Part 1, §3–§5):
 * rules and checks per entry, the minimum, entries that survive leaving the
 * page, server refusals on the right entry, the 50 cap, broken limits.
 */
const WHEN_HIGH = {
    action: 'show',
    logic: 'all',
    rules: [{ source: 'el_prio', operator: 'equals', value: 'High' }]
};

function makeSpec({ layout = 'scroll', repeat = {}, subject = {} } = {}) {
    const group = {
        id: 'sec_cases',
        title: 'Cases',
        style: 'plain',
        columns: 1,
        repeat: {
            childObject: 'Case',
            relationshipField: 'ContactId',
            entryLabel: 'Case {index}',
            addLabel: 'Add Case',
            min: 1,
            max: null,
            ...repeat
        },
        elements: [
            {
                id: 'el_prio',
                type: 'field',
                label: 'Priority',
                binding: { object: 'Case', field: 'Priority' },
                render: { inputType: 'text' }
            },
            {
                id: 'el_subj',
                type: 'field',
                label: 'Subject',
                binding: { object: 'Case', field: 'Subject' },
                render: { inputType: 'text' },
                ...subject
            }
        ]
    };
    const main = {
        id: 'sec_main',
        title: 'You',
        style: 'plain',
        columns: 1,
        elements: [
            {
                id: 'el_ln',
                type: 'field',
                label: 'Last Name',
                binding: { object: 'Contact', field: 'LastName' },
                render: { inputType: 'text' }
            }
        ]
    };
    const pages =
        layout === 'scroll'
            ? [{ id: 'pg_1', name: 'One', sections: [main, group] }]
            : [
                  { id: 'pg_1', name: 'One', sections: [group] },
                  { id: 'pg_2', name: 'Two', sections: [main] }
              ];
    return {
        specVersion: 1,
        form: { name: 'Groups', targetObject: 'Contact' },
        layout: { type: layout, options: {} },
        header: { style: 'none' },
        theme: null,
        settings: { completion: { mode: 'screen' } },
        submit: { label: 'Send' },
        pages
    };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function deepQueryAll(root, selector, acc = []) {
    acc.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            deepQueryAll(el.shadowRoot, selector, acc);
        }
    }
    return acc;
}
const deepQuery = (root, selector) => deepQueryAll(root, selector)[0] || null;

/** The element renderers of one entry, by their instanced ids. */
const entryEls = (el, key) =>
    deepQueryAll(el.shadowRoot, 'c-final-element-renderer')
        .map((r) => r.element)
        .filter((e) => e.id.endsWith(`::${key}`));

function typeIn(el, elementId, value) {
    const r = deepQueryAll(el.shadowRoot, 'c-final-element-renderer').find(
        (x) => x.element.id === elementId
    );
    if (!r) {
        throw new Error(`${elementId} is not on screen`);
    }
    const input = r.shadowRoot.querySelector('lightning-input');
    input.value = value;
    input.type = 'text';
    input.dispatchEvent(new CustomEvent('change'));
}

const bar = (el) => deepQuery(el.shadowRoot, 'c-final-submit-bar');

async function mount(spec, { delegate = true } = {}) {
    getSpecEnvelope.mockResolvedValue({
        versionId: 'a0Vserved',
        spec: JSON.stringify(spec)
    });
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.versionId = 'a0Vx';
    if (delegate) {
        el.delegateSubmit = true;
        el.payloads = [];
        el.addEventListener('submitrequest', (e) =>
            el.payloads.push(e.detail.payload)
        );
    }
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

async function submit(el) {
    bar(el).dispatchEvent(new CustomEvent('submit'));
    await flush();
    await flush();
    if (el.payloads && el.payloads.length > (el.released || 0)) {
        el.released = el.payloads.length;
        el.failSubmit('release');
        await flush();
    }
}

async function add(el) {
    deepQuery(el.shadowRoot, '.rep-add').click();
    await flush();
}

describe('repeating groups in the viewer', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('a rule between questions of the group works entry by entry', async () => {
        const el = await mount(
            makeSpec({ subject: { visibility: WHEN_HIGH } })
        );
        await add(el);
        expect(entryEls(el, 'en_0').map((e) => e.id)).toEqual([
            'el_prio::en_0'
        ]);
        typeIn(el, 'el_prio::en_0', 'High');
        await flush();
        expect(entryEls(el, 'en_0').map((e) => e.id)).toContain(
            'el_subj::en_0'
        );
        // entry 2 reads its OWN Priority
        expect(entryEls(el, 'en_1').map((e) => e.id)).toEqual([
            'el_prio::en_1'
        ]);
    });

    it('a question hidden in one entry keeps its answer in memory, comes back showing it, and is not sent', async () => {
        const el = await mount(
            makeSpec({ subject: { visibility: WHEN_HIGH } })
        );
        typeIn(el, 'el_ln', 'Riley');
        typeIn(el, 'el_prio::en_0', 'High');
        await flush();
        typeIn(el, 'el_subj::en_0', 'Printer');
        await flush();
        typeIn(el, 'el_prio::en_0', 'Low');
        await flush();
        await submit(el);
        expect(el.payloads[0].repeats.sec_cases).toEqual([{ el_prio: 'Low' }]);

        typeIn(el, 'el_prio::en_0', 'High');
        await flush();
        const subj = entryEls(el, 'en_0').find((e) => e.id === 'el_subj::en_0');
        expect(subj.value).toBe('Printer');
    });

    it('an entry whose only answer sits in a hidden question counts as untouched', async () => {
        const el = await mount(
            makeSpec({
                repeat: { min: 1 },
                subject: {
                    visibility: WHEN_HIGH,
                    validation: [{ type: 'required', message: 'Need it.' }]
                }
            })
        );
        typeIn(el, 'el_prio::en_0', 'High');
        await flush();
        typeIn(el, 'el_subj::en_0', 'x');
        await flush();
        typeIn(el, 'el_prio::en_0', '');
        await flush();
        await submit(el);
        expect(el.payloads).toHaveLength(0);
        expect(deepQuery(el.shadowRoot, '.rep-min').textContent).toBe(
            'Fill in at least 1 entry.'
        );
    });

    it('a required question in a STARTED entry blocks and is counted; an untouched entry is never red', async () => {
        const el = await mount(
            makeSpec({
                repeat: { min: 0 },
                subject: {
                    validation: [{ type: 'required', message: 'Need it.' }]
                }
            })
        );
        await add(el);
        await add(el);
        typeIn(el, 'el_prio::en_0', 'Low');
        await flush();
        await submit(el);
        expect(el.payloads).toHaveLength(0);
        const subj0 = entryEls(el, 'en_0').find(
            (e) => e.id === 'el_subj::en_0'
        );
        expect(subj0.errors).toEqual(['Need it.']);
        expect(subj0.focusRequest).toBeTruthy();
        // the optional Priority before it is not the target
        expect(
            entryEls(el, 'en_0').find((e) => e.id === 'el_prio::en_0')
                .focusRequest
        ).toBeUndefined();
        expect(entryEls(el, 'en_1').some((e) => e.errors)).toBe(false);
        expect(bar(el).blockedMessage).toBe('Fix 1 field to submit');

        typeIn(el, 'el_subj::en_0', 'Fixed');
        await flush();
        await submit(el);
        expect(el.payloads).toHaveLength(1);
    });

    it('Min 2 with nothing else to check still blocks, counts once and points at the first untouched entry', async () => {
        const el = await mount(makeSpec({ repeat: { min: 2 } }));
        typeIn(el, 'el_prio::en_0', 'Low');
        await flush();
        await submit(el);
        expect(el.payloads).toHaveLength(0);
        expect(deepQuery(el.shadowRoot, '.rep-min').textContent).toBe(
            'Fill in at least 2 entries.'
        );
        expect(bar(el).blockedMessage).toBe('Fix 1 field to submit');
        expect(
            entryEls(el, 'en_1').find((e) => e.id === 'el_prio::en_1')
                .focusRequest
        ).toBeTruthy();

        typeIn(el, 'el_prio::en_1', 'High');
        await flush();
        expect(deepQuery(el.shadowRoot, '.rep-min')).toBeNull();
        await submit(el);
        expect(el.payloads).toHaveLength(1);
    });

    it('Min 0 starts empty and submits with no entries', async () => {
        const el = await mount(makeSpec({ repeat: { min: 0 } }));
        expect(deepQueryAll(el.shadowRoot, '.rep-entry')).toHaveLength(0);
        await submit(el);
        expect(el.payloads).toHaveLength(1);
    });

    it('a group hidden by a rule neither blocks nor counts its minimum', async () => {
        const spec = makeSpec({ repeat: { min: 1 } });
        spec.pages[0].sections[1].visibility = {
            action: 'show',
            logic: 'all',
            rules: [{ source: 'el_ln', operator: 'equals', value: 'Show' }]
        };
        const el = await mount(spec);
        await submit(el);
        expect(el.payloads).toHaveLength(1);
        expect(el.payloads[0].repeats).toEqual({});
    });

    it('entries survive Next and Back on a paged layout', async () => {
        const el = await mount(
            makeSpec({ layout: 'stepper', repeat: { min: 1 } })
        );
        typeIn(el, 'el_prio::en_0', 'High');
        await add(el);
        typeIn(el, 'el_prio::en_1', 'Low');
        await flush();
        bar(el).dispatchEvent(new CustomEvent('next'));
        await flush();
        expect(deepQueryAll(el.shadowRoot, '.rep-entry')).toHaveLength(0);
        bar(el).dispatchEvent(new CustomEvent('back'));
        await flush();
        await flush();
        expect(deepQueryAll(el.shadowRoot, '.rep-entry')).toHaveLength(2);
        expect(
            entryEls(el, 'en_1').find((e) => e.id === 'el_prio::en_1').value
        ).toBe('Low');
    });

    it('a removed key is never handed out again after leaving the page', async () => {
        const el = await mount(
            makeSpec({ layout: 'stepper', repeat: { min: 0 } })
        );
        await add(el);
        await add(el);
        await add(el);
        deepQueryAll(el.shadowRoot, '.rep-remove')[2].click();
        await flush();
        typeIn(el, 'el_prio::en_0', 'Low');
        await flush();
        bar(el).dispatchEvent(new CustomEvent('next'));
        await flush();
        bar(el).dispatchEvent(new CustomEvent('back'));
        await flush();
        await flush();
        await add(el);
        const ids = deepQueryAll(el.shadowRoot, 'c-final-element-renderer').map(
            (r) => r.element.id
        );
        expect(ids).toContain('el_prio::en_3');
        expect(ids).not.toContain('el_prio::en_2');
        expect(entryEls(el, 'en_3').some((e) => e.errors)).toBe(false);
    });

    it('with Max blank the Add button stops at 50 entries', async () => {
        const el = await mount(makeSpec({ repeat: { min: 0, max: null } }));
        for (let i = 0; i < 50; i++) {
            deepQuery(el.shadowRoot, '.rep-add').click();
        }
        await flush();
        expect(deepQueryAll(el.shadowRoot, '.rep-entry')).toHaveLength(50);
        expect(deepQuery(el.shadowRoot, '.rep-add')).toBeNull();
    });

    it('a published Max of 500 is treated as 50; Max 5 stays 5', async () => {
        const big = await mount(makeSpec({ repeat: { min: 0, max: 500 } }));
        const sec = (v) =>
            deepQueryAll(v.shadowRoot, 'c-final-section-renderer').find(
                (s) => s.section.repeat
            ).section;
        expect(sec(big).repeatLimits).toEqual({ min: 0, max: 50 });
        big.remove();
        const small = await mount(makeSpec({ repeat: { min: 0, max: 5 } }));
        expect(sec(small).repeatLimits).toEqual({ min: 0, max: 5 });
    });

    it.each([
        [{ min: 51, max: null }],
        [{ min: 6, max: 5 }],
        [{ min: 1.5 }],
        [{ min: 1, max: -2 }],
        [{ min: 'many' }]
    ])('limits %j do not open the form', async (repeat) => {
        const el = await mount(makeSpec({ repeat }));
        expect(el.shadowRoot.querySelector('.viewer-error').textContent).toBe(
            'The entry limits for Cases need to be corrected by the form owner.'
        );
        expect(deepQuery(el.shadowRoot, '.rep-entry')).toBeNull();
    });

    it('a server refusal lands on its own entry and stays with it when an earlier entry is removed', async () => {
        const el = await mount(makeSpec({ repeat: { min: 0 } }), {
            delegate: false
        });
        typeIn(el, 'el_ln', 'Riley');
        await add(el);
        await add(el);
        await add(el);
        typeIn(el, 'el_subj::en_0', 'ok');
        typeIn(el, 'el_subj::en_2', 'bad');
        await flush();
        submitForm.mockResolvedValue({
            errors: [
                {
                    message: 'Subject cannot be bad.',
                    fields: ['Subject'],
                    sectionId: 'sec_cases',
                    entryIndex: 2
                },
                // names the same LABEL outside any group: never a group's
                { message: 'Last Name is odd.', fields: ['Last Name'] }
            ]
        });
        await submit(el);
        const errOf = (key, id) =>
            (entryEls(el, key).find((e) => e.id === `${id}::${key}`) || {})
                .errors;
        expect(errOf('en_2', 'el_subj')).toEqual(['Subject cannot be bad.']);
        expect(errOf('en_0', 'el_subj')).toBeUndefined();
        expect(errOf('en_1', 'el_subj')).toBeUndefined();

        // answering in ANOTHER entry clears nothing
        typeIn(el, 'el_prio::en_1', 'Low');
        await flush();
        expect(errOf('en_2', 'el_subj')).toEqual(['Subject cannot be bad.']);

        // remove the FIRST entry: the message stays with entry en_2
        deepQueryAll(el.shadowRoot, '.rep-remove')[0].click();
        await flush();
        expect(errOf('en_2', 'el_subj')).toEqual(['Subject cannot be bad.']);
        expect(errOf('en_1', 'el_subj')).toBeUndefined();

        // answering that question clears it
        typeIn(el, 'el_subj::en_2', 'better');
        await flush();
        expect(errOf('en_2', 'el_subj')).toBeUndefined();
    });

    it('a refusal about a row itself (no field) lands on that row, not only the banner', async () => {
        const el = await mount(makeSpec({ repeat: { min: 0 } }), {
            delegate: false
        });
        await add(el);
        typeIn(el, 'el_subj::en_0', 'x');
        await flush();
        submitForm.mockResolvedValue({
            errors: [
                {
                    message:
                        'This Case is changed in two lists with different values. Change it in one of them.',
                    fields: [],
                    sectionId: 'sec_cases',
                    entryIndex: 0
                }
            ]
        });
        await submit(el);
        const sec = deepQueryAll(
            el.shadowRoot,
            'c-final-section-renderer'
        ).find((x) => x.section.repeat).section;
        expect(sec.entries[0].errors.__row).toEqual([
            'This Case is changed in two lists with different values. Change it in one of them.'
        ]);
        expect(bar(el).blockedMessage).toBe(
            'Some answers were not accepted. See the highlighted fields.'
        );
    });

    it('removing the refused entry clears its message; the next Submit clears everything', async () => {
        const el = await mount(makeSpec({ repeat: { min: 0 } }), {
            delegate: false
        });
        await add(el);
        await add(el);
        typeIn(el, 'el_subj::en_0', 'a');
        typeIn(el, 'el_subj::en_1', 'bad');
        await flush();
        submitForm.mockResolvedValue({
            errors: [
                {
                    message: 'Nope.',
                    fields: ['Subject'],
                    sectionId: 'sec_cases',
                    entryIndex: 0
                }
            ]
        });
        await submit(el);
        expect(entryEls(el, 'en_0').find((e) => e.errors)).toBeTruthy();
        deepQueryAll(el.shadowRoot, '.rep-remove')[0].click();
        await flush();
        expect(
            deepQueryAll(el.shadowRoot, 'c-final-element-renderer').some(
                (r) => r.element.errors
            )
        ).toBe(false);

        submitForm.mockResolvedValue({
            errors: [
                {
                    message: 'Nope.',
                    fields: ['Subject'],
                    sectionId: 'sec_cases',
                    entryIndex: 0
                }
            ]
        });
        await submit(el);
        expect(entryEls(el, 'en_1').find((e) => e.errors)).toBeTruthy();
        submitForm.mockResolvedValue({ recordId: '003X' });
        await submit(el);
        expect(submitForm).toHaveBeenCalledTimes(3);
    });
});
