import { createElement } from 'lwc';
import FinalCreationGallery from 'c/finalCreationGallery';
import createSurveyFromTemplate from '@salesforce/apex/FinalFormCreateController.createSurveyFromTemplate';

// type-first creation flow (owner 2026-07-31): ask form type FIRST;
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

describe('type-first creation flow', () => {
    afterEach(() => {
        jest.clearAllMocks();
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('opens on the type chooser, now three types', async () => {
        const el = await mount();
        const cards = el.shadowRoot.querySelectorAll('.type-card');
        // Freeform joined Form and Survey (FREEFORM_SPEC D5).
        expect(cards.length).toBe(3);
        expect(
            [...cards].map((c) => c.querySelector('.type-name').textContent)
        ).toEqual(['Form', 'Survey', 'Freeform']);
        expect(el.shadowRoot.querySelector('.card-grid')).toBeNull();
    });

    it('Form opens the layout + theme page on Scroll, with no templates; Survey goes to templates', async () => {
        const el = await mount();
        [...el.shadowRoot.querySelectorAll('.type-card')]
            .find((c) => c.querySelector('.type-name').textContent === 'Form')
            .click();
        await flush();
        const tiles = el.shadowRoot.querySelector('c-final-picture-choice');
        expect(tiles.value).toBe('scroll');
        expect(tiles.options.map((o) => o.value)).toEqual([
            'scroll',
            'stepper',
            'splitHero',
            'splitHero:oneAtATime',
            'rail',
            'oneAtATime',
            'tabs',
            'accordion'
        ]);
        tiles.options.forEach((o) => expect(o.drawing).toBeTruthy());
        const gallery = el.shadowRoot.querySelector('c-final-theme-gallery');
        expect(gallery.layout).toBe('scroll');
        expect(gallery.hideLayoutSwitch).toBe(true);
        // Forms have no templates (owner 2026-11-14), and say no survey note
        expect(el.shadowRoot.textContent).not.toMatch(/Form templates/);
        expect(el.shadowRoot.querySelector('.look-note')).toBeNull();

        const el2 = await mount();
        byText(el2.shadowRoot, '.type-card', 'Survey').click();
        await flush();
        const tpls = el2.shadowRoot.querySelectorAll('.tpl-grid .tpl-card');
        expect(tpls.length).toBe(4);
    });

    it('a layout tile re-previews every theme in that layout', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.type-card', 'Form').click();
        await flush();
        el.shadowRoot.querySelector('c-final-picture-choice').dispatchEvent(
            new CustomEvent('change', {
                detail: { value: 'splitHero:oneAtATime' }
            })
        );
        await flush();
        const gallery = el.shadowRoot.querySelector('c-final-theme-gallery');
        expect(gallery.layout).toBe('splitHero');
        expect(gallery.paneFlow).toBe('oneAtATime');
        expect(
            el.shadowRoot.querySelector('c-final-picture-choice').value
        ).toBe('splitHero:oneAtATime');
    });

    it('survey: picks another layout, Details names it, Change comes back', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.type-card', 'Survey').click();
        await flush();
        el.shadowRoot.querySelector('.tpl-card[data-key="nps"]').click();
        await flush();
        el.shadowRoot
            .querySelector('c-final-picture-choice')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: 'stepper' } })
            );
        await flush();
        const gallery = el.shadowRoot.querySelector('c-final-theme-gallery');
        expect(gallery.layout).toBe('stepper');
        // off the default, the previews draw a new form's start
        expect(gallery.formLayout).toBeNull();
        gallery.dispatchEvent(
            new CustomEvent('themeselect', { detail: { themeKey: 'nordic' } })
        );
        await flush();
        const chip = el.shadowRoot.querySelector('.d-layout-chip');
        expect(chip.textContent).toContain('Stepper');
        el.shadowRoot.querySelector('.cg-create').click();
        await flush();
        expect(createSurveyFromTemplate).toHaveBeenCalledWith(
            expect.objectContaining({
                templateKey: 'nps',
                layoutType: 'stepper',
                paneFlow: null
            })
        );
    });

    it('Change on the Layout chip returns to the look page, keeping the pick', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.type-card', 'Form').click();
        await flush();
        el.shadowRoot
            .querySelector('c-final-picture-choice')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: 'tabs' } })
            );
        await flush();
        el.shadowRoot.querySelector('c-final-theme-gallery').dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: 'nordic' }
            })
        );
        await flush();
        expect(
            el.shadowRoot.querySelector('.d-layout-chip').textContent
        ).toContain('Tabbed');
        // the old Layout dropdown is gone
        expect(el.shadowRoot.querySelector('lightning-combobox')).toBeNull();
        el.shadowRoot.querySelector('.d-layout-chip').click();
        await flush();
        expect(
            el.shadowRoot.querySelector('c-final-picture-choice').value
        ).toBe('tabs');
    });

    it('after Change, Back returns to Details with both picks kept', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.type-card', 'Form').click();
        await flush();
        el.shadowRoot.querySelector('c-final-theme-gallery').dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: 'nordic' }
            })
        );
        await flush();
        const layoutChip = el.shadowRoot.querySelector('.d-layout-chip');
        // the chip names what it changes for screen readers
        expect(layoutChip.getAttribute('aria-label')).toBe(
            'Layout: Scroll. Change'
        );
        layoutChip.click();
        await flush();
        const back = el.shadowRoot.querySelector('.d-back');
        expect(back.label).toBe('Back to details');
        el.shadowRoot
            .querySelector('c-final-picture-choice')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: 'rail' } })
            );
        await flush();
        back.click();
        await flush();
        expect(
            el.shadowRoot.querySelector('.d-layout-chip').textContent
        ).toContain('Side Nav');
        expect(
            [...el.shadowRoot.querySelectorAll('.d-theme-chip')].map((c) =>
                c.getAttribute('aria-label')
            )
        ).toContain('Theme: Nordic Minimalist. Change');
    });

    it('choosing a type again resets the layout to that type default', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.type-card', 'Survey').click();
        await flush();
        el.shadowRoot.querySelector('.tpl-card[data-key="csat"]').click();
        await flush();
        expect(
            el.shadowRoot.querySelector('c-final-picture-choice').value
        ).toBe('oneAtATime');
        // back to templates, back to types, then Form
        el.shadowRoot.querySelector('.d-back').click();
        await flush();
        el.shadowRoot.querySelector('.d-back').click();
        await flush();
        byText(el.shadowRoot, '.type-card', 'Form').click();
        await flush();
        expect(
            el.shadowRoot.querySelector('c-final-picture-choice').value
        ).toBe('scroll');
    });

    it('survey: template → look (One at a time, said so) → details → create carries layout, theme + optional object', async () => {
        const el = await mount();
        byText(el.shadowRoot, '.type-card', 'Survey').click();
        await flush();
        el.shadowRoot.querySelector('.tpl-card[data-key="csat"]').click();
        await flush();
        // the look page opens on One at a time and says why
        const themeGallery = el.shadowRoot.querySelector(
            'c-final-theme-gallery'
        );
        expect(themeGallery).not.toBeNull();
        expect(themeGallery.layout).toBe('oneAtATime');
        expect(themeGallery.formLayout).toEqual({
            type: 'oneAtATime',
            options: {}
        });
        expect(el.shadowRoot.querySelector('.look-note').textContent).toContain(
            'Surveys start as One at a time'
        );
        themeGallery.dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: 'editorialIvory' }
            })
        );
        await flush();
        // survey details: create enabled WITHOUT an object (it's optional)
        const create = el.shadowRoot.querySelector('.cg-create');
        expect(create.label).toBe('Create survey');
        expect(create.disabled).toBe(false);
        create.click();
        await flush();
        expect(createSurveyFromTemplate).toHaveBeenCalledWith({
            templateKey: 'csat',
            surveyName: null,
            themeName: 'editorialIvory',
            objectApiName: null,
            layoutType: 'oneAtATime',
            paneFlow: null
        });
        // done screen speaks survey
        expect(
            byText(el.shadowRoot, '.done-title', 'Your survey is ready')
        ).toBeTruthy();
    });
});
