import { createElement } from 'lwc';
import FinalImageUploader from 'c/finalImageUploader';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FinalAssetController.deleteImage';

jest.mock(
    '@salesforce/apex/FinalAssetController.uploadImage',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAssetController.deleteImage',
    () => ({ default: jest.fn(() => Promise.resolve()) }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-image-uploader', {
        is: FinalImageUploader
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

function pickFile(el, file) {
    const input = el.shadowRoot.querySelector('.file-input');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new CustomEvent('change'));
}

class FakeReader {
    readAsDataURL() {
        this.result = 'data:image/png;base64,AAA';
        setTimeout(() => this.onload());
    }
}

describe('c-final-image-uploader', () => {
    let realReader;
    beforeEach(() => {
        realReader = window.FileReader;
        window.FileReader = FakeReader;
        jest.clearAllMocks();
    });
    afterEach(() => {
        window.FileReader = realReader;
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders label and Upload cta when empty; no thumbnail, no Remove', () => {
        const el = mount({ label: 'Logo' });
        expect(el.shadowRoot.querySelector('.label').textContent).toBe('Logo');
        expect(el.shadowRoot.querySelector('.btn').textContent.trim()).toBe(
            'Upload image…'
        );
        expect(el.shadowRoot.querySelector('.thumb')).toBeNull();
        expect(el.shadowRoot.querySelector('.linkbtn')).toBeNull();
    });

    it('with an image: thumbnail + Replace + Remove', () => {
        const el = mount({
            label: 'Logo',
            url: '/sfc/x',
            contentVersionId: '068X'
        });
        expect(el.shadowRoot.querySelector('.thumb').getAttribute('src')).toBe(
            '/sfc/x'
        );
        expect(el.shadowRoot.querySelector('.btn').textContent.trim()).toBe(
            'Replace'
        );
        expect(el.shadowRoot.querySelector('.linkbtn')).not.toBeNull();
    });

    it('uploads a valid file and emits change with url + versionId', async () => {
        uploadImage.mockResolvedValue({
            url: '/sfc/new',
            contentVersionId: '068NEW'
        });
        const el = mount({ label: 'Logo', formId: 'a04X' });
        const handler = jest.fn();
        el.addEventListener('change', handler);

        pickFile(el, { name: 'logo.png', type: 'image/png', size: 100 });
        await flush();

        expect(uploadImage).toHaveBeenCalledWith({
            base64Data: 'data:image/png;base64,AAA',
            fileName: 'logo.png',
            formId: 'a04X'
        });
        expect(handler.mock.calls[0][0].detail).toEqual({
            url: '/sfc/new',
            contentVersionId: '068NEW'
        });
    });

    it('replace deletes the OLD version after a successful upload', async () => {
        uploadImage.mockResolvedValue({
            url: '/sfc/new',
            contentVersionId: '068NEW'
        });
        const el = mount({
            label: 'Logo',
            url: '/sfc/old',
            contentVersionId: '068OLD'
        });
        pickFile(el, { name: 'n.png', type: 'image/png', size: 100 });
        await flush();
        expect(deleteImage).toHaveBeenCalledWith({
            contentVersionId: '068OLD'
        });
    });

    it('failed upload deletes NOTHING and shows the server error', async () => {
        uploadImage.mockRejectedValue({ body: { message: 'Too big.' } });
        const el = mount({
            label: 'Logo',
            url: '/sfc/old',
            contentVersionId: '068OLD'
        });
        pickFile(el, { name: 'n.png', type: 'image/png', size: 100 });
        await flush();
        expect(deleteImage).not.toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('.error').textContent).toBe(
            'Too big.'
        );
    });

    it('rejects a wrong type client-side without calling Apex', async () => {
        const el = mount({ label: 'Logo' });
        pickFile(el, { name: 'x.svg', type: 'image/svg+xml', size: 100 });
        await flush();
        expect(uploadImage).not.toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('.error').textContent).toContain(
            'Unsupported image type'
        );
    });

    it('rejects an oversize file client-side', async () => {
        const el = mount({ label: 'Logo', maxSizeMb: 1 });
        pickFile(el, {
            name: 'big.png',
            type: 'image/png',
            size: 2 * 1024 * 1024
        });
        await flush();
        expect(uploadImage).not.toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('.error').textContent).toContain(
            '1 MB limit'
        );
    });

    it('remove deletes the version and emits a null change', async () => {
        const el = mount({
            label: 'Logo',
            url: '/sfc/old',
            contentVersionId: '068OLD'
        });
        const handler = jest.fn();
        el.addEventListener('change', handler);
        el.shadowRoot.querySelector('.linkbtn').click();
        await flush();
        expect(deleteImage).toHaveBeenCalledWith({
            contentVersionId: '068OLD'
        });
        expect(handler.mock.calls[0][0].detail).toEqual({
            url: null,
            contentVersionId: null
        });
    });
});
