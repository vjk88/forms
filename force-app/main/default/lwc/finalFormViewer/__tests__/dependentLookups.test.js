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

const flush = () => new Promise((r) => setTimeout(r, 0));

const lookupEl = (id, label, referenceTo, lookupConfig) => {
    const el = {
        id,
        type: 'field',
        label,
        config: { inputType: 'reference', referenceTo }
    };
    if (lookupConfig) {
        el.lookupConfig = lookupConfig;
    }
    return el;
};

const answerCriterion = (fieldPath, elementId) => ({
    id: 'lc_' + elementId,
    fieldPath,
    operator: 'eq',
    value: { kind: 'answer', elementId }
});

const cfg = (criteria, mode = 'all') => ({
    version: 1,
    filter: { mode, criteria }
});

const specWith = (elements) => ({
    specVersion: 1,
    form: { name: 'Dependent', targetObject: 'Case' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Submit' },
    pages: [
        {
            id: 'pg_1',
            name: 'Page 1',
            sections: [{ id: 'sec_1', style: 'plain', columns: 1, elements }]
        }
    ]
});

/** Account, then a Contact filtered by that Account. */
const ACCOUNT_THEN_CONTACT = specWith([
    lookupEl('el_account', 'Account', 'Account'),
    lookupEl(
        'el_contact',
        'Contact',
        'Contact',
        cfg([answerCriterion('AccountId', 'el_account')])
    )
]);

const mount = (spec = ACCOUNT_THEN_CONTACT) => {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = JSON.parse(JSON.stringify(spec));
    document.body.appendChild(el);
    return el;
};

/**
 * The rendered lookup control for one element.
 *
 * Asserting on the real component rather than on an internal view model means
 * these tests fail if the wiring between viewer, renderer and adapter breaks,
 * which is where three of the last four shipped defects actually lived.
 */
const lookupFor = (viewer, elementId) => {
    const found = [];
    const walk = (root) => {
        if (!root) {
            return;
        }
        for (const node of root.querySelectorAll('*')) {
            if (
                node.tagName === 'C-FINAL-LOOKUP' &&
                node.elementId === elementId
            ) {
                found.push(node);
            }
            if (node.shadowRoot) {
                walk(node.shadowRoot);
            }
        }
    };
    walk(viewer.shadowRoot);
    return found[0] || null;
};

/**
 * A respondent choosing a record in a lookup.
 *
 * Dispatched FROM the rendered control so it travels the real path: adapter to
 * renderer to viewer. Firing it at the host would skip the wiring entirely and
 * prove nothing about it.
 */
const answer = (viewer, elementId, value) => {
    const control = lookupFor(viewer, elementId);
    if (!control) {
        throw new Error('No lookup rendered for ' + elementId);
    }
    control.dispatchEvent(
        new CustomEvent('valuechange', {
            detail: { elementId, value },
            bubbles: true,
            composed: true
        })
    );
};

describe('dependent lookups in the viewer', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('blocks the child until its parent is answered, and says which one', async () => {
        const el = mount();
        await flush();
        const contact = lookupFor(el, 'el_contact');
        expect(contact.filter).toBeNull();
        expect(contact.unavailableMessage).toBe('Choose Account first.');
    });

    it('compiles the parent answer into the child filter', async () => {
        const el = mount();
        await flush();
        answer(el, 'el_account', '001AAA');
        await flush();

        const contact = lookupFor(el, 'el_contact');
        expect(contact.unavailableMessage).toBeUndefined();
        expect(contact.filter).toEqual({
            criteria: [
                { fieldPath: 'AccountId', operator: 'eq', value: '001AAA' }
            ]
        });
    });

    it('clears the child when the parent changes', async () => {
        const el = mount();
        await flush();
        answer(el, 'el_account', '001AAA');
        await flush();
        answer(el, 'el_contact', '003AAA');
        await flush();
        expect(el.answers.el_contact).toBe('003AAA');

        answer(el, 'el_account', '001BBB');
        await flush();

        // The native control would happily keep showing the old contact; it
        // never checks its own value against a changed filter.
        expect(el.answers.el_contact).toBeNull();
        expect(lookupFor(el, 'el_contact').filter.criteria[0].value).toBe(
            '001BBB'
        );
    });

    it('blocks and clears the child when the parent is cleared', async () => {
        const el = mount();
        await flush();
        answer(el, 'el_account', '001AAA');
        await flush();
        answer(el, 'el_contact', '003AAA');
        await flush();

        answer(el, 'el_account', null);
        await flush();

        expect(el.answers.el_contact).toBeNull();
        expect(lookupFor(el, 'el_contact').unavailableMessage).toBe(
            'Choose Account first.'
        );
    });

    it('leaves the child alone when the parent is re-set to the same record', async () => {
        const el = mount();
        await flush();
        answer(el, 'el_account', '001AAA');
        await flush();
        answer(el, 'el_contact', '003AAA');
        await flush();

        // A same-value write is not a change, and must not cost the
        // respondent the answer they already gave.
        answer(el, 'el_account', '001AAA');
        await flush();

        expect(el.answers.el_contact).toBe('003AAA');
    });

    it('leaves an unrelated lookup untouched', async () => {
        const el = mount(
            specWith([
                lookupEl('el_account', 'Account', 'Account'),
                lookupEl(
                    'el_contact',
                    'Contact',
                    'Contact',
                    cfg([answerCriterion('AccountId', 'el_account')])
                ),
                lookupEl('el_sibling', 'Owner', 'User')
            ])
        );
        await flush();
        answer(el, 'el_sibling', '005AAA');
        await flush();
        answer(el, 'el_account', '001AAA');
        await flush();
        answer(el, 'el_contact', '003AAA');
        await flush();

        answer(el, 'el_account', '001BBB');
        await flush();

        expect(el.answers.el_contact).toBeNull();
        expect(el.answers.el_sibling).toBe('005AAA');
    });

    it('clears a whole chain in one go, parent first', async () => {
        const el = mount(
            specWith([
                lookupEl('el_account', 'Account', 'Account'),
                lookupEl(
                    'el_contact',
                    'Contact',
                    'Contact',
                    cfg([answerCriterion('AccountId', 'el_account')])
                ),
                lookupEl(
                    'el_case',
                    'Case',
                    'Case',
                    cfg([answerCriterion('ContactId', 'el_contact')])
                )
            ])
        );
        await flush();
        answer(el, 'el_account', '001AAA');
        await flush();
        answer(el, 'el_contact', '003AAA');
        await flush();
        answer(el, 'el_case', '500AAA');
        await flush();

        answer(el, 'el_account', '001BBB');
        await flush();

        expect(el.answers.el_contact).toBeNull();
        expect(el.answers.el_case).toBeNull();
        expect(lookupFor(el, 'el_case').unavailableMessage).toBe(
            'Choose Contact first.'
        );
    });

    it('stamps a generation that moves with the filter', async () => {
        const el = mount();
        await flush();
        const before = lookupFor(el, 'el_contact').contextKey;

        answer(el, 'el_account', '001AAA');
        await flush();
        const after = lookupFor(el, 'el_contact').contextKey;

        // The adapter drops a selection stamped with a retired generation, so
        // this has to move whenever what the control may search moves.
        expect(after).not.toBe(before);
    });

    it('does not disturb a lookup that carries no filter', async () => {
        const el = mount(
            specWith([lookupEl('el_plain', 'Account', 'Account')])
        );
        await flush();
        const plain = lookupFor(el, 'el_plain');
        expect(plain.filter).toBeUndefined();
        expect(plain.unavailableMessage).toBeUndefined();

        answer(el, 'el_plain', '001AAA');
        await flush();
        expect(el.answers.el_plain).toBe('001AAA');
    });

    it('names every parent when a filter reads more than one', async () => {
        const el = mount(
            specWith([
                lookupEl('el_account', 'Account', 'Account'),
                lookupEl('el_owner', 'Owner', 'User'),
                lookupEl(
                    'el_contact',
                    'Contact',
                    'Contact',
                    cfg([
                        answerCriterion('AccountId', 'el_account'),
                        answerCriterion('OwnerId', 'el_owner')
                    ])
                )
            ])
        );
        await flush();
        expect(lookupFor(el, 'el_contact').unavailableMessage).toBe(
            'Choose Account and Owner first.'
        );

        answer(el, 'el_account', '001AAA');
        await flush();
        // One answered, one still missing: the lookup stays blocked, and the
        // message still names both, because either could be the one to fix.
        expect(lookupFor(el, 'el_contact').filter).toBeNull();
    });

    it('passes the authored display and search settings straight through', async () => {
        const withDisplay = cfg([answerCriterion('AccountId', 'el_account')]);
        withDisplay.displayInfo = {
            primaryField: 'Name',
            additionalFields: ['Title']
        };
        withDisplay.matchingInfo = {
            primaryField: { fieldPath: 'Name', mode: 'startsWith' }
        };
        const el = mount(
            specWith([
                lookupEl('el_account', 'Account', 'Account'),
                lookupEl('el_contact', 'Contact', 'Contact', withDisplay)
            ])
        );
        await flush();
        const contact = lookupFor(el, 'el_contact');
        expect(contact.displayInfo).toEqual({
            primaryField: 'Name',
            additionalFields: ['Title']
        });
        expect(contact.matchingInfo).toEqual({
            primaryField: { fieldPath: 'Name', mode: 'startsWith' }
        });
    });

    it('refuses a filter format it does not recognise instead of guessing', async () => {
        const el = mount(
            specWith([
                lookupEl('el_account', 'Account', 'Account'),
                lookupEl('el_contact', 'Contact', 'Contact', {
                    version: 99,
                    filter: {
                        mode: 'all',
                        criteria: [answerCriterion('AccountId', 'el_account')]
                    }
                })
            ])
        );
        await flush();
        // Unknown version means no compiled filter at all, and therefore no
        // dependency: the lookup behaves as the unfiltered one it used to be
        // rather than silently applying a rule nobody can read.
        const contact = lookupFor(el, 'el_contact');
        expect(contact.filter).toBeUndefined();
        expect(contact.unavailableMessage).toBeUndefined();
    });

    it('blocks rather than widening when the filter cannot be compiled', async () => {
        const el = mount(
            specWith([
                lookupEl('el_account', 'Account', 'Account'),
                lookupEl(
                    'el_contact',
                    'Contact',
                    'Contact',
                    cfg([{ id: 'lc_broken', operator: 'eq' }])
                )
            ])
        );
        await flush();
        const contact = lookupFor(el, 'el_contact');
        expect(contact.filter).toBeNull();
        expect(contact.unavailableMessage).toContain('not set up correctly');
    });

    /**
     * These two go through the CORE, not the adapter.
     *
     * Every other test here dispatches `valuechange` from the adapter, which
     * skips the stale-generation guard entirely. That gap is exactly why the
     * whole suite stayed green while a browser showed the child still holding
     * its old contact after the parent moved.
     */
    describe('through the real control chain', () => {
        const coreOf = (viewer, elementId) => {
            const adapter = lookupFor(viewer, elementId);
            return adapter
                ? adapter.shadowRoot.querySelector('c-final-record-lookup')
                : null;
        };

        it('accepts a selection stamped with the live generation', async () => {
            const el = mount();
            await flush();
            answer(el, 'el_account', '001AAA');
            await flush();

            const adapter = lookupFor(el, 'el_contact');
            const core = coreOf(el, 'el_contact');
            core.dispatchEvent(
                new CustomEvent('selectionchange', {
                    detail: {
                        recordId: '003AAA',
                        contextKey: adapter.contextKey
                    }
                })
            );
            await flush();

            expect(el.answers.el_contact).toBe('003AAA');
        });

        it('drops a selection stamped with a retired generation', async () => {
            const el = mount();
            await flush();
            answer(el, 'el_account', '001AAA');
            await flush();

            const core = coreOf(el, 'el_contact');
            core.dispatchEvent(
                new CustomEvent('selectionchange', {
                    detail: {
                        recordId: '003OLD',
                        contextKey: 'a generation that has been retired'
                    }
                })
            );
            await flush();

            expect(el.answers.el_contact).toBeUndefined();
        });

        it('remounts the control when the filter generation moves', async () => {
            const el = mount();
            await flush();
            const first = coreOf(el, 'el_contact');

            answer(el, 'el_account', '001AAA');
            await flush();
            const second = coreOf(el, 'el_contact');

            // A fresh instance is the whole point: the retired one captured
            // the old generation at connect and can never accept again.
            expect(second).not.toBe(first);
        });

        it('keeps one instance while the filter stands still', async () => {
            const el = mount();
            await flush();
            answer(el, 'el_account', '001AAA');
            await flush();
            const before = coreOf(el, 'el_contact');

            // Re-answering the parent with the same record changes nothing, so
            // remounting would throw away focus for no reason.
            answer(el, 'el_account', '001AAA');
            await flush();

            expect(coreOf(el, 'el_contact')).toBe(before);
        });
    });
});
