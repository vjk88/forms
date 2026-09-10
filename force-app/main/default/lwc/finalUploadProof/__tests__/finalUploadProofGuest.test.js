import { createElement } from 'lwc';
import FinalUploadProof from 'c/finalUploadProof';
import createGrant from '@salesforce/apex/FinalUploadProofController.createGrant';
import inspectGrant from '@salesforce/apex/FinalUploadProofController.inspectGrant';

jest.mock(
    '@salesforce/customPermission/Final_Upload_Proof_Admin',
    () => ({ default: undefined }),
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

describe('guest proof surface', () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.clearAllMocks();
    });
    it('does not offer operator controls or call operator Apex', async () => {
        const element = createElement('c-final-upload-proof', {
            is: FinalUploadProof
        });
        document.body.appendChild(element);
        const input = element.shadowRoot.querySelector('[data-id="grant"]');
        input.value = JSON.stringify({
            slotToken: 'x'.repeat(43),
            markerField: 'Final_Upload_fileupload__c',
            accept: '.pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx',
            maxBytes: 10485760,
            expiresAt: new Date(Date.now() + 600000).toISOString()
        });
        input.dispatchEvent(new CustomEvent('change'));
        element.shadowRoot.querySelector('[data-id="use"]').click();
        await Promise.resolve();
        expect(
            element.shadowRoot.querySelector('lightning-file-upload')
        ).not.toBeNull();
        expect(
            element.shadowRoot.querySelector('[data-id="create"]')
        ).toBeNull();
        expect(
            element.shadowRoot.querySelector('[data-id="inspect"]')
        ).toBeNull();
        expect(createGrant).not.toHaveBeenCalled();
        expect(inspectGrant).not.toHaveBeenCalled();
    });
});
