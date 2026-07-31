import { createElement } from 'lwc';
import FinalCreationGallery from 'c/finalCreationGallery';
import createSurveyFromTemplate from '@salesforce/apex/FinalFormCreateController.createSurveyFromTemplate';

// Kind-first creation flow (owner 2026-07-31): ask Form-or-Survey FIRST;
// surveys are templates + themes only (no layout step) with an OPTIONAL
// object picked on the details screen.
jest.mock(
    '@salesforce/apex/FinalFormCreateController.getUpdatableObjects',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalFormCreateController.createForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalFormCreateController.createSurveyFromTemplate',
    () => ({
        default: jest.fn(() =>
            Promise.resolve({ formId: 'a01x', versionId: 'a02x' })
        )
    }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
    const el = createElement('c-final-creation-gallery', {
        is: FinalCreationGallery
    });
    document.body.appendChild(el);
    await flush();
    return el;
}

function byText(root, selector, text) {
    return [...root.querySelectorAll(selector)].find((n) =>
        n.textContent.includes(text)
    );
}

describe('kind-first creation flow', () => {
    afterEach(() => {
        jest.clearAllMocks();
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('opens on the Form-or-Survey chooser', async () => {
        const el = await mount();
        const cards = el.shadowRoot.querySelectorAll('.kind-card');
        expect(cards.length).toBe(2);
        expect(el.shadowRoot.querySelector('.card-grid')).toBeNull();
    });

    it('Form goes to the layout gallery; Survey goes to templates', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.kind-card', 'Form').click();
        await flush();
        expect(el.shadowRoot.querySelector('.card-grid')).not.toBeNull();

        const el2 = await mount();
        byText(el2.shadowRoot, '.kind-card', 'Survey').click();
        await flush();
        const tpls = el2.shadowRoot.querySelectorAll('.tpl-grid .tpl-card');
        expect(tpls.length).toBe(4);
        // no layout gallery anywhere on the survey path
        expect(el2.shadowRoot.querySelector('.card-grid')).toBeNull();
    });

    it('survey: template → theme → details → create carries theme + optional object', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.kind-card', 'Survey').click();
        await flush();
        el.shadowRoot.querySelector('.tpl-card[data-key="csat"]').click();
        await flush();
        // theme step renders the gallery pinned to the survey flow
        const themeGallery = el.shadowRoot.querySelector(
            'c-final-theme-gallery'
        );
        expect(themeGallery).not.toBeNull();
        expect(themeGallery.layout).toBe('oneAtATime');
        themeGallery.dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: 'editorialIvory' }
            })
        );
        await flush();
        // survey details: create enabled WITHOUT an object (it's optional)
        const create = byText(el.shadowRoot, 'button', 'Create survey');
        expect(create.disabled).toBe(false);
        create.click();
        await flush();
        expect(createSurveyFromTemplate).toHaveBeenCalledWith({
            templateKey: 'csat',
            surveyName: null,
            themeName: 'editorialIvory',
            objectApiName: null
        });
        // done screen speaks survey
        expect(
            byText(el.shadowRoot, '.done-title', 'Your survey is ready')
        ).toBeTruthy();
    });
});
