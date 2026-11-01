import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/** Appearance picker (IMPL_PLAN_APPEARANCE_PICKER, DEFERRED 36): Default to
 *  schema and Dropdown used to draw the same thing on a picklist. Default now
 *  shows Salesforce's own labels; Dropdown shows the author's. */

const mount = (element) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
};

const OWN = [
    { label: 'Power', value: 'Electrical', emoji: '⚡' },
    { label: 'Something else', value: 'Other' }
];
const SCHEMA = [
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Other', label: 'Other' }
];

const picklist = (config, extra = {}) => ({
    id: 'el_type',
    type: 'field',
    label: 'Case Type',
    binding: { object: 'Case', field: 'Type' },
    config: {
        inputType: 'picklist',
        options: OWN,
        schemaOptions: SCHEMA,
        ...config
    },
    ...extra
});

const comboLabels = (el) =>
    el.shadowRoot
        .querySelector('lightning-combobox')
        .options.map((o) => o.label);

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('choice look: Default to schema vs Dropdown', () => {
    it("Default shows Salesforce's labels: no emoji, no renamed labels", () => {
        const el = mount(picklist({ renderAs: 'Default' }));
        expect(comboLabels(el)).toEqual(['Electrical', 'Other']);
    });

    it("Dropdown on the same field shows the author's labels and emoji", () => {
        const el = mount(picklist({ renderAs: 'Dropdown' }));
        expect(comboLabels(el)).toEqual(['⚡ Power', 'Something else']);
    });

    it('a picklist saved before schemaOptions keeps drawing its rows', () => {
        const el = mount(
            picklist({ renderAs: 'Default', schemaOptions: undefined })
        );
        expect(comboLabels(el)).toEqual(['⚡ Power', 'Something else']);
    });

    it('a form-level default reaches a field with no look of its own', () => {
        const el = mount(
            picklist(
                { renderAs: undefined },
                { renderDefault: 'Radio_Buttons' }
            )
        );
        const radio = el.shadowRoot.querySelector('lightning-radio-group');
        expect(radio).not.toBeNull();
        expect(radio.options.map((o) => o.label)).toEqual([
            '⚡ Power',
            'Something else'
        ]);
    });

    it('chips draw the author rows whatever renderAs says (no change for stuck forms)', () => {
        const el = mount(
            picklist({ renderAs: 'Dropdown', optionStyle: 'chips' })
        );
        expect(el.shadowRoot.querySelector('lightning-combobox')).toBeNull();
        const titles = [...el.shadowRoot.querySelectorAll('.choice-title')].map(
            (n) => n.textContent
        );
        expect(titles).toEqual(['Power', 'Something else']);
    });

    it('a text field on Default stays a text box', () => {
        const el = mount({
            id: 'el_t',
            type: 'field',
            label: 'Topic',
            config: { inputType: 'text', renderAs: 'Default', options: OWN }
        });
        expect(el.shadowRoot.querySelector('lightning-combobox')).toBeNull();
        expect(el.shadowRoot.querySelector('lightning-input')).not.toBeNull();
    });
});
