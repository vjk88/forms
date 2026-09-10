import { createElement } from 'lwc';
import FinalUploadProof from 'c/finalUploadProof';
import createGrant from '@salesforce/apex/FinalUploadProofController.createGrant';
import inspectGrant from '@salesforce/apex/FinalUploadProofController.inspectGrant';

jest.mock(
    '@salesforce/customPermission/Final_Upload_Proof_Admin',
    () => ({ default: true }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalUploadProofController.createGrant',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalUploadProofController.inspectGrant',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const flush = () => Promise.resolve().then(() => Promise.resolve());
const grant = () => ({
    slotToken: 'x'.repeat(43),
    markerField: 'Final_Upload_fileupload__c',
    accept: '.pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx',
    maxBytes: 10485760,
    expiresAt: new Date(Date.now() + 600000).toISOString()
});
function mount() {
    const element = createElement('c-final-upload-proof', {
        is: FinalUploadProof
    });
    document.body.appendChild(element);
    return element;
}
const control = (element, id) =>
    element.shadowRoot.querySelector(`[data-id="${id}"]`);
function paste(element, value) {
    const input = control(element, 'grant');
    input.value = JSON.stringify(value);
    input.dispatchEvent(new CustomEvent('change'));
}

describe('native upload proof harness', () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.clearAllMocks();
    });

    it('requires an explicit grant and never reserves on mount', () => {
        const element = mount();
        expect(
            element.shadowRoot.querySelector('lightning-file-upload')
        ).toBeNull();
        expect(createGrant).not.toHaveBeenCalled();
    });

    it('ignores a completion event from the previous native instance', async () => {
        const element = mount();
        paste(element, grant());
        control(element, 'use').click();
        await flush();
        const previous = element.shadowRoot.querySelector(
            'lightning-file-upload'
        );
        paste(element, { ...grant(), slotToken: 'y'.repeat(43) });
        control(element, 'use').click();
        await flush();
        const current = element.shadowRoot.querySelector(
            'lightning-file-upload'
        );
        expect(current).not.toBe(previous);
        previous.dispatchEvent(new CustomEvent('uploadfinished'));
        await flush();
        expect(element.shadowRoot.textContent).not.toContain(
            'reported completion'
        );
    });

    it('forwards the qualified marker and single-file contract without any record ID', async () => {
        const element = mount();
        const value = {
            ...grant(),
            markerField: 'pkg__Final_Upload_fileupload__c',
            recordId: 'forged'
        };
        paste(element, value);
        control(element, 'use').click();
        await flush();
        const uploader = element.shadowRoot.querySelector(
            'lightning-file-upload'
        );
        expect(uploader.fileFieldName).toBe(value.markerField);
        expect(uploader.fileFieldValue).toBe(value.slotToken);
        expect(uploader.recordId).toBeUndefined();
        expect(uploader.multiple).toBeFalsy();
    });

    it('does not trust names or IDs returned by uploadfinished', async () => {
        const element = mount();
        paste(element, grant());
        control(element, 'use').click();
        await flush();
        element.shadowRoot.querySelector('lightning-file-upload').dispatchEvent(
            new CustomEvent('uploadfinished', {
                detail: {
                    files: [
                        {
                            name: 'forged-name.txt',
                            documentId: 'forged-document'
                        }
                    ]
                }
            })
        );
        await flush();
        expect(element.shadowRoot.textContent).toContain(
            'operator must inspect'
        );
        expect(element.shadowRoot.textContent).not.toContain('forged-name');
        expect(inspectGrant).not.toHaveBeenCalled();
    });

    it('rejects expired grants before mounting the native control', async () => {
        const element = mount();
        paste(element, { ...grant(), expiresAt: '2000-01-01' });
        control(element, 'use').click();
        await flush();
        expect(
            element.shadowRoot.querySelector('lightning-file-upload')
        ).toBeNull();
        expect(element.shadowRoot.textContent).toContain('unexpired grant');
    });

    it('clears an old native control as soon as grant text changes', async () => {
        const element = mount();
        paste(element, grant());
        control(element, 'use').click();
        await flush();
        paste(element, { ...grant(), slotToken: 'y'.repeat(43) });
        await flush();
        expect(
            element.shadowRoot.querySelector('lightning-file-upload')
        ).toBeNull();
    });

    it('ignores a late mint response after reset', async () => {
        let resolve;
        createGrant.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done;
                })
        );
        const element = mount();
        control(element, 'create').click();
        await flush();
        control(element, 'reset').click();
        resolve(grant());
        await flush();
        expect(control(element, 'grant').value).toBe('');
        expect(element.shadowRoot.textContent).toContain(
            'Browser state cleared'
        );
    });

    it('does not restore inspection from a previous grant', async () => {
        let resolve;
        inspectGrant.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done;
                })
        );
        const element = mount();
        paste(element, grant());
        control(element, 'inspect').click();
        await flush();
        paste(element, { ...grant(), slotToken: 'y'.repeat(43) });
        resolve({ state: 'READY', documentId: 'old' });
        await flush();
        expect(
            element.shadowRoot.querySelector(
                '[label="Operator inspection result"]'
            )
        ).toBeNull();
    });

    it('does not restore a secret after disconnect and reconnect', async () => {
        let resolve;
        createGrant.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done;
                })
        );
        const element = mount();
        control(element, 'create').click();
        await flush();
        element.remove();
        resolve(grant());
        await flush();
        document.body.appendChild(element);
        await flush();
        expect(control(element, 'grant').value).toBe('');
    });
});
