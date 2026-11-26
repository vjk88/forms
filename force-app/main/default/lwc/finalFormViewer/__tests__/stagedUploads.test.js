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
/** `setup(viewer)` runs before the viewer connects, so listeners catch the
 *  slot the file control reserves as soon as it appears. */
async function mount(setup) {
    const viewer = createElement('c-final-form-viewer', {
        is: FinalFormViewer
    });
    viewer.formId = 'form-a';
    viewer.versionId = 'version-a';
    viewer.delegateSubmit = true;
    viewer.spec = JSON.parse(JSON.stringify(spec));
    if (setup) setup(viewer);
    document.body.appendChild(viewer);
    await flush();
    await flush();
    return viewer;
}
afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});
const slot = {
    slotKey: 'file-a',
    slotToken: 'm1.attempt.file-a.sig',
    markerField: 'Final_Upload_fileupload__c'
};
/** Session, slot and status answers; `arrived()` is what status reports. */
function server(viewer, arrived = () => []) {
    const actions = [];
    viewer.addEventListener('uploadrequest', (event) => {
        const action = event.detail.operation.action;
        actions.push(action);
        event.detail.resolve(
            action === 'create'
                ? { sessionToken: 's1.attempt.sig' }
                : action === 'reserve'
                  ? slot
                  : { files: arrived() }
        );
    });
    return actions;
}
it('passes an arrived file through the renderer into fileRefs without Base64', async () => {
    let arrived = [];
    let actions;
    const sent = jest.fn();
    const viewer = await mount((v) => {
        actions = server(v, () => arrived);
        v.addEventListener('submitrequest', sent);
    });
    const control = find(viewer.shadowRoot, 'c-final-file-upload');
    expect(control).not.toBeNull();
    expect(actions).toEqual(['create', 'reserve']);
    arrived = [
        {
            key: 'file-a',
            elementId: 'docs',
            state: 'READY',
            name: 'sample.txt',
            sizeBytes: 6
        }
    ];
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
    expect(payload.meta.uploadSessionToken).toBe('s1.attempt.sig');
    expect(payload.files).toBeUndefined();
    expect(payload.answers.docs).toBeUndefined();
});
it('holds Submit while the arrival check is still running', async () => {
    let releaseStatus;
    const sent = jest.fn();
    const viewer = await mount((v) => {
        v.addEventListener('uploadrequest', (event) => {
            const action = event.detail.operation.action;
            if (action === 'create')
                event.detail.resolve({ sessionToken: 's1.attempt.sig' });
            else if (action === 'reserve') event.detail.resolve(slot);
            else releaseStatus = event.detail.resolve; // delayed reply
        });
        v.addEventListener('submitrequest', sent);
    });
    const control = find(viewer.shadowRoot, 'c-final-file-upload');
    control.shadowRoot
        .querySelector('lightning-file-upload')
        .dispatchEvent(new CustomEvent('uploadfinished'));
    await flush();
    const bar = find(viewer.shadowRoot, 'c-final-submit-bar');
    bar.dispatchEvent(new CustomEvent('submit'));
    await flush();
    expect(sent).not.toHaveBeenCalled(); // still checking: held
    releaseStatus({
        files: [
            {
                key: 'file-a',
                elementId: 'docs',
                state: 'READY',
                name: 'sample.txt',
                sizeBytes: 6
            }
        ]
    });
    await flush();
    bar.dispatchEvent(new CustomEvent('submit'));
    await flush();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0].detail.payload.fileRefs).toEqual([
        { elementId: 'docs', slotToken: slot.slotToken }
    ]);
});
it('a confirmed empty reply after Cancel releases Submit at once', async () => {
    const sent = jest.fn();
    const viewer = await mount((v) => {
        server(v, () => []);
        v.addEventListener('submitrequest', sent);
    });
    const control = find(viewer.shadowRoot, 'c-final-file-upload');
    control.shadowRoot
        .querySelector('lightning-file-upload')
        .dispatchEvent(new CustomEvent('uploadfinished'));
    await flush();
    find(viewer.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0].detail.payload.fileRefs).toEqual([]);
});
it('an untouched optional file question does not block Submit', async () => {
    const sent = jest.fn();
    let actions;
    const viewer = await mount((v) => {
        actions = server(v);
        v.addEventListener('submitrequest', sent);
    });
    // The slot is ready, but nobody picked a file.
    find(viewer.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    expect(actions).toEqual(['create', 'reserve']);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0].detail.payload.fileRefs).toEqual([]);
    expect(sent.mock.calls[0][0].detail.payload.meta.uploadSessionToken).toBe(
        's1.attempt.sig'
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
