import { createElement } from 'lwc';
import FinalLookup from 'c/finalLookup';

describe('c-final-lookup', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders lightning-record-picker for authenticated user and dispatches valuechange', () => {
        const element = createElement('c-final-lookup', { is: FinalLookup });
        element.elementId = 'el_account_lookup';
        element.targetObject = 'Account';
        element.label = 'Account';
        element.value = '001000000000001AAA';
        document.body.appendChild(element);

        const picker = element.shadowRoot.querySelector(
            'lightning-record-picker'
        );
        expect(picker).not.toBeNull();
        expect(picker.objectApiName).toBe('Account');
        expect(picker.value).toBe('001000000000001AAA');

        const handler = jest.fn();
        element.addEventListener('valuechange', handler);

        picker.dispatchEvent(
            new CustomEvent('change', {
                detail: { recordId: '001000000000002BBB' }
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            elementId: 'el_account_lookup',
            value: '001000000000002BBB'
        });
    });

    it('dispatches null value when picker record is cleared', () => {
        const element = createElement('c-final-lookup', { is: FinalLookup });
        element.elementId = 'el_account_lookup';
        element.targetObject = 'Account';
        document.body.appendChild(element);

        const picker = element.shadowRoot.querySelector(
            'lightning-record-picker'
        );
        const handler = jest.fn();
        element.addEventListener('valuechange', handler);

        picker.dispatchEvent(
            new CustomEvent('change', {
                detail: { recordId: null }
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            elementId: 'el_account_lookup',
            value: null
        });
    });

    it('delegates reportValidity, checkValidity, and focus to picker', () => {
        const element = createElement('c-final-lookup', { is: FinalLookup });
        document.body.appendChild(element);

        const picker = element.shadowRoot.querySelector(
            'lightning-record-picker'
        );
        picker.reportValidity = jest.fn(() => true);
        picker.checkValidity = jest.fn(() => true);
        picker.focus = jest.fn();

        expect(element.reportValidity()).toBe(true);
        expect(picker.reportValidity).toHaveBeenCalledTimes(1);

        expect(element.checkValidity()).toBe(true);
        expect(picker.checkValidity).toHaveBeenCalledTimes(1);

        element.focus();
        expect(picker.focus).toHaveBeenCalledTimes(1);
    });
});
