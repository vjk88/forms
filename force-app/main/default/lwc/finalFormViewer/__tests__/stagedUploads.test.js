import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function find(root, selector) {
    const own = root.querySelector(selector);
    if (own) return own;
    for (const child of root.querySelectorAll('*')) {
        if (child.shadowRoot) {
            const found = find(child.shadowRoot, selector);
            if (found) return found;
        }
    }
    return null;
}
const spec = {
    specVersion: 1,
    form: { type: 'form', name: 'Uploads', targetObject: 'Contact' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { uploads: { transport: 'stagedV1' } },
    pages: [
        {
            id: 'pg',
            sections: [
                {
                    id: 'sec',
                    elements: [
                        {
                            id: 'docs',
                            type: 'file',
                            label: 'Documents',
                            config: { multiple: true }
                        }
                    ]
                }
            ]
        }
    ]
};
async function mount() {
    const viewer = createElement('c-final-form-viewer', {
        is: FinalFormViewer
    });
    viewer.formId = 'form-a';
    viewer.versionId = 'version-a';
    viewer.delegateSubmit = true;
    viewer.spec = JSON.parse(JSON.stringify(spec));
    document.body.appendChild(viewer);
    await flush();
    await flush();
    return viewer;
}
afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});
it('passes the real uploader event through the renderer into fileRefs without Base64', async () => {
    const viewer = await mount();
    const sent = jest.fn();
    viewer.addEventListener('submitrequest', sent);
    const slot = {
        slotKey: 'file-a',
        slotToken: 'attempt.file-a.secret',
        markerField: 'Final_Upload_fileupload__c'
    };
    viewer.addEventListener('uploadrequest', (event) => {
        const action = event.detail.operation.action;
        event.detail.resolve(
            action === 'create'
                ? { sessionToken: 'attempt.secret' }
                : action === 'reserve'
                  ? slot
                  : {
                        files: [
                            {
                                key: 'file-a',
                                state: 'READY',
                                name: 'sample.txt',
                                sizeBytes: 6
                            }
                        ]
                    }
        );
    });
    const control = find(viewer.shadowRoot, 'c-final-file-upload');
    expect(control).not.toBeNull();
    control.shadowRoot.querySelector('[data-add]').click();
    await flush();
    // A pending native upload must block submission.
    find(viewer.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    expect(sent).not.toHaveBeenCalled();
    control.shadowRoot
        .querySelector('lightning-file-upload')
        .dispatchEvent(new CustomEvent('uploadfinished'));
    await flush();
    find(viewer.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    expect(sent).toHaveBeenCalledTimes(1);
    const payload = sent.mock.calls[0][0].detail.payload;
    expect(payload.fileRefs).toEqual([
        { elementId: 'docs', slotToken: slot.slotToken }
    ]);
    expect(payload.meta.uploadSessionToken).toBe('attempt.secret');
    expect(payload.files).toBeUndefined();
    expect(payload.answers.docs).toBeUndefined();
});
it('creates an empty attempt for an optional attachment submission', async () => {
    const viewer = await mount();
    const sent = jest.fn();
    const requests = jest.fn((event) =>
        event.detail.resolve({ sessionToken: 'empty.secret' })
    );
    viewer.addEventListener('uploadrequest', requests);
    viewer.addEventListener('submitrequest', sent);
    find(viewer.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0].detail.payload.fileRefs).toEqual([]);
    expect(sent.mock.calls[0][0].detail.payload.meta.uploadSessionToken).toBe(
        'empty.secret'
    );
});
it('drops a submit awaiting an attempt after the respondent context changes', async () => {
    const viewer = await mount();
    const sent = jest.fn();
    let release;
    viewer.addEventListener('submitrequest', sent);
    viewer.addEventListener('uploadrequest', (event) => {
        if (event.detail.operation.action === 'create')
            release = event.detail.resolve;
        else event.detail.resolve({});
    });
    find(viewer.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    viewer.formId = 'form-b';
    viewer.spec = JSON.parse(JSON.stringify(spec));
    await flush();
    release({ sessionToken: 'retired.secret' });
    await flush();
    expect(sent).not.toHaveBeenCalled();
});
