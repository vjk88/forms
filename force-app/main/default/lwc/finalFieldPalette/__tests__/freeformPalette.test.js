import { createElement } from 'lwc';
import FinalFieldPalette from 'c/finalFieldPalette';

// The palette per form type (FREEFORM_SPEC D4): a Form gets its object's
// fields, a Survey gets its 12 questions plus Address (owner ruling 2026-11-21), and a Freeform gets those
// plus eight general inputs and Address, grouped so 21 items don't read as one wall.
jest.mock(
    '@salesforce/apex/FinalStudioController.describeFields',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

function mount(props = {}) {
    const el = createElement('c-final-field-palette', {
        is: FinalFieldPalette
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

const labels = (el) =>
    [...el.shadowRoot.querySelectorAll('.fp-item .fp-label')].map((n) =>
        n.textContent.trim()
    );

const tabNames = (el) =>
    el.shadowRoot.querySelector('c-final-studio-rail').tabs.map((t) => t.label);

describe('field palette per form type', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('leaves the survey roster as it was, plus Address: 13, ungrouped', () => {
        const el = mount({ formType: 'survey' });
        expect(labels(el)).toEqual([
            'NPS',
            'Rating',
            'Opinion Scale',
            'Emoji Scale',
            'Likert',
            'Yes / No',
            'Ranking',
            'Matrix',
            'Image Choice',
            'Short Text',
            'Long Text',
            'Number',
            'Address'
        ]);
        expect(el.shadowRoot.querySelectorAll('.fp-group-label').length).toBe(
            0
        );
    });

    it('gives freeform the same widgets plus eight general inputs and Address, grouped', () => {
        const el = mount({ formType: 'freeform' });
        const found = labels(el);
        expect(found).toHaveLength(21);
        // the eight that Survey never offered
        [
            'Email',
            'Phone',
            'Date',
            'Link',
            'Dropdown',
            'Single choice',
            'Multiple choice',
            'Record lookup',
            'Address'
        ].forEach((l) => expect(found).toContain(l));
        // and the survey widgets are still there
        ['NPS', 'Matrix', 'Likert'].forEach((l) => expect(found).toContain(l));

        const groups = [
            ...el.shadowRoot.querySelectorAll('.fp-group-label')
        ].map((n) => n.textContent.trim());
        expect(groups).toEqual(['Questions', 'Ratings & scales']);
    });

    it("offers Address in Freeform's Questions group, with its hint", () => {
        const el = mount({ formType: 'freeform' });
        const item = [...el.shadowRoot.querySelectorAll('.fp-item')].find((b) =>
            b.textContent.includes('Address')
        );
        expect(item.dataset.type).toBe('questionAddress');
        expect(item.getAttribute('title')).toBe(
            'A postal address, with optional address search'
        );
        const added = jest.fn();
        el.addEventListener('addquestion', added);
        item.click();
        expect(added.mock.calls[0][0].detail).toEqual({
            questionType: 'questionAddress'
        });
    });

    it('offers no question roster to a Form; it gets object fields', () => {
        const el = mount({ formType: 'form', objectApi: 'Contact' });
        expect(labels(el)).toEqual([]);
    });

    it('offers Autofill on every type, and Mapping on Freeform', () => {
        expect(tabNames(mount({ formType: 'survey' }))).toContain('Autofill');
        expect(tabNames(mount({ formType: 'form' }))).toContain('Autofill');
        // Freeform's rules edit in the Studio's dialog (IMPL_PLAN_F2_AUTOFILL)
        const free = tabNames(mount({ formType: 'freeform' }));
        expect(free).toContain('Autofill');
        expect(free).toContain('Mapping');
    });

    it('emits the question type the studio mints from', () => {
        const el = mount({ formType: 'freeform' });
        const added = jest.fn();
        el.addEventListener('addquestion', added);
        [...el.shadowRoot.querySelectorAll('.fp-item')]
            .find((b) => b.textContent.includes('Multiple choice'))
            .click();
        expect(added.mock.calls[0][0].detail).toEqual({
            questionType: 'questionMultiChoice'
        });
    });
});
