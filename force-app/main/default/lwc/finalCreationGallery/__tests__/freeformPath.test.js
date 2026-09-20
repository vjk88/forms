import { createElement } from 'lwc';
import FinalCreationGallery from 'c/finalCreationGallery';
import createFreeformFromTemplate from '@salesforce/apex/FinalFormCreateController.createFreeformFromTemplate';

// The Freeform creation path (FREEFORM_SPEC D5): template -> layout -> theme
// -> name, and NO object step anywhere. The object step is the thing that
// must never appear: a Freeform has no target object, and asking for one
// would be the first lie the product tells.
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
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalFormCreateController.createFreeformFromTemplate',
    () => ({
        default: jest.fn(() =>
            Promise.resolve({ formId: 'a05ff', versionId: 'a04ff' })
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

function typeCard(el, name) {
    return [...el.shadowRoot.querySelectorAll('.type-card')].find(
        (c) => c.querySelector('.type-name').textContent === name
    );
}

/** template -> layout -> theme, leaving the details screen on screen. */
async function walkToDetails(el) {
    typeCard(el, 'Freeform').click();
    await flush();
    el.shadowRoot.querySelector('.tpl-grid .tpl-card').click();
    await flush();
    el.shadowRoot
        .querySelector('c-final-layout-card')
        .dispatchEvent(
            new CustomEvent('select', { detail: { layout: 'stepper' } })
        );
    await flush();
    el.shadowRoot
        .querySelector('c-final-theme-gallery')
        .dispatchEvent(
            new CustomEvent('themeselect', { detail: { themeKey: 'nordic' } })
        );
    await flush();
}

describe('freeform creation path', () => {
    afterEach(() => {
        jest.clearAllMocks();
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('offers a Freeform card that opens its own template shelf', async () => {
        const el = await mount();
        typeCard(el, 'Freeform').click();
        await flush();
        const cards = el.shadowRoot.querySelectorAll('.tpl-grid .tpl-card');
        expect(cards.length).toBe(1);
        expect(cards[0].textContent).toContain('Blank freeform');
    });

    it('goes template -> layout -> theme, unlike a survey', async () => {
        const el = await mount();
        typeCard(el, 'Freeform').click();
        await flush();
        el.shadowRoot.querySelector('.tpl-grid .tpl-card').click();
        await flush();
        // a survey would be on the theme step by now; a freeform picks a layout
        expect(
            el.shadowRoot.querySelector('c-final-layout-card')
        ).not.toBeNull();
    });

    it('never asks for a Salesforce object', async () => {
        const el = await mount();
        await walkToDetails(el);
        // LWC rewrites id attributes at runtime, so select by class.
        expect(el.shadowRoot.querySelector('.obj-picker')).toBeNull();
        const inputs = el.shadowRoot.querySelectorAll('.d-config .d-input');
        expect(inputs.length).toBe(1); // the name, and nothing else
    });

    it('creates with the chosen template, layout, theme and name', async () => {
        const el = await mount();
        await walkToDetails(el);
        const name = el.shadowRoot.querySelector('.d-config .d-input');
        name.value = 'Partner application';
        name.dispatchEvent(new CustomEvent('input'));
        await flush();

        const created = jest.fn();
        el.addEventListener('formcreated', created);
        [...el.shadowRoot.querySelectorAll('.cg-create')]
            .find((b) => b.textContent.includes('Create freeform'))
            .click();
        await flush();

        expect(createFreeformFromTemplate).toHaveBeenCalledWith({
            templateKey: 'blank',
            formName: 'Partner application',
            themeName: 'nordic',
            layoutType: 'stepper',
            paneFlow: null
        });
        expect(created).toHaveBeenCalled();
        expect(created.mock.calls[0][0].detail).toEqual({
            formId: 'a05ff',
            versionId: 'a04ff'
        });
    });

    it('creates without a name, letting the server default it', async () => {
        const el = await mount();
        await walkToDetails(el);
        [...el.shadowRoot.querySelectorAll('.cg-create')]
            .find((b) => b.textContent.includes('Create freeform'))
            .click();
        await flush();
        expect(createFreeformFromTemplate).toHaveBeenCalledWith(
            expect.objectContaining({ formName: null })
        );
    });
});
