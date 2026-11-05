import { createElement } from 'lwc';
import FinalSubmissionReader from 'c/finalSubmissionReader';
import getSubmission from '@salesforce/apex/FinalSubmissionController.getSubmission';
import saveCopy from '@salesforce/apex/FinalSubmissionController.saveCopy';

// IMPL_PLAN_FORM_PDF §6.4: the Answers card says where the saved copy stands
// and offers the one action that fits.
jest.mock(
    '@salesforce/apex/FinalSubmissionController.getSubmission',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSubmissionController.saveCopy',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalPdfController.getImages',
    () => ({ default: jest.fn() }),
    {
        virtual: true
    }
);
jest.mock(
    '@salesforce/apex',
    () => ({ refreshApex: jest.fn(() => Promise.resolve()) }),
    {
        virtual: true
    }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(copy) {
    const el = createElement('c-final-submission-reader', {
        is: FinalSubmissionReader
    });
    el.recordId = 'a0Q1';
    document.body.appendChild(el);
    getSubmission.emit({
        submissionNumber: 'FS-1',
        formName: 'Intake',
        specJson: '{"pages":[]}',
        answers: [],
        files: [],
        copy
    });
    await flush();
    return el;
}

const line = (el) => el.shadowRoot.querySelector('.sr-copy');
const buttons = (el) =>
    [...line(el).querySelectorAll('lightning-button')].map((b) => b.label);

describe('c-final-submission-reader saved PDF copy', () => {
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
        jest.clearAllMocks();
    });

    it('says nothing when the form does not save copies', async () => {
        expect(line(await mount(null))).toBeNull();
    });

    it('offers the saved copy', async () => {
        const el = await mount({ status: 'Saved', documentId: '069x' });
        expect(line(el).textContent).toContain('PDF copy saved on this record');
        expect(buttons(el)).toEqual(['Open saved copy']);
    });

    it('says a queued copy is being saved, with Refresh', async () => {
        const el = await mount({ status: 'Queued' });
        expect(line(el).textContent).toContain('Saving a PDF copy');
        expect(buttons(el)).toEqual(['Refresh']);
    });

    it('shows why it failed and makes it again on Try again', async () => {
        saveCopy.mockResolvedValue({ status: 'Saved', documentId: '069y' });
        const el = await mount({
            status: 'Failed',
            message: 'No capacity left.'
        });
        expect(line(el).textContent).toContain('No capacity left.');
        line(el).querySelector('lightning-button').click();
        await flush();
        await flush();
        expect(saveCopy).toHaveBeenCalledWith({ submissionId: 'a0Q1' });
        expect(buttons(el)).toEqual(['Open saved copy']);
    });

    it('keeps a failed retry readable', async () => {
        saveCopy.mockRejectedValue({ body: { message: 'Not allowed.' } });
        const el = await mount({ status: 'Failed', message: 'First failure.' });
        line(el).querySelector('lightning-button').click();
        await flush();
        await flush();
        expect(line(el).textContent).toContain('Not allowed.');
        expect(buttons(el)).toEqual(['Try again']);
    });
});
