import { ruleChoicesFor } from 'c/finalChoiceLook';

const bound = (config) => ({
    type: 'field',
    binding: { object: 'Contact', field: 'LeadSource' },
    config: { inputType: 'picklist', ...config }
});
const LIVE = [
    { value: 'Web', label: 'Website' },
    { value: 'Phone', label: 'Phone call' }
];

describe('ruleChoicesFor', () => {
    it('a bound picklist on Default reads Salesforce LIVE, not its saved copy', () => {
        const el = bound({
            renderAs: 'Default',
            schemaOptions: [{ value: 'Old', label: 'Old' }]
        });
        expect(ruleChoicesFor(el, LIVE)).toEqual({
            options: [
                { value: 'Web', label: 'Website' },
                { value: 'Phone', label: 'Phone call' }
            ],
            live: true,
            multi: false
        });
    });

    it('falls back to the saved copy, marked not live, until Salesforce answers', () => {
        const el = bound({
            renderAs: 'Default',
            schemaOptions: [{ value: 'Old', label: 'Old label' }]
        });
        expect(ruleChoicesFor(el, undefined)).toEqual({
            options: [{ value: 'Old', label: 'Old label' }],
            live: false,
            multi: false
        });
    });

    it('a picklist drawn as a dropdown offers the author rows (what people can pick)', () => {
        const el = bound({
            renderAs: 'Dropdown',
            options: [
                { value: 'A', label: 'Alpha' },
                { value: 'B', label: '' },
                { value: '', label: 'blank row' }
            ]
        });
        expect(ruleChoicesFor(el, LIVE)).toEqual({
            options: [
                { value: 'A', label: 'Alpha' },
                { value: 'B', label: 'B' }
            ],
            live: true,
            multi: false
        });
    });

    it('Checkbox group is multi', () => {
        const el = {
            type: 'field',
            binding: null,
            config: {
                inputType: 'picklist',
                renderAs: 'Checkbox_Group',
                options: [{ value: 'x', label: 'X' }]
            }
        };
        expect(ruleChoicesFor(el).multi).toBe(true);
    });

    it('an image choice carries its own options and its multiple flag', () => {
        const el = {
            type: 'imageChoice',
            config: { multiple: true, options: [{ value: 'a', label: 'A' }] }
        };
        expect(ruleChoicesFor(el)).toEqual({
            options: [{ value: 'a', label: 'A' }],
            live: true,
            multi: true
        });
    });

    it('has no list for text, numbers, or a picklist with nothing to pick', () => {
        expect(
            ruleChoicesFor({ type: 'field', config: { inputType: 'text' } })
        ).toBeNull();
        expect(ruleChoicesFor(bound({ renderAs: 'Default' }), [])).toBeNull();
        expect(
            ruleChoicesFor({ type: 'imageChoice', config: { options: [] } })
        ).toBeNull();
        expect(ruleChoicesFor(null)).toBeNull();
        expect(ruleChoicesFor({ type: 'nps', config: {} })).toBeNull();
    });
});
