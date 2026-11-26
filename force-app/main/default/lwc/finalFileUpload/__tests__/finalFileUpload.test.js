import { createElement } from 'lwc';
import FinalFileUpload from 'c/finalFileUpload';

const flush = () => Promise.resolve().then(() => Promise.resolve());
const slot = {
    slotKey: 'file-a',
    slotToken: 'attempt.file-a.secret',
    markerField: 'Final_Upload_fileupload__c',
    accept: '.txt',
    maxBytes: 10485760
};
function mount(preview = false) {
    const el = createElement('c-final-file-upload', { is: FinalFileUpload });
    el.elementId = 'docs';
    el.label = 'Documents';
    el.config = { multiple: true };
    el.preview = preview;
    document.body.appendChild(el);
    return el;
}
afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
});
describe('file upload transport and receipts', () => {
    it('does not reserve anything on mount', () => {
        const el = mount();
        expect(el.shadowRoot.querySelector('lightning-file-upload')).toBeNull();
    });
    it('emits a real pending row then accepts only the server status receipt', async () => {
        const el = mount();
        const changed = jest.fn();
        el.addEventListener('valuechange', changed);
        el.addEventListener('uploadoperation', (event) =>
            event.detail.resolve(
                event.detail.operation.action === 'reserve'
                    ? slot
                    : {
                          files: [
                              {
                                  key: slot.slotKey,
                                  state: 'READY',
                                  name: 'sample.txt',
                                  sizeBytes: 6
                              }
                          ]
                      }
            )
        );
        el.shadowRoot.querySelector('[data-add]').click();
        await flush();
        expect(changed.mock.calls[0][0].detail.value[0]).toMatchObject({
            kind: 'stagedV1',
            key: 'file-a',
            state: 'pending',
            slotToken: slot.slotToken
        });
        const uploader = el.shadowRoot.querySelector('lightning-file-upload');
        expect(uploader.recordId).toBeUndefined();
        expect(uploader.fileFieldValue).toBe(slot.slotToken);
        uploader.dispatchEvent(
            new CustomEvent('uploadfinished', {
                detail: {
                    files: [{ documentId: 'UNTRUSTED', name: 'fake.txt' }]
                }
            })
        );
        await flush();
        const last =
            changed.mock.calls[changed.mock.calls.length - 1][0].detail
                .value[0];
        expect(last).toMatchObject({
            name: 'sample.txt',
            sizeBytes: 6,
            state: 'ready'
        });
        expect(last.documentId).toBeUndefined();
    });
    it('simulates metadata only in preview without creating upload requests', async () => {
        const el = mount(true);
        const request = jest.fn();
        const changed = jest.fn();
        el.addEventListener('uploadoperation', request);
        el.addEventListener('valuechange', changed);
        const input = el.shadowRoot.querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', {
            value: [new File(['sample'], 'sample.txt')]
        });
        input.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(request).not.toHaveBeenCalled();
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
                slotToken: slot.slotToken,
                name: 'sample.txt',
                state: 'ready'
            }
        ];
        await flush();
        el.addEventListener('uploadoperation', (event) =>
            event.detail.reject({ body: { message: 'Try removing again.' } })
        );
        el.shadowRoot.querySelector('lightning-button-icon').click();
        await flush();
        expect(el.value).toHaveLength(1);
        expect(
            el.shadowRoot.querySelector('[role="alert"]').textContent
        ).toContain('Try removing again');
    });
    it('shows no row or Retry for a slot whose file was not picked yet', async () => {
        const el = mount();
        const actions = [];
        el.addEventListener('uploadoperation', (event) => {
            actions.push(event.detail.operation);
            event.detail.resolve(
                event.detail.operation.action === 'reserve' ? slot : {}
            );
        });
        el.shadowRoot.querySelector('[data-add]').click();
        await flush();
        const root = el.shadowRoot;
        expect(root.querySelector('lightning-file-upload')).not.toBeNull();
        expect(root.querySelector('lightning-file-upload').label).toBe(
            undefined
        );
        expect(
            root
                .querySelector('lightning-file-upload')
                .closest('[role="group"]')
                .getAttribute('aria-label')
        ).toBe('Documents');
        expect(root.querySelectorAll('.fu-row')).toHaveLength(0);
        expect(root.querySelector('[role="status"]')).toBeNull();
        const buttons = [...root.querySelectorAll('lightning-button')];
        expect(buttons.map((b) => b.label)).not.toContain('Retry');
        const cancel = root.querySelector('.fu-cancel');
        expect(cancel.label).toBe('Cancel this upload');
        cancel.click();
        await flush();
        expect(actions[1]).toMatchObject({
            action: 'remove',
            slotToken: slot.slotToken
        });
        expect(el.value).toHaveLength(0);
        expect(root.querySelector('lightning-file-upload')).toBeNull();
        expect(root.querySelector('.fu-cancel')).toBeNull();
    });
    it('shows the row with Retry once a sent file is still unconfirmed', async () => {
        const el = mount();
        el.addEventListener('uploadoperation', (event) =>
            event.detail.resolve(
                event.detail.operation.action === 'reserve'
                    ? slot
                    : {
                          files: [
                              {
                                  key: slot.slotKey,
                                  state: 'RESERVED',
                                  name: 'sample.txt'
                              }
                          ]
                      }
            )
        );
        el.shadowRoot.querySelector('[data-add]').click();
        await flush();
        el.shadowRoot
            .querySelector('lightning-file-upload')
            .dispatchEvent(new CustomEvent('uploadfinished'));
        await flush();
        const root = el.shadowRoot;
        expect(root.querySelectorAll('.fu-row')).toHaveLength(1);
        expect(root.querySelector('[role="status"]').textContent).toBe(
            'Checking upload…'
        );
        const buttons = [...root.querySelectorAll('lightning-button')];
        expect(buttons.map((b) => b.label)).toContain('Retry');
        expect(root.querySelector('.fu-cancel')).toBeNull();
    });
    it('ignores a reserve response after the control unmounts', async () => {
        const el = mount();
        const changed = jest.fn();
        let release;
        el.addEventListener('valuechange', changed);
        el.addEventListener('uploadoperation', (event) => {
            release = event.detail.resolve;
        });
        el.shadowRoot.querySelector('[data-add]').click();
        el.remove();
        release(slot);
        await flush();
        expect(changed).not.toHaveBeenCalled();
    });
});
