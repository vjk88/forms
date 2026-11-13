import { createElement } from 'lwc';
import FinalSectionRenderer from 'c/finalSectionRenderer';

// Repeatable sections (schema §4.1): defined once, instantiated at runtime;
// entries answer as ONE consolidated `repeat:{sectionId}` value. The viewer
// owns the entries and hands them down (IMPL_PLAN_RELATED_RECORDS §3).
const SECTION = (extra = {}) => ({
    id: 'sec_rep',
    title: 'Team members',
    columns: 1,
    repeat: {
        childObject: 'Contact',
        relationshipField: 'AccountId',
        style: 'stacked',
        addLabel: 'Add member',
        removeLabel: 'Remove',
        entryLabel: 'Member {index}',
        min: 1,
        max: 3
    },
    elements: [
        {
            id: 'el_name',
            type: 'field',
            label: 'Name',
            config: { inputType: 'text' }
        },
        {
            id: 'el_mail',
            type: 'field',
            label: 'Email',
            config: { inputType: 'text' }
        }
    ],
    entries: [{ key: 'en_0', values: {} }],
    nextEntrySeq: 1,
    ...extra
});

const flush = () => Promise.resolve();

async function mount(section = SECTION()) {
    const el = createElement('c-final-section-renderer', {
        is: FinalSectionRenderer
    });
    el.section = section;
    document.body.appendChild(el);
    await flush();
    return el;
}

const renderers = (el) =>
    el.shadowRoot.querySelectorAll('c-final-element-renderer');

function answer(renderer, value) {
    renderer.dispatchEvent(
        new CustomEvent('valuechange', {
            detail: { elementId: renderer.element.id, value }
        })
    );
}

describe('c-final-section-renderer repeats', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('is created from stored entries: draws each with its values and keys', async () => {
        const el = await mount(
            SECTION({
                entries: [
                    { key: 'en_0', values: { el_name: 'Kim' } },
                    { key: 'en_3', values: { el_name: 'Lee' } }
                ],
                nextEntrySeq: 4
            })
        );
        expect(el.shadowRoot.querySelectorAll('.rep-entry')).toHaveLength(2);
        expect(renderers(el)[0].element.value).toBe('Kim');
        expect(renderers(el)[2].element.value).toBe('Lee');
        expect(renderers(el)[2].element.id).toBe('el_name::en_3');
    });

    it('does not let a stored snapshot be mutated by typing', async () => {
        const values = Object.freeze({ el_name: 'Kim' });
        const el = await mount(
            SECTION({ entries: [{ key: 'en_0', values }], nextEntrySeq: 1 })
        );
        answer(renderers(el)[0], 'Changed');
        expect(values.el_name).toBe('Kim');
    });

    it('a new entries list with the same keys never overwrites typing; a new preview revision re-seeds', async () => {
        const el = await mount(SECTION({ previewRevision: 1 }));
        answer(renderers(el)[0], 'Typing');
        el.section = SECTION({
            previewRevision: 1,
            entries: [{ key: 'en_0', values: { el_name: 'Stale' } }]
        });
        await flush();
        expect(renderers(el)[0].element.value).toBe('Typing');

        el.section = SECTION({
            previewRevision: 2,
            entries: [{ key: 'en_0', values: {} }]
        });
        await flush();
        expect(renderers(el)[0].element.value).toBeUndefined();
    });

    it('renders min entries with instanced ids, {index} labels, and the add button', async () => {
        const el = await mount();
        expect(el.shadowRoot.querySelectorAll('.rep-entry')).toHaveLength(1);
        expect(
            el.shadowRoot.querySelector('.rep-entry-label').textContent
        ).toBe('Member 1');
        expect(renderers(el)[0].element.id).toBe('el_name::en_0');
        expect(el.shadowRoot.querySelector('.rep-add').textContent).toContain(
            'Add member'
        );
        // min floor: the only entry can't be removed
        expect(el.shadowRoot.querySelector('.rep-remove')).toBeNull();
    });

    it('Min 0 with no entries shows only the Add button', async () => {
        const el = await mount(
            SECTION({
                repeat: { ...SECTION().repeat, min: 0 },
                entries: [],
                nextEntrySeq: 0
            })
        );
        expect(el.shadowRoot.querySelectorAll('.rep-entry')).toHaveLength(0);
        expect(el.shadowRoot.querySelector('.rep-add')).not.toBeNull();
    });

    it('add/remove respect min & max; every change carries keys, the counter and what changed', async () => {
        const el = await mount();
        const events = [];
        el.addEventListener('valuechange', (e) => events.push(e.detail));

        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        expect(el.shadowRoot.querySelectorAll('.rep-entry')).toHaveLength(3);
        // max = 3 → the add affordance is gone
        expect(el.shadowRoot.querySelector('.rep-add')).toBeNull();
        expect(events.at(-1)).toEqual({
            elementId: 'repeat:sec_rep',
            value: [{}, {}, {}],
            keys: ['en_0', 'en_1', 'en_2'],
            nextEntrySeq: 3,
            change: { kind: 'add', key: 'en_2' }
        });

        el.shadowRoot.querySelectorAll('.rep-remove')[2].click();
        await flush();
        expect(events.at(-1)).toMatchObject({
            value: [{}, {}],
            keys: ['en_0', 'en_1'],
            nextEntrySeq: 3,
            change: { kind: 'remove', key: 'en_2' }
        });
    });

    it('never reuses a removed key, even when created again from stored entries', async () => {
        const el = await mount();
        const events = [];
        el.addEventListener('valuechange', (e) => events.push(e.detail));
        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        el.shadowRoot.querySelectorAll('.rep-remove')[2].click();
        await flush();
        const last = events.at(-1);
        el.remove(); // the page was left

        // ...and come back to: drawn again from what the viewer stored
        const again = await mount(
            SECTION({
                entries: last.keys.map((key) => ({ key, values: {} })),
                nextEntrySeq: last.nextEntrySeq
            })
        );
        const more = [];
        again.addEventListener('valuechange', (e) => more.push(e.detail));
        again.shadowRoot.querySelector('.rep-add').click();
        await flush();
        expect(more.at(-1).keys).toEqual(['en_0', 'en_1', 'en_3']);
        expect(more.at(-1).nextEntrySeq).toBe(4);
    });

    it('entry inputs fold into per-entry maps keyed by the ORIGINAL element id', async () => {
        const el = await mount();
        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        const events = [];
        el.addEventListener('valuechange', (e) => events.push(e.detail));

        answer(renderers(el)[2], 'Kim');
        expect(events.at(-1)).toMatchObject({
            elementId: 'repeat:sec_rep',
            value: [{}, { el_name: 'Kim' }],
            change: { kind: 'answer', key: 'en_1', elementId: 'el_name' }
        });

        // removing entry 1 keeps entry 2's values, reordered
        el.shadowRoot.querySelector('.rep-remove').click();
        await flush();
        expect(events.at(-1).value).toEqual([{ el_name: 'Kim' }]);
    });

    it('per entry: hidden questions are left out, errors and the focus number reach only the named question', async () => {
        const el = await mount(
            SECTION({
                entries: [
                    { key: 'en_0', values: {}, hidden: ['el_mail'] },
                    {
                        key: 'en_1',
                        values: {},
                        errors: { el_mail: ['Need it.'] },
                        focus: { n: 7, elementId: 'el_mail' }
                    }
                ],
                nextEntrySeq: 2
            })
        );
        const list = [...renderers(el)].map((r) => r.element);
        expect(list.map((e) => e.id)).toEqual([
            'el_name::en_0',
            'el_name::en_1',
            'el_mail::en_1'
        ]);
        expect(list[2].errors).toEqual(['Need it.']);
        expect(list[2].focusRequest).toBe(7);
        expect(list[1].focusRequest).toBeUndefined();
        expect(list[1].errors).toBeUndefined();
    });

    it('the × names the entry for screen readers', async () => {
        const el = await mount(
            SECTION({
                entries: [
                    { key: 'en_0', values: {} },
                    { key: 'en_1', values: {} }
                ],
                nextEntrySeq: 2
            })
        );
        const x = el.shadowRoot.querySelectorAll('.rep-remove')[1];
        expect(x.getAttribute('aria-label')).toBe('Remove Member 2');
    });

    it('each entry is a named group; a title without {index} still numbers the ×', async () => {
        const el = await mount(
            SECTION({
                repeat: { ...SECTION().repeat, entryLabel: 'Case' },
                entries: [
                    { key: 'en_0', values: {} },
                    { key: 'en_1', values: {} }
                ],
                nextEntrySeq: 2
            })
        );
        const entries = el.shadowRoot.querySelectorAll('.rep-entry');
        expect(entries[1].getAttribute('role')).toBe('group');
        expect(entries[1].getAttribute('aria-label')).toBe('Case');
        expect(
            el.shadowRoot
                .querySelectorAll('.rep-remove')[1]
                .getAttribute('aria-label')
        ).toBe('Remove Case 2');
    });

    it('shows the minimum message the viewer sends', async () => {
        const el = await mount(
            SECTION({ minMessage: 'Fill in at least 1 entry.' })
        );
        expect(el.shadowRoot.querySelector('.rep-min').textContent).toBe(
            'Fill in at least 1 entry.'
        );
    });

    it('after Add the new entry’s first question gets a focus request; after × the Add button takes focus', async () => {
        const el = await mount();
        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        const newFirst = [...renderers(el)].find(
            (r) => r.element.id === 'el_name::en_1'
        );
        expect(newFirst.element.focusRequest).toMatch(/^rep:/);

        el.shadowRoot.querySelectorAll('.rep-remove')[1].click();
        await flush();
        await flush();
        expect(el.shadowRoot.activeElement).toBe(
            el.shadowRoot.querySelector('.rep-add')
        );
    });

    it('non-repeat sections re-emit plain valuechange untouched', async () => {
        const plain = SECTION();
        delete plain.repeat;
        const el = await mount(plain);
        const events = [];
        el.addEventListener('valuechange', (e) => events.push(e.detail));
        renderers(el)[0].dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: 'el_name', value: 'x' }
            })
        );
        expect(events).toEqual([{ elementId: 'el_name', value: 'x' }]);
    });
});
