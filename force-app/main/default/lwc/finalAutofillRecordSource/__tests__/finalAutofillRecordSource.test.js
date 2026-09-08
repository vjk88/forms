import { createElement } from 'lwc';
import FinalAutofillRecordSource from 'c/finalAutofillRecordSource';
import { getRecord } from 'lightning/uiRecordApi';

describe('c-final-autofill-record-source', () => {
    it('does not relabel a response for a different record', async () => {
        const element = createElement('c-final-autofill-record-source', {
            is: FinalAutofillRecordSource
        });
        element.ruleId = '__edit__';
        element.recordId = '003000000000002AAA';
        element.objectApiName = 'Contact';
        element.fields = ['Title'];
        const success = jest.fn();
        element.addEventListener('recordsuccess', success);
        document.body.appendChild(element);
        getRecord.emit({
            id: '003000000000001AAA',
            fields: { Title: { value: 'Old record' } }
        });
        await Promise.resolve();
        expect(success).not.toHaveBeenCalled();
        getRecord.emit({
            id: '003000000000002AAA',
            fields: { Title: { value: 'Current record' } }
        });
        await Promise.resolve();
        expect(success).toHaveBeenCalledTimes(1);
        expect(success.mock.calls[0][0].detail.values.Title).toBe(
            'Current record'
        );
    });
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    // R3 regression. Emitting mock data proves what we do with a RESPONSE; it
    // says nothing about whether the REQUEST is legal. getRecord requires
    // `fields` or `layoutTypes` — optionalFields alone does not satisfy it, so
    // the real adapter erred while every mock-driven test stayed green.
    it('sends a legal getRecord request: Id required, mapped fields optional', async () => {
        const element = createElement('c-final-autofill-record-source', {
            is: FinalAutofillRecordSource
        });
        element.ruleId = 'af_account';
        element.recordId = '001000000000001AAA';
        element.objectApiName = 'Account';
        element.fields = ['Phone', 'Website'];
        document.body.appendChild(element);
        await Promise.resolve();

        const config = getRecord.getLastConfig();
        expect(config.recordId).toBe('001000000000001AAA');
        // required — without this the adapter rejects the whole request
        expect(config.fields).toEqual(['Account.Id']);
        // optional — one unreadable field must not fail every other mapping
        expect(config.optionalFields).toEqual([
            'Account.Phone',
            'Account.Website'
        ]);
        expect(config.optionalFields).not.toContain('Account.Id');
    });

    it('emits recordsuccess when getRecord wire emits data, preserving null vs omitted', async () => {
        const element = createElement('c-final-autofill-record-source', {
            is: FinalAutofillRecordSource
        });
        element.ruleId = 'af_account';
        element.recordId = '001000000000001AAA';
        element.objectApiName = 'Account';
        element.fields = ['Phone', 'Website', 'Secret__c'];
        element.generation = 1;
        element.sessionId = 'sess_123';

        const successHandler = jest.fn();
        element.addEventListener('recordsuccess', successHandler);
        document.body.appendChild(element);

        // Emit mock record
        const mockData = {
            id: '001000000000001AAA',
            fields: {
                Phone: { value: '555-1234' },
                Website: { value: null }
                // Secret__c is omitted by FLS
            }
        };
        getRecord.emit(mockData);

        await Promise.resolve();

        expect(successHandler).toHaveBeenCalledTimes(1);
        const detail = successHandler.mock.calls[0][0].detail;
        expect(detail.ruleId).toBe('af_account');
        expect(detail.recordId).toBe('001000000000001AAA');
        expect(detail.generation).toBe(1);
        expect(detail.sessionId).toBe('sess_123');
        expect(detail.values).toEqual({
            Phone: '555-1234',
            Website: null
        });
        expect('Secret__c' in detail.values).toBe(false);
    });

    it('emits recorderror when getRecord wire emits error', async () => {
        const element = createElement('c-final-autofill-record-source', {
            is: FinalAutofillRecordSource
        });
        element.ruleId = 'af_account';
        element.recordId = '001000000000001AAA';
        element.objectApiName = 'Account';
        element.fields = ['Phone'];
        element.generation = 2;
        element.sessionId = 'sess_123';

        const errorHandler = jest.fn();
        element.addEventListener('recorderror', errorHandler);
        document.body.appendChild(element);

        const mockError = { status: 404, message: 'Not Found' };
        getRecord.error(mockError);

        await Promise.resolve();

        expect(errorHandler).toHaveBeenCalledTimes(1);
        const detail = errorHandler.mock.calls[0][0].detail;
        expect(detail.ruleId).toBe('af_account');
        expect(detail.recordId).toBe('001000000000001AAA');
        expect(detail.generation).toBe(2);
        expect(detail.sessionId).toBe('sess_123');
        expect(detail.error.body).toEqual(mockError);
    });
});
