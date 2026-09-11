import { createElement } from 'lwc';
import FinalRecordLookup from 'c/finalRecordLookup';

const mount = (props = {}) => {
    const el = createElement('c-final-record-lookup', {
        is: FinalRecordLookup
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
};

const picker = (el) => el.shadowRoot.querySelector('lightning-record-picker');

describe('c-final-record-lookup', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('forwards every native configuration input to the picker', () => {
        const filter = {
            criteria: [{ fieldPath: 'AccountId', operator: 'eq', value: '001' }]
        };
        const matchingInfo = {
            primaryField: { fieldPath: 'Name', mode: 'startsWith' }
        };
        const displayInfo = {
            primaryField: 'Name',
            additionalFields: ['Title']
        };
        const el = mount({
            objectApiName: 'Contact',
            value: '003000000000001AAA',
            label: 'Contact',
            filter,
            matchingInfo,
            displayInfo
        });

        const p = picker(el);
        expect(p.objectApiName).toBe('Contact');
        expect(p.value).toBe('003000000000001AAA');
        expect(p.filter).toEqual(filter);
        expect(p.matchingInfo).toEqual(matchingInfo);
        expect(p.displayInfo).toEqual(displayInfo);
    });

    it('emits selectionchange stamped with the context it mounted under', () => {
        const el = mount({ objectApiName: 'Contact', contextKey: 'gen-7' });
        const handler = jest.fn();
        el.addEventListener('selectionchange', handler);

        picker(el).dispatchEvent(
            new CustomEvent('change', { detail: { recordId: '003AAA' } })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            recordId: '003AAA',
            contextKey: 'gen-7'
        });
    });

    it('stamps a late event with the RETIRED context, never the current one', () => {
        const el = mount({ objectApiName: 'Contact', contextKey: 'gen-1' });
        const handler = jest.fn();
        el.addEventListener('selectionchange', handler);

        // A caller that writes a new key onto a live instance instead of
        // remounting must not have its stale native event legitimized.
        el.contextKey = 'gen-2';
        picker(el).dispatchEvent(
            new CustomEvent('change', { detail: { recordId: '003AAA' } })
        );

        expect(handler.mock.calls[0][0].detail.contextKey).toBe('gen-1');
    });

    it('does not emit a selection when the value input is set programmatically', () => {
        const el = mount({ objectApiName: 'Contact' });
        const handler = jest.fn();
        el.addEventListener('selectionchange', handler);

        el.value = '003AAA';

        expect(handler).not.toHaveBeenCalled();
    });

    it('does not re-emit when the picker echoes the value it already holds', () => {
        const el = mount({ objectApiName: 'Contact', value: '003AAA' });
        const handler = jest.fn();
        el.addEventListener('selectionchange', handler);

        picker(el).dispatchEvent(
            new CustomEvent('change', { detail: { recordId: '003AAA' } })
        );

        expect(handler).not.toHaveBeenCalled();
    });

    it('emits a clear as a real selection change', () => {
        const el = mount({ objectApiName: 'Contact', value: '003AAA' });
        const handler = jest.fn();
        el.addEventListener('selectionchange', handler);

        picker(el).dispatchEvent(
            new CustomEvent('change', { detail: { recordId: null } })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.recordId).toBeNull();
    });

    it('reports control readiness, which is not membership in the filter', () => {
        const el = mount({ objectApiName: 'Contact', contextKey: 'gen-1' });
        const seen = [];
        el.addEventListener('lookupstatechange', (e) =>
            seen.push(e.detail.status)
        );

        picker(el).dispatchEvent(new CustomEvent('ready'));

        expect(seen).toEqual(['ready']);
    });

    it('normalizes a native error into a safe code and message', () => {
        const el = mount({ objectApiName: 'Contact' });
        const handler = jest.fn();
        el.addEventListener('lookuperror', handler);

        picker(el).dispatchEvent(
            new CustomEvent('error', {
                detail: { body: { message: 'SELECT Id FROM Contact blew up' } }
            })
        );

        const detail = handler.mock.calls[0][0].detail;
        expect(detail.code).toBe('SEARCH_FAILED');
        expect(detail.message).not.toContain('SELECT');
    });

    describe('validity', () => {
        it('fails a required empty control before the picker is consulted', async () => {
            const el = mount({
                objectApiName: 'Contact',
                label: 'Contact',
                required: true
            });
            expect(el.checkValidity()).toBe(false);
            expect(el.reportValidity()).toBe(false);
            await Promise.resolve();
            expect(
                el.shadowRoot.querySelector('[data-id="error"]').textContent
            ).toContain('required');
        });

        it('delegates to the native control once its own rules pass', () => {
            const el = mount({ objectApiName: 'Contact', value: '003AAA' });
            picker(el).checkValidity = jest.fn(() => true);
            picker(el).reportValidity = jest.fn(() => true);

            expect(el.checkValidity()).toBe(true);
            expect(el.reportValidity()).toBe(true);
            expect(picker(el).reportValidity).toHaveBeenCalledTimes(1);
        });

        it('fails a required empty control that is unavailable, rather than passing it', async () => {
            const el = mount({
                objectApiName: 'Contact',
                required: true,
                unavailableMessage: 'This lookup could not be configured.'
            });
            expect(
                el.shadowRoot.querySelector('lightning-record-picker')
            ).toBeNull();
            expect(el.checkValidity()).toBe(false);
            expect(el.reportValidity()).toBe(false);
            await Promise.resolve();
            expect(
                el.shadowRoot.querySelector('[data-id="error"]').textContent
            ).toContain('could not be configured');
        });

        it('keeps a preserved value valid while the control is unavailable', () => {
            const el = mount({
                objectApiName: 'Contact',
                required: true,
                value: '003AAA',
                unavailableMessage: 'This lookup could not be configured.'
            });
            expect(el.checkValidity()).toBe(true);
        });

        it('fails a required empty control that is still pending', () => {
            const el = mount({
                objectApiName: 'Contact',
                required: true,
                pending: true
            });
            expect(el.checkValidity()).toBe(false);
            expect(picker(el).disabled).toBe(true);
        });

        it('honours a caller-set custom validity over everything else', () => {
            const el = mount({ objectApiName: 'Contact', value: '003AAA' });
            el.setCustomValidity('That contact is no longer reachable.');
            expect(el.checkValidity()).toBe(false);
            el.setCustomValidity('');
            expect(el.checkValidity()).toBe(true);
        });

        it('clears a standing complaint as soon as a new record is chosen', async () => {
            const el = mount({
                objectApiName: 'Contact',
                label: 'Contact',
                required: true
            });
            el.reportValidity();
            await Promise.resolve();
            expect(
                el.shadowRoot.querySelector('[data-id="error"]')
            ).not.toBeNull();

            picker(el).dispatchEvent(
                new CustomEvent('change', { detail: { recordId: '003AAA' } })
            );

            await Promise.resolve();
            expect(el.shadowRoot.querySelector('[data-id="error"]')).toBeNull();
        });
    });

    it('does not write back to the caller-owned value property', async () => {
        const el = mount({ objectApiName: 'Contact', value: '003AAA' });
        picker(el).dispatchEvent(
            new CustomEvent('change', { detail: { recordId: '003BBB' } })
        );
        // The caller decides whether a selection becomes the value. Reading
        // the property back still returns what the caller last set.
        expect(el.value).toBe('003AAA');
        await Promise.resolve();
        // ...while the control itself already shows the new choice.
        expect(picker(el).value).toBe('003BBB');
    });

    it('blocks interaction when disabled or read-only', () => {
        expect(picker(mount({ disabled: true })).disabled).toBe(true);
        expect(picker(mount({ readOnly: true })).disabled).toBe(true);
    });
});
