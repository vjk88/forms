import { createElement } from 'lwc';
import FinalPreviewStage from 'c/finalPreviewStage';
import { downloadPdf } from 'c/finalPdfService';
import getPdfImages from '@salesforce/apex/FinalPdfController.getImages';

// the stage mounts the REAL viewer — satisfy its module surface
jest.mock(
    'lightning/navigation',
    () => {
        const {
            createTestWireAdapter
        } = require('@salesforce/wire-service-jest-util');
        const Navigate = Symbol('Navigate');
        const NavigationMixin = (Base) => class extends Base {};
        NavigationMixin.Navigate = Navigate;
        return {
            CurrentPageReference: createTestWireAdapter(jest.fn()),
            NavigationMixin
        };
    },
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({ default: jest.fn() }),
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

// IMPL_PLAN_FORM_PDF §6.3: the Studio's blank-form PDF uses the spec and the
// tokens the preview is painting with.
const SPEC = {
    specVersion: 1,
    form: { name: 'Intake' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'standard', title: 'Client intake' },
    theme: null,
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    title: 'You',
                    elements: [
                        {
                            id: 'el_a',
                            type: 'field',
                            label: 'Name',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ],
    submit: { label: 'Submit' }
};

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
    const el = createElement('c-final-preview-stage', {
        is: FinalPreviewStage
    });
    el.spec = SPEC;
    el.authoring = true;
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

describe('c-final-preview-stage blank PDF', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('downloads the blank form from what the preview shows', async () => {
        const el = await mount();
        const btn = el.shadowRoot.querySelector('lightning-button-icon.ps-pdf');
        expect(btn.alternativeText).toBe('Download form as PDF');
        btn.click();
        await flush();
        const args = downloadPdf.mock.calls[0][0];
        expect(args.doc.mode).toBe('blank');
        expect(args.doc.title).toBe('Client intake');
        expect(args.doc.blocks.find((b) => b.label === 'Name').kind).toBe(
            'field'
        );
        expect(args.fileName).toBe('Client intake.pdf');
        await args.loadImages(['068a']);
        expect(getPdfImages).toHaveBeenCalledWith({ versionIds: ['068a'] });
    });

    it('says so when the PDF fails, under the toolbar', async () => {
        downloadPdf.mockImplementationOnce(() =>
            Promise.reject(new Error('The PDF could not be made.'))
        );
        const el = await mount();
        el.shadowRoot.querySelector('lightning-button-icon.ps-pdf').click();
        await flush();
        await flush();
        expect(
            el.shadowRoot.querySelector('.ps-pdf-error').textContent
        ).toContain('could not be made');
    });
});
