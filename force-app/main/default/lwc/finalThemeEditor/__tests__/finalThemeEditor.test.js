import { createElement } from 'lwc';
import FinalThemeEditor from 'c/finalThemeEditor';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';

jest.mock(
    '@salesforce/apex/FinalThemeController.saveCustomTheme',
    () => ({ default: jest.fn(() => Promise.resolve('a0AXX0000001')) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({
        default: jest.fn(() =>
            Promise.resolve('{"palette":{"accent":"#111111"}}')
        )
    }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-theme-editor', {
        is: FinalThemeEditor
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-theme-editor', () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('create mode forks the start-from built-in', async () => {
        const el = mount({ startFrom: 'nordic' });
        await flush();
        const accent = el.shadowRoot.querySelector(
            'c-final-color-control[data-path="palette.accent"]'
        );
        expect(accent.value).toBe('#1e3a8a'); // nordic's accent
    });

    it('edit mode loads the record JSON', async () => {
        const el = mount({ themeId: 'a0AXX0000001' });
        await flush();
        await flush();
        expect(getCustomTheme).toHaveBeenCalledWith({
            themeId: 'a0AXX0000001'
        });
        const accent = el.shadowRoot.querySelector(
            'c-final-color-control[data-path="palette.accent"]'
        );
        expect(accent.value).toBe('#111111');
    });

    it('save requires a name', async () => {
        const el = mount({ startFrom: 'nordic' });
        await flush();
        const primary = el.shadowRoot.querySelector('.te-btn.primary');
        expect(primary.disabled).toBe(true);
    });

    it('edits + Create theme persist the edited recipe and emit save', async () => {
        const el = mount({ startFrom: 'nordic' });
        await flush();
        const saved = jest.fn();
        el.addEventListener('save', saved);

        const name = el.shadowRoot.querySelector('.te-row input[type="text"]');
        name.value = 'Brand Purple';
        name.dispatchEvent(new CustomEvent('input'));
        el.shadowRoot
            .querySelector('c-final-color-control[data-path="palette.accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#7c2d9c' } })
            );
        await flush();
        el.shadowRoot.querySelector('.te-btn.primary').click();
        await flush();

        expect(saveCustomTheme).toHaveBeenCalledTimes(1);
        const args = saveCustomTheme.mock.calls[0][0];
        expect(args.themeId).toBeNull();
        expect(args.name).toBe('Brand Purple');
        expect(args.baseTheme).toBe('nordic');
        expect(JSON.parse(args.themeJson).palette.accent).toBe('#7c2d9c');
        expect(saved.mock.calls[0][0].detail).toEqual({
            id: 'a0AXX0000001',
            name: 'Brand Purple'
        });
    });

    it('cancel emits cancel (overlay click too)', async () => {
        const el = mount({ startFrom: 'nordic' });
        await flush();
        const cancel = jest.fn();
        el.addEventListener('cancel', cancel);
        el.shadowRoot.querySelector('.te-overlay').click();
        expect(cancel).toHaveBeenCalled();
    });

    it('server error surfaces inline, no save event', async () => {
        saveCustomTheme.mockRejectedValueOnce({
            body: { message: 'A theme name is required.' }
        });
        const el = mount({ startFrom: 'nordic' });
        await flush();
        const saved = jest.fn();
        el.addEventListener('save', saved);
        const name = el.shadowRoot.querySelector('.te-row input[type="text"]');
        name.value = 'X';
        name.dispatchEvent(new CustomEvent('input'));
        await flush();
        el.shadowRoot.querySelector('.te-btn.primary').click();
        await flush();
        expect(saved).not.toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('.te-error').textContent).toBe(
            'A theme name is required.'
        );
    });
});
