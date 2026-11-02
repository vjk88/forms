import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import { downloadPdf } from 'c/finalPdfService';
import getPdfImages from '@salesforce/apex/FinalPdfController.getImages';

// IMPL_PLAN_FORM_PDF §6.1: the respondent's copy is made from what was
// SUBMITTED, after the submit succeeds, with images from the host's loader.
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock('c/finalPdfService', () => ({
    downloadPdf: jest.fn(() => Promise.resolve()),
    LOCALE: 'en-GB'
}));
jest.mock(
    '@salesforce/apex/FinalPdfController.getImages',
    () => ({ default: jest.fn(() => Promise.resolve({ images: [] })) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'Guest' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'standard', title: 'Join us' },
    theme: null,
    settings: { completion: { mode: 'screen', downloadCopy: true } },
    submit: { label: 'Send' },
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_ln',
                            type: 'field',
                            label: 'Last name',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function deepQuery(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
        }
    }
    return null;
}

async function submitted({ loader } = {}) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = JSON.parse(JSON.stringify(SPEC));
    el.delegateSubmit = true;
    if (loader) el.pdfImageLoader = loader;
    document.body.appendChild(el);
    await flush();
    await flush();
    const input = deepQuery(el.shadowRoot, 'lightning-input');
    input.value = 'Riley';
    input.type = 'text';
    input.dispatchEvent(new CustomEvent('change'));
    deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    el.completeSubmit();
    await flush();
    return el;
}

describe('c-final-form-viewer respondent PDF copy', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('offers the copy once the submit succeeded', async () => {
        const el = await submitted();
        const after = deepQuery(el.shadowRoot, 'c-final-after-submit');
        expect(after.canDownload).toBe(true);
        expect(after.config.downloadCopy).toBe(true);
    });

    it('builds the copy from the submitted answers with the host loader', async () => {
        const loader = jest.fn(() => Promise.resolve({ images: [] }));
        const el = await submitted({ loader });
        deepQuery(el.shadowRoot, 'c-final-after-submit').dispatchEvent(
            new CustomEvent('downloadcopy')
        );
        await flush();
        expect(downloadPdf).toHaveBeenCalledTimes(1);
        const args = downloadPdf.mock.calls[0][0];
        const qa = args.doc.blocks.find((b) => b.label === 'Last name');
        expect(qa.lines).toEqual(['Riley']);
        expect(args.doc.title).toBe('Join us');
        expect(args.fileName).toBe('Join us - my answers.pdf');
        expect(args.loadImages).toBe(loader);
        expect(getPdfImages).not.toHaveBeenCalled();
    });

    it('signed-in pages read images through FinalPdfController', async () => {
        const el = await submitted();
        deepQuery(el.shadowRoot, 'c-final-after-submit').dispatchEvent(
            new CustomEvent('downloadcopy')
        );
        await flush();
        await downloadPdf.mock.calls[0][0].loadImages(['068x']);
        expect(getPdfImages).toHaveBeenCalledWith({ versionIds: ['068x'] });
    });

    it('says when the PDF could not be made, and lets them try again', async () => {
        downloadPdf.mockImplementationOnce(() =>
            Promise.reject(new Error('The PDF could not be made.'))
        );
        const el = await submitted();
        const after = () => deepQuery(el.shadowRoot, 'c-final-after-submit');
        after().dispatchEvent(new CustomEvent('downloadcopy'));
        await flush();
        await flush();
        expect(after().downloadError).toBe('The PDF could not be made.');
        expect(after().downloadBusy).toBe(false);
        after().dispatchEvent(new CustomEvent('downloadcopy'));
        await flush();
        expect(downloadPdf).toHaveBeenCalledTimes(2);
    });

    it('getPdfSnapshot hands over the spec and tokens it paints with', async () => {
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.spec = JSON.parse(JSON.stringify(SPEC));
        document.body.appendChild(el);
        await flush();
        await flush();
        const snap = el.getPdfSnapshot();
        expect(snap.spec.header.title).toBe('Join us');
        expect(typeof snap.tokens).toBe('object');
    });
});
