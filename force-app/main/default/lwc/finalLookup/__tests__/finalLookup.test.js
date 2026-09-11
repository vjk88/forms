import { createElement } from 'lwc';
import FinalLookup from 'c/finalLookup';

/**
 * finalLookup no longer renders a picker itself — it adapts Forms vocabulary
 * onto c/finalRecordLookup. What these tests defend is the OUTWARD contract
 * the viewer and renderer depend on, not the internal structure.
 */
const core = (el) => el.shadowRoot.querySelector('c-final-record-lookup');

const mount = (props = {}) => {
    const el = createElement('c-final-lookup', { is: FinalLookup });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
};

const select = (el, recordId, contextKey) =>
    core(el).dispatchEvent(
        new CustomEvent('selectionchange', {
            detail: { recordId, contextKey: contextKey ?? null }
        })
    );

describe('c-final-lookup', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('translates Forms vocabulary onto the reusable core', () => {
        const el = mount({
            elementId: 'el_account_lookup',
            targetObject: 'Account',
            label: 'Account',
            value: '001000000000001AAA'
        });

        const c = core(el);
        expect(c).not.toBeNull();
        expect(c.objectApiName).toBe('Account');
        expect(c.value).toBe('001000000000001AAA');
        expect(c.label).toBe('Account');
    });

    it('dispatches the frozen valuechange payload, bubbling and composed', () => {
        const el = mount({
            elementId: 'el_account_lookup',
            targetObject: 'Account'
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);

        select(el, '001000000000002BBB');

        expect(handler).toHaveBeenCalledTimes(1);
        const event = handler.mock.calls[0][0];
        expect(event.detail).toEqual({
            elementId: 'el_account_lookup',
            value: '001000000000002BBB'
        });
        expect(event.bubbles).toBe(true);
        expect(event.composed).toBe(true);
    });

    it('never leaks extra core event fields into a Forms answer', () => {
        const el = mount({
            elementId: 'el_account_lookup',
            targetObject: 'Account'
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);

        core(el).dispatchEvent(
            new CustomEvent('selectionchange', {
                detail: {
                    recordId: '001BBB',
                    contextKey: null,
                    somethingNew: 'should not travel'
                }
            })
        );

        expect(Object.keys(handler.mock.calls[0][0].detail).sort()).toEqual([
            'elementId',
            'value'
        ]);
    });

    it('dispatches null when the record is cleared', () => {
        const el = mount({
            elementId: 'el_account_lookup',
            targetObject: 'Account',
            value: '001000000000001AAA'
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);

        select(el, null);

        expect(handler.mock.calls[0][0].detail).toEqual({
            elementId: 'el_account_lookup',
            value: null
        });
    });

    it('drops a selection stamped with a retired configuration', () => {
        const el = mount({
            elementId: 'el_contact_lookup',
            targetObject: 'Contact',
            contextKey: 'gen-2'
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);

        select(el, '003AAA', 'gen-1');
        expect(handler).not.toHaveBeenCalled();

        select(el, '003AAA', 'gen-2');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('accepts selections when no configuration generation is in play', () => {
        const el = mount({
            elementId: 'el_account_lookup',
            targetObject: 'Account'
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);

        core(el).dispatchEvent(
            new CustomEvent('selectionchange', {
                detail: { recordId: '001AAA' }
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('forwards resolved lookup policy without interpreting it', () => {
        const filter = {
            criteria: [{ fieldPath: 'AccountId', operator: 'eq', value: '001' }]
        };
        const el = mount({
            elementId: 'el_contact_lookup',
            targetObject: 'Contact',
            filter,
            matchingInfo: { primaryField: { fieldPath: 'Name' } },
            displayInfo: { primaryField: 'Name' },
            pending: true
        });

        expect(core(el).filter).toEqual(filter);
        expect(core(el).matchingInfo).toEqual({
            primaryField: { fieldPath: 'Name' }
        });
        expect(core(el).displayInfo).toEqual({ primaryField: 'Name' });
        expect(core(el).pending).toBe(true);
    });

    it('collapses disabled and read-only into a blocked control', () => {
        expect(core(mount({ disabled: true })).disabled).toBe(true);
        expect(core(mount({ readOnly: true })).disabled).toBe(true);
    });

    it('re-dispatches a core error as pickererror for existing consumers', () => {
        const el = mount({ targetObject: 'Account' });
        const handler = jest.fn();
        el.addEventListener('pickererror', handler);

        core(el).dispatchEvent(
            new CustomEvent('lookuperror', {
                detail: { code: 'SEARCH_FAILED', message: 'nope' }
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.code).toBe('SEARCH_FAILED');
    });

    it('delegates reportValidity, checkValidity, and focus to the core', () => {
        const el = mount({ targetObject: 'Account' });
        const c = core(el);
        c.reportValidity = jest.fn(() => true);
        c.checkValidity = jest.fn(() => true);
        c.focus = jest.fn();

        expect(el.reportValidity()).toBe(true);
        expect(c.reportValidity).toHaveBeenCalledTimes(1);

        expect(el.checkValidity()).toBe(true);
        expect(c.checkValidity).toHaveBeenCalledTimes(1);

        el.focus();
        expect(c.focus).toHaveBeenCalledTimes(1);
    });

    it('leaves lookup unavailable for anonymous respondents', () => {
        // isGuest is false in the default Jest stub; the adapter's job is to
        // hand the refusal to the core rather than render a second variant.
        const el = mount({ targetObject: 'Account' });
        expect(core(el).unavailableMessage).toBeUndefined();
    });
});
