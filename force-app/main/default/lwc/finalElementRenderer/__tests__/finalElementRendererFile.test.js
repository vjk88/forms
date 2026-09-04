import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/** jsdom's FileReader is real, but a File built from a string is enough:
 *  readAsDataURL gives `data:...;base64,<payload>` and the component keeps
 *  only the part after the comma (schema §8 carries bare base64). */
function makeFile(name, content = 'hello', size) {
    const file = new File([content], name, { type: 'text/plain' });
    if (size !== undefined) {
        Object.defineProperty(file, 'size', { value: size });
    }
    return file;
}

function mount(element) {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
}

const FILE_EL = (over = {}) => ({
    id: 'el_f1',
    type: 'file',
    label: 'Attach your CV',
    ...over
});

/** FileReader resolves on a macrotask; two flushes covers read + re-render. */
const flush = () =>
    new Promise((r) => setTimeout(r, 0)).then(
        () => new Promise((r) => setTimeout(r, 0))
    );

describe('finalElementRenderer — file upload', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders a real control, not the old "arrives later" stub', () => {
        const el = mount(FILE_EL());
        const root = el.shadowRoot;

        expect(root.textContent).not.toContain('later step');
        expect(root.querySelector('.block-file-frame')).not.toBeNull();
        expect(root.querySelector('input[type="file"]')).not.toBeNull();
        expect(root.querySelector('.field-label').textContent).toContain(
            'Attach your CV'
        );
    });

    it('picking a file emits valuechange carrying name + base64', async () => {
        const el = mount(FILE_EL());
        const values = [];
        el.addEventListener('valuechange', (e) => values.push(e.detail));

        const input = el.shadowRoot.querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', {
            value: [makeFile('cv.txt', 'hello')],
            configurable: true
        });
        input.dispatchEvent(new CustomEvent('change'));
        await flush();

        expect(values).toHaveLength(1);
        expect(values[0].elementId).toBe('el_f1');
        expect(values[0].value).toHaveLength(1);
        expect(values[0].value[0].name).toBe('cv.txt');
        // base64 of "hello", and crucially NOT the data: prefix
        expect(values[0].value[0].base64).toBe('aGVsbG8=');
        expect(values[0].value[0].base64).not.toContain('data:');
    });

    it('lists the attached file and removes it on ×', async () => {
        const el = mount(FILE_EL());
        const values = [];
        el.addEventListener('valuechange', (e) => values.push(e.detail));

        const input = el.shadowRoot.querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', {
            value: [makeFile('cv.txt')],
            configurable: true
        });
        input.dispatchEvent(new CustomEvent('change'));
        await flush();

        const item = el.shadowRoot.querySelector('.file-item-name');
        expect(item.textContent).toBe('cv.txt');

        el.shadowRoot.querySelector('.file-item-x').click();
        await flush();

        expect(el.shadowRoot.querySelector('.file-item')).toBeNull();
        expect(values[values.length - 1].value).toEqual([]);
    });

    it('an oversize file is refused inline and never reaches the answer', async () => {
        const el = mount(FILE_EL());
        const values = [];
        el.addEventListener('valuechange', (e) => values.push(e.detail));

        const input = el.shadowRoot.querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', {
            value: [makeFile('huge.bin', 'x', 99 * 1024 * 1024)],
            configurable: true
        });
        input.dispatchEvent(new CustomEvent('change'));
        await flush();

        const alert = el.shadowRoot.querySelector('.field-errors');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('larger than');
        // nothing valid was picked, so no file rides the answer
        expect(values[values.length - 1].value).toEqual([]);
    });

    it('single-file elements replace rather than accumulate', async () => {
        const el = mount(FILE_EL());
        const input = el.shadowRoot.querySelector('input[type="file"]');
        const pick = async (name) => {
            Object.defineProperty(input, 'files', {
                value: [makeFile(name)],
                configurable: true
            });
            input.dispatchEvent(new CustomEvent('change'));
            await flush();
        };

        await pick('one.txt');
        await pick('two.txt');

        const names = [...el.shadowRoot.querySelectorAll('.file-item-name')];
        expect(names).toHaveLength(1);
        expect(names[0].textContent).toBe('two.txt');
    });

    it('hydrates from the viewer answer so a remount is not a data loss', () => {
        const el = mount(
            FILE_EL({ value: [{ name: 'saved.pdf', base64: 'aGVsbG8=' }] })
        );
        expect(el.shadowRoot.querySelector('.file-item-name').textContent).toBe(
            'saved.pdf'
        );
    });

    it('the accept config reaches the input and the hint', () => {
        const el = mount(
            FILE_EL({ config: { accept: '.pdf', multiple: true } })
        );
        const input = el.shadowRoot.querySelector('input[type="file"]');

        expect(input.getAttribute('accept')).toBe('.pdf');
        expect(input.multiple).toBe(true);
        expect(
            el.shadowRoot.querySelector('.block-file-hint').textContent
        ).toContain('.pdf');
    });
});
