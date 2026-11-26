import { createElement } from 'lwc';
import FinalFileUpload from 'c/finalFileUpload';

const flush = () =>
    new Promise((resolve) => {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(resolve, 0);
    });
let slotCount = 0;
const nextSlot = (minutes = 10) => {
    slotCount += 1;
    return {
        slotKey: `slot-${slotCount}`,
        slotToken: `m1.attempt.slot-${slotCount}.sig`,
        markerField: 'Final_Upload_fileupload__c',
        accept: '.txt',
        maxBytes: 10485760,
        expiresAt: new Date(Date.now() + minutes * 60000).toISOString()
    };
};
function mount({ preview = false, config = { multiple: true } } = {}) {
    const el = createElement('c-final-file-upload', { is: FinalFileUpload });
    el.elementId = 'docs';
    el.label = 'Documents';
    el.config = config;
    el.preview = preview;
    return el;
}
/** Answers reserve with fresh slots and status with `files()`. */
function serve(el, files = () => []) {
    const calls = [];
    el.addEventListener('uploadoperation', (event) => {
        const op = event.detail.operation;
        calls.push(op);
        if (op.action === 'reserve') event.detail.resolve(nextSlot());
        else if (op.action === 'status')
            event.detail.resolve({ files: files() });
        else event.detail.resolve({ files: [] });
    });
    return calls;
}
afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
    jest.useRealTimers();
});

describe('file upload: slot first, row only when a file arrived', () => {
    it('reserves a slot on mount without touching the answer', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        const calls = serve(el);
        document.body.appendChild(el);
        const uploader = el.shadowRoot.querySelector('lightning-file-upload');
        expect(uploader.disabled).toBe(true); // unusable until signed
        await flush();
        expect(calls.map((c) => c.action)).toEqual(['reserve']);
        expect(changed).not.toHaveBeenCalled();
        expect(el.value).toEqual([]);
        expect(uploader.disabled).toBe(false);
        expect(uploader.fileFieldValue).toMatch(/^m1\./);
        expect(uploader.recordId).toBeUndefined();
        expect(uploader.label).toBeUndefined();
        expect(
            uploader.closest('[role="group"]').getAttribute('aria-label')
        ).toBe('Documents');
        expect(el.shadowRoot.querySelectorAll('.fu-row')).toHaveLength(0);
        expect(el.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        const labels = [
            ...el.shadowRoot.querySelectorAll('lightning-button')
        ].map((b) => b.label);
        expect(labels).not.toContain('Retry');
        expect(labels).not.toContain('Add a file');
    });

    it('keeps the same slot, quietly, when nothing arrived (refused or cancelled)', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        const calls = serve(el, () => []);
        document.body.appendChild(el);
        await flush();
        const uploader = el.shadowRoot.querySelector('lightning-file-upload');
        const token = uploader.fileFieldValue;
        uploader.dispatchEvent(new CustomEvent('uploadfinished'));
        await flush();
        expect(calls.map((c) => c.action)).toEqual(['reserve', 'status']);
        expect(el.shadowRoot.querySelectorAll('.fu-row')).toHaveLength(0);
        expect(el.shadowRoot.querySelector('[role="alert"]')).toBeNull();
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').fileFieldValue
        ).toBe(token);
        expect(changed.mock.calls.at(-1)[0].detail.value).toEqual([]);
    });

    it('shows the arrived file and reserves the next slot', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        let arrived = [];
        const calls = serve(el, () => arrived);
        document.body.appendChild(el);
        await flush();
        const uploader = el.shadowRoot.querySelector('lightning-file-upload');
        const first = uploader.fileFieldValue;
        const key = first.split('.')[2];
        arrived = [
            {
                key,
                elementId: 'docs',
                state: 'READY',
                name: 'sample.txt',
                sizeBytes: 6
            },
            // another question's file is not this question's row
            { key: 'x', elementId: 'other', state: 'READY', name: 'x.txt' }
        ];
        uploader.dispatchEvent(
            new CustomEvent('uploadfinished', {
                detail: { files: [{ documentId: 'UNTRUSTED', name: 'fake' }] }
            })
        );
        await flush();
        const value = changed.mock.calls.at(-1)[0].detail.value;
        expect(value).toHaveLength(1);
        expect(value[0]).toMatchObject({
            kind: 'stagedV1',
            key,
            slotToken: first,
            name: 'sample.txt',
            sizeBytes: 6,
            state: 'ready'
        });
        expect(value[0].documentId).toBeUndefined();
        expect(calls.map((c) => c.action)).toEqual([
            'reserve',
            'status',
            'reserve'
        ]);
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').fileFieldValue
        ).not.toBe(first);
    });

    it('keeps a pending row with Retry when the arrival check fails', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        el.addEventListener('uploadoperation', (event) => {
            if (event.detail.operation.action === 'reserve')
                event.detail.resolve(nextSlot());
            else event.detail.reject(new Error('network'));
        });
        document.body.appendChild(el);
        await flush();
        el.shadowRoot.querySelector('lightning-file-upload').dispatchEvent(
            new CustomEvent('uploadfinished', {
                detail: { files: [{ name: 'sample.txt' }] }
            })
        );
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

    it('a single-file question stops offering the uploader once it has a file', async () => {
        const el = mount({ config: { multiple: false } });
        let arrived = [];
        const calls = serve(el, () => arrived);
        document.body.appendChild(el);
        await flush();
        const uploader = el.shadowRoot.querySelector('lightning-file-upload');
        arrived = [
            {
                key: uploader.fileFieldValue.split('.')[2],
                elementId: 'docs',
                state: 'READY',
                name: 'one.txt'
            }
        ];
        uploader.dispatchEvent(new CustomEvent('uploadfinished'));
        await flush();
        expect(el.shadowRoot.querySelector('lightning-file-upload')).toBeNull();
        expect(calls.filter((c) => c.action === 'reserve')).toHaveLength(1);
    });

    it('replaces an unused slot shortly before it expires', async () => {
        jest.useFakeTimers();
        const el = mount();
        const calls = [];
        el.addEventListener('uploadoperation', (event) => {
            calls.push(event.detail.operation.action);
            event.detail.resolve(nextSlot(2));
        });
        document.body.appendChild(el);
        await Promise.resolve();
        await Promise.resolve();
        const first = el.shadowRoot.querySelector(
            'lightning-file-upload'
        ).fileFieldValue;
        jest.advanceTimersByTime(60000 + 1000);
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toEqual(['reserve', 'reserve']);
        expect(
            el.shadowRoot.querySelector('lightning-file-upload').fileFieldValue
        ).not.toBe(first);
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
            {
                kind: 'stagedV1',
                key: 'file-a',
                slotToken: 'm1.attempt.file-a.sig',
                name: 'sample.txt',
                state: 'ready'
            }
        ];
        el.addEventListener('uploadoperation', (event) => {
            if (event.detail.operation.action === 'remove')
                event.detail.reject({
                    body: { message: 'Try removing again.' }
                });
            else event.detail.resolve(nextSlot());
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

    it('offers Retry when a slot could not be prepared', async () => {
        const el = mount();
        let fail = true;
        el.addEventListener('uploadoperation', (event) => {
            if (fail) event.detail.reject(new Error('Upload is unavailable.'));
            else event.detail.resolve(nextSlot());
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

    it('ignores a reserve response after the control unmounts', async () => {
        const el = mount();
        const changed = jest.fn();
        let release;
        el.addEventListener('valuechange', changed);
        el.addEventListener('uploadoperation', (event) => {
            release = event.detail.resolve;
        });
        document.body.appendChild(el);
        el.remove();
        release(nextSlot());
        await flush();
        expect(changed).not.toHaveBeenCalled();
    });
});
