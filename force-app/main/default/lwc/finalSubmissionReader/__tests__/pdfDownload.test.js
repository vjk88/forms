import { createElement } from 'lwc';
import FinalSubmissionReader from 'c/finalSubmissionReader';
import getSubmission from '@salesforce/apex/FinalSubmissionController.getSubmission';
import getPdfImages from '@salesforce/apex/FinalPdfController.getImages';
import { downloadPdf } from 'c/finalPdfService';

// IMPL_PLAN_FORM_PDF §6.2: the PDF says what this card says, in the colors of
// the version that was filled in.
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
    '@salesforce/apex/FinalPdfController.getImages',
    () => ({ default: jest.fn(() => Promise.resolve({ images: [] })) }),
    { virtual: true }
);
jest.mock('c/finalPdfService', () => ({
    downloadPdf: jest.fn(() => Promise.resolve()),
    LOCALE: 'en-US'
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

const SUBMISSION = {
    submissionNumber: 'FS-00000007',
    formName: 'Partner application',
    versionNumber: 2,
    submittedDate: '2026-09-19T10:00:00.000Z',
    submittedBy: 'Alex Adams',
    specJson: JSON.stringify({
        form: { type: 'freeform' },
        header: { title: 'Become a partner' },
        resolved: { tokens: { '--c-accent': '#123456' } },
        pages: [
            {
                id: 'pg_1',
                sections: [
                    {
                        id: 'sec_1',
                        title: 'About you',
                        elements: [
                            { id: 'el_a', type: 'field', label: 'Company' }
                        ]
                    }
                ]
            }
        ]
    }),
    answers: [
        {
            elementKey: 'el_a',
            label: 'Company',
            answerType: 'Text',
            unparsed: false,
            entryIndex: null,
            text: 'Acme'
        }
    ],
    files: []
};

async function mount() {
    const el = createElement('c-final-submission-reader', {
        is: FinalSubmissionReader
    });
    el.recordId = 'a0Q1';
    document.body.appendChild(el);
    getSubmission.emit(SUBMISSION);
    await flush();
    return el;
}

const button = (el) => el.shadowRoot.querySelector('lightning-button.sr-pdf');

describe('c-final-submission-reader Download PDF', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('builds the PDF from the rows on the card and the version tokens', async () => {
        const el = await mount();
        expect(button(el).label).toBe('Download PDF');
        button(el).click();
        await flush();
        const args = downloadPdf.mock.calls[0][0];
        expect(args.doc.title).toBe('Become a partner');
        expect(
            args.doc.blocks.find((b) => b.label === 'Company').lines
        ).toEqual(['Acme']);
        expect(args.tokens['--c-accent']).toBe('#123456');
        expect(args.fileName).toBe('Become a partner - FS-00000007.pdf');
        await args.loadImages(['068a']);
        expect(getPdfImages).toHaveBeenCalledWith({ versionIds: ['068a'] });
    });

    it('shows a failure and lets the reader try again', async () => {
        downloadPdf.mockImplementationOnce(() =>
            Promise.reject(new Error('The PDF could not be made.'))
        );
        const el = await mount();
        button(el).click();
        await flush();
        await flush();
        expect(el.shadowRoot.querySelector('.sr-error').textContent).toContain(
            'The PDF could not be made.'
        );
        expect(button(el).disabled).toBe(false);
    });

    it('offers no button before the submission loads', () => {
        const el = createElement('c-final-submission-reader', {
            is: FinalSubmissionReader
        });
        el.recordId = 'a0Q1';
        document.body.appendChild(el);
        expect(button(el)).toBeNull();
    });
});
