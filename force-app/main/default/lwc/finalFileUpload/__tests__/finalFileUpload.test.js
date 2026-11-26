import { createElement } from 'lwc';
import FinalFileUpload from 'c/finalFileUpload';

const flush = () =>
    new Promise((resolve) => {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(resolve, 0);
    });
const TAG = {
    tag: 't1.attempt.version.ZG9jcw.1795700000.0.sig',
    markerField: 'Final_Upload_fileupload__c',
    accept: '.txt',
    maxBytes: 10485760
};
const ready = (key, name, elementId = 'docs') => ({
    key,
    elementId,
    state: 'READY',
    name,
    sizeBytes: 6
});
function mount({ preview = false, config = { multiple: true } } = {}) {
    const el = createElement('c-final-file-upload', { is: FinalFileUpload });
    el.elementId = 'docs';
    el.label = 'Documents';
    el.config = config;
    el.preview = preview;
    return el;
}
/** Answers reserve with the tag and status with `files()`. */
function serve(el, files = () => []) {
    const calls = [];
    el.addEventListener('uploadoperation', (event) => {
        const op = event.detail.operation;
        calls.push(op);
        if (op.action === 'reserve') event.detail.resolve(TAG);
        else if (op.action === 'status')
            event.detail.resolve({ files: files() });
        else event.detail.resolve({ files: [] });
    });
    return calls;
}
const finish = (el, names = []) =>
    el.shadowRoot.querySelector('lightning-file-upload').dispatchEvent(
        new CustomEvent('uploadfinished', {
            detail: { files: names.map((name) => ({ name })) }
        })
    );
afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});

describe('file upload: one tag per question, rows from the server', () => {
    it('asks for the tag on mount without touching the answer', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        const calls = serve(el);
        document.body.appendChild(el);
        const uploader = el.shadowRoot.querySelector('lightning-file-upload');
        expect(uploader.disabled).toBe(true); // unusable until signed
        const group = uploader.closest('[role="group"]');
        expect(
            el.shadowRoot.querySelector('.fu-help[role="status"]').textContent
        ).toBe('Preparing upload…');
        expect(group.getAttribute('aria-busy')).toBe('true');
        const early = new CustomEvent('drop', { cancelable: true });
        group.dispatchEvent(early);
        expect(early.defaultPrevented).toBe(true); // greyed: drop swallowed
        await flush();
        expect(calls.map((c) => c.action)).toEqual(['reserve']);
        expect(changed).not.toHaveBeenCalled();
        expect(uploader.disabled).toBe(false);
        expect(uploader.fileFieldValue).toBe(TAG.tag);
        expect(uploader.multiple).toBe(true);
        expect(uploader.recordId).toBeUndefined();
        expect(uploader.label).toBeUndefined();
        expect(group.getAttribute('aria-label')).toBe('Documents');
        expect(group.getAttribute('aria-busy')).toBe('false');
        const later = new CustomEvent('drop', { cancelable: true });
        group.dispatchEvent(later);
        expect(later.defaultPrevented).toBe(false); // native input takes it
        expect(
            el.shadowRoot.querySelector('.fu-help[role="status"]')
        ).toBeNull();
        expect(el.shadowRoot.querySelectorAll('.fu-row')).toHaveLength(0);
        const labels = [
            ...el.shadowRoot.querySelectorAll('lightning-button')
        ].map((b) => b.label);
        expect(labels).not.toContain('Retry');
        expect(labels).not.toContain('Add a file');
    });

    it('shows every arrived file for this question and keeps the same tag', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        let arrived = [];
        const calls = serve(el, () => arrived);
        document.body.appendChild(el);
        await flush();
        arrived = [
            ready('k1', 'one.txt'),
            ready('k2', 'two.txt'),
            ready('x', 'other.txt', 'other') // another question's file
        ];
        finish(el, ['one.txt', 'two.txt']);
        await flush();
        const value = changed.mock.calls.at(-1)[0].detail.value;
        expect(value.map((row) => row.key)).toEqual(['k1', 'k2']);
        expect(value[0]).toMatchObject({
            kind: 'stagedV1',
            name: 'one.txt',
            sizeBytes: 6,
            state: 'ready'
        });
        expect(value[0].documentId).toBeUndefined();
        expect(calls.map((c) => c.action)).toEqual(['reserve', 'status']);
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').fileFieldValue
        ).toBe(TAG.tag);
    });

    it('holds Submit with pending rows until the status reply', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        let release;
        el.addEventListener('uploadoperation', (event) => {
            if (event.detail.operation.action === 'reserve')
                event.detail.resolve(TAG);
            else release = event.detail.resolve;
        });
        document.body.appendChild(el);
        await flush();
        finish(el, ['a.txt', 'b.txt']);
        await flush();
        const pending = changed.mock.calls.at(-1)[0].detail.value;
        expect(pending.map((row) => [row.name, row.state])).toEqual([
            ['a.txt', 'pending'],
            ['b.txt', 'pending']
        ]);
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').disabled
        ).toBe(true);
        release({ files: [ready('k1', 'a.txt')] });
        await flush();
        const settled = changed.mock.calls.at(-1)[0].detail.value;
        expect(settled.map((row) => [row.key, row.state])).toEqual([
            ['k1', 'ready']
        ]);
    });

    it('a confirmed empty reply (cancel or refusal) leaves no row and no error', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        serve(el, () => []);
        document.body.appendChild(el);
        await flush();
        finish(el);
        await flush();
        expect(changed.mock.calls.at(-1)[0].detail.value).toEqual([]);
        expect(el.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').disabled
        ).toBe(false);
    });

    it('keeps pending rows with Retry when the arrival check fails', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        el.addEventListener('uploadoperation', (event) => {
            if (event.detail.operation.action === 'reserve')
                event.detail.resolve(TAG);
            else event.detail.reject(new Error('network'));
        });
        document.body.appendChild(el);
        await flush();
        finish(el, ['sample.txt']);
        await flush();
        const value = changed.mock.calls.at(-1)[0].detail.value;
        expect(value).toHaveLength(1);
        expect(value[0]).toMatchObject({
            state: 'pending',
            name: 'sample.txt'
        });
        const labels = [
            ...el.shadowRoot.querySelectorAll('lightning-button')
        ].map((b) => b.label);
        expect(labels).toContain('Retry');
        expect(el.shadowRoot.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('removes a file by its server key', async () => {
        const el = mount();
        el.value = [
            { kind: 'stagedV1', key: 'k1', name: 'a.txt', state: 'ready' }
        ];
        const calls = serve(el);
        document.body.appendChild(el);
        await flush();
        el.shadowRoot.querySelector('lightning-button-icon').click();
        await flush();
        expect(calls.at(-1)).toMatchObject({ action: 'remove', fileKey: 'k1' });
        expect(el.value).toEqual([]);
    });

    it('a single-file question stops offering the uploader once it has a file', async () => {
        const el = mount({ config: { multiple: false } });
        let arrived = [];
        const calls = serve(el, () => arrived);
        document.body.appendChild(el);
        await flush();
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').multiple
        ).toBe(false);
        arrived = [ready('k1', 'one.txt')];
        finish(el, ['one.txt']);
        await flush();
        expect(el.shadowRoot.querySelector('lightning-file-upload')).toBeNull();
        expect(calls.filter((c) => c.action === 'reserve')).toHaveLength(1);
    });

    it('simulates metadata only in preview without creating upload requests', async () => {
        const el = mount({ preview: true });
        const request = jest.fn();
        const changed = jest.fn();
        el.addEventListener('uploadoperation', request);
        el.addEventListener('valuechange', changed);
        document.body.appendChild(el);
        const input = el.shadowRoot.querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', {
            value: [new File(['sample'], 'sample.txt')]
        });
        input.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(request).not.toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('lightning-file-upload')).toBeNull();
        expect(changed.mock.calls[0][0].detail.value[0]).toMatchObject({
            kind: 'preview',
            name: 'sample.txt',
            sizeBytes: 6
        });
        expect(changed.mock.calls[0][0].detail.value[0].base64).toBeUndefined();
    });

    it('keeps an attachment when removal fails', async () => {
        const el = mount();
        el.value = [
            { kind: 'stagedV1', key: 'k1', name: 'a.txt', state: 'ready' }
        ];
        el.addEventListener('uploadoperation', (event) => {
            if (event.detail.operation.action === 'remove')
                event.detail.reject({
                    body: { message: 'Try removing again.' }
                });
            else event.detail.resolve(TAG);
        });
        document.body.appendChild(el);
        await flush();
        el.shadowRoot.querySelector('lightning-button-icon').click();
        await flush();
        expect(el.value).toHaveLength(1);
        expect(
            el.shadowRoot.querySelector('[role="alert"]').textContent
        ).toContain('Try removing again');
    });

    it('offers Retry when the tag could not be prepared', async () => {
        const el = mount();
        let fail = true;
        el.addEventListener('uploadoperation', (event) => {
            if (fail) event.detail.reject(new Error('Upload is unavailable.'));
            else event.detail.resolve(TAG);
        });
        document.body.appendChild(el);
        await flush();
        const retry = [
            ...el.shadowRoot.querySelectorAll('lightning-button')
        ].find((b) => b.label === 'Retry');
        expect(retry).toBeTruthy();
        fail = false;
        retry.click();
        await flush();
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').disabled
        ).toBe(false);
        expect(el.shadowRoot.querySelector('[role="alert"]')).toBeNull();
    });

    it('ignores a tag response after the control unmounts', async () => {
        const el = mount();
        const changed = jest.fn();
        let release;
        el.addEventListener('valuechange', changed);
        el.addEventListener('uploadoperation', (event) => {
            release = event.detail.resolve;
        });
        document.body.appendChild(el);
        el.remove();
        release(TAG);
        await flush();
        expect(changed).not.toHaveBeenCalled();
    });
});
