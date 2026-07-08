import { createElement } from 'lwc';
import FinalFormStudio from 'c/finalFormStudio';
import { CurrentPageReference } from 'lightning/navigation';
import loadStudio from '@salesforce/apex/FinalStudioController.loadStudio';
import saveDraft from '@salesforce/apex/FinalStudioController.saveDraft';

// capture NavigationMixin.Navigate calls (lwc-recipes pattern)
const NAVIGATE = [];
jest.mock(
    'lightning/navigation',
    () => {
        const {
            createTestWireAdapter
        } = require('@salesforce/wire-service-jest-util');
        const Navigate = Symbol('Navigate');
        const NavigationMixin = (Base) =>
            class extends Base {
                [Navigate](pageRef) {
                    NAVIGATE.push(pageRef);
                }
            };
        NavigationMixin.Navigate = Navigate;
        return {
            CurrentPageReference: createTestWireAdapter(jest.fn()),
            NavigationMixin
        };
    },
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/FinalStudioController.loadStudio',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.saveDraft',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.discardDraft',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.publishSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'T' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: { source: 'builtin', name: 'editorialIvory', overrides: {} },
    pages: [],
    submit: { label: 'Submit' }
};

function mount() {
    const el = createElement('c-final-form-studio', { is: FinalFormStudio });
    document.body.appendChild(el);
    return el;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('c-final-form-studio', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        NAVIGATE.length = 0;
        jest.clearAllMocks();
        jest.useRealTimers(); // a failed fake-timer test must not starve the next
    });

    it('URL contract: no c__formId → redirect to the Forms tab', async () => {
        mount();
        CurrentPageReference.emit({ state: {} });
        await flush();
        expect(NAVIGATE).toHaveLength(1);
        expect(NAVIGATE[0].attributes.apiName).toBe('Final_Forms');
        expect(loadStudio).not.toHaveBeenCalled();
    });

    it('loads the draft, shows the chip, renders panel + live preview', async () => {
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: 'a0V1',
            versionNumber: 2,
            activeVersionNumber: 1
        });
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await flush();
        await flush();
        expect(loadStudio).toHaveBeenCalledWith({ formId: 'a0F1' });
        expect(el.shadowRoot.querySelector('.st-chip').textContent).toBe(
            'v2 · Draft'
        );
        expect(
            el.shadowRoot.querySelector('c-final-design-panel')
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('c-final-form-viewer')
        ).not.toBeNull();
    });

    it('specchange autosaves ONCE after the debounce window', async () => {
        jest.useFakeTimers();
        loadStudio.mockResolvedValue({
            name: 'Contact us',
            specJson: JSON.stringify(SPEC),
            draftVersionId: null,
            versionNumber: 1,
            activeVersionNumber: 1
        });
        saveDraft.mockResolvedValue('a0V9');
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'a0F1' } });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const panel = el.shadowRoot.querySelector('c-final-design-panel');
        const edited = JSON.parse(JSON.stringify(SPEC));
        edited.submit.label = 'Send';
        panel.dispatchEvent(
            new CustomEvent('specchange', { detail: { spec: edited } })
        );
        panel.dispatchEvent(
            new CustomEvent('specchange', { detail: { spec: edited } })
        );
        await Promise.resolve(); // LWC re-render is microtask-based
        expect(el.shadowRoot.querySelector('.st-saved').textContent).toBe(
            'Unsaved changes'
        );
        jest.advanceTimersByTime(1000);
        expect(saveDraft).toHaveBeenCalledTimes(1);
        expect(
            JSON.parse(saveDraft.mock.calls[0][0].specJson).submit.label
        ).toBe('Send');
        jest.useRealTimers();
    });

    it('bad id → friendly not-found with a way back, never a spinner', async () => {
        loadStudio.mockRejectedValue(new Error('nope'));
        const el = mount();
        CurrentPageReference.emit({ state: { c__formId: 'BAD' } });
        await flush();
        await flush();
        expect(
            el.shadowRoot.querySelector('.st-notfound h2').textContent
        ).toContain("isn't available");
        expect(el.shadowRoot.querySelector('lightning-spinner')).toBeNull();
    });
});
