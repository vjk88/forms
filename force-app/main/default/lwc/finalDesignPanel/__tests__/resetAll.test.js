import { createElement } from 'lwc';
import FinalDesignPanel from 'c/finalDesignPanel';
import { buildSampleSpec } from 'c/finalSampleSpec';

// Reset all asks inline (DESIGN_SYSTEM 5.17): lightning/confirm never settles
// after Cancel in the VF-hosted Studio, so the question lives in the pane.

jest.mock(
    '@salesforce/apex/FinalFontController.listFonts',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.listCustomThemes',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({ default: jest.fn(() => Promise.resolve('{}')) }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount() {
    const spec = buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' });
    spec.theme = {
        ...(spec.theme || {}),
        overrides: { palette: { accent: '#7c2d9c' } }
    };
    const el = createElement('c-final-design-panel', { is: FinalDesignPanel });
    el.spec = spec;
    document.body.appendChild(el);
    return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('Reset all', () => {
    it('asks inline first, says how many, and lands on Cancel', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await flush();
        const focus = jest.spyOn(HTMLElement.prototype, 'focus');
        q(el, '.changes-reset').click();
        await flush();

        const ask = q(el, '.reset-ask');
        expect(ask.getAttribute('role')).toBe('alertdialog');
        expect(ask.textContent).toContain('Reset 1 change to the theme?');
        expect(ask.textContent).toContain('Undo brings them back');
        expect(q(el, '.changes-reset').getAttribute('aria-expanded')).toBe(
            'true'
        );
        expect(focus.mock.contexts).toContain(q(el, '.reset-ask-cancel'));
        expect(handler).not.toHaveBeenCalled();
        focus.mockRestore();
    });

    it('Cancel and Escape change nothing', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await flush();
        q(el, '.changes-reset').click();
        await flush();
        q(el, '.reset-ask-cancel').click();
        await flush();
        expect(q(el, '.reset-ask')).toBeNull();

        q(el, '.changes-reset').click();
        await flush();
        q(el, '.reset-ask').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape' })
        );
        await flush();
        expect(q(el, '.reset-ask')).toBeNull();
        expect(handler).not.toHaveBeenCalled();
        expect(el.spec.theme.overrides.palette.accent).toBe('#7c2d9c');
    });

    it('Reset all clears every customization in one change', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await flush();
        q(el, '.changes-reset').click();
        await flush();
        q(el, '.reset-ask-confirm').click();
        await flush();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.spec.theme.overrides).toEqual(
            {}
        );
        expect(q(el, '.reset-ask')).toBeNull();
    });
});
