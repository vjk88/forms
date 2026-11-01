import {
    lookOf,
    configFor,
    optionsFor,
    drawsSchemaOptions,
    effectiveRenderAs,
    toSchemaOptions
} from 'c/finalChoiceLook';

const OPTS = [
    { label: 'Power', value: 'Electrical', emoji: '⚡', description: 'Wiring' },
    { label: 'Other', value: 'Other' }
];

describe('finalChoiceLook', () => {
    // Every tile of IMPL_PLAN_APPEARANCE_PICKER 3a, written and read back.
    const ROWS = [
        ['default', false, 'Default', undefined],
        ['dropdown', false, 'Dropdown', undefined],
        ['radio', false, 'Radio_Buttons', undefined],
        ['radio', true, 'Checkbox_Group', undefined],
        ['chips', false, 'Radio_Buttons', 'chips'],
        ['chips', true, 'Checkbox_Group', 'chips'],
        ['cards', false, 'Radio_Buttons', 'cards'],
        ['cards', true, 'Checkbox_Group', 'cards']
    ];

    it.each(ROWS)(
        '%s (several: %s) writes %s + %s and reads back the same',
        (look, multi, renderAs, optionStyle) => {
            const patch = configFor(look, multi);
            expect(patch).toEqual({ renderAs, optionStyle });
            expect('optionStyle' in patch).toBe(true);
            expect(lookOf({ ...patch, options: OPTS })).toEqual({
                look,
                multi
            });
        }
    );

    it('a dropdown and Default always take one answer', () => {
        expect(configFor('dropdown', true).renderAs).toBe('Dropdown');
        expect(configFor('default', true).renderAs).toBe('Default');
    });

    it('a form stuck in bug 36 (Dropdown + chips) reads as the chips it draws', () => {
        expect(
            lookOf({
                renderAs: 'Dropdown',
                optionStyle: 'chips',
                options: OPTS
            })
        ).toEqual({ look: 'chips', multi: false });
    });

    it('chips without any options read from renderAs (nothing to draw as chips)', () => {
        expect(lookOf({ renderAs: 'Dropdown', optionStyle: 'chips' })).toEqual({
            look: 'dropdown',
            multi: false
        });
    });

    it('old Custom_MultiSelect reads as Checkboxes', () => {
        expect(
            lookOf({ renderAs: 'Custom_MultiSelect', options: OPTS })
        ).toEqual({ look: 'radio', multi: true });
    });

    it('honours the form-level default when the field has none', () => {
        expect(lookOf({ options: OPTS }, 'Radio_Buttons')).toEqual({
            look: 'radio',
            multi: false
        });
        expect(effectiveRenderAs({}, 'Dropdown')).toBe('Dropdown');
    });

    it("the field's own Default beats a form default", () => {
        expect(
            lookOf({ renderAs: 'Default', options: OPTS }, 'Radio_Buttons')
        ).toEqual({ look: 'default', multi: false });
    });

    it('non-choice displays read as default', () => {
        expect(lookOf({ renderAs: 'Toggle' }).look).toBe('default');
        expect(lookOf({ renderAs: 'Slider' }).look).toBe('default');
        expect(lookOf(undefined).look).toBe('default');
    });

    describe('optionsFor', () => {
        const SCHEMA = [
            { value: 'Electrical', label: 'Electrical' },
            { value: 'Other', label: '' }
        ];

        it("a Default picklist draws Salesforce's list, plain", () => {
            const cfg = {
                inputType: 'picklist',
                options: OPTS,
                schemaOptions: SCHEMA
            };
            expect(optionsFor(cfg, 'default')).toEqual([
                { label: 'Electrical', value: 'Electrical' },
                { label: 'Other', value: 'Other' }
            ]);
            expect(drawsSchemaOptions(cfg, 'default')).toBe(true);
        });

        it("every other look draws the author's own rows", () => {
            const cfg = {
                inputType: 'picklist',
                options: OPTS,
                schemaOptions: SCHEMA
            };
            for (const look of ['dropdown', 'radio', 'chips', 'cards']) {
                expect(optionsFor(cfg, look)).toBe(OPTS);
                expect(drawsSchemaOptions(cfg, look)).toBe(false);
            }
        });

        it('an older spec without schemaOptions keeps drawing its rows', () => {
            const cfg = { inputType: 'picklist', options: OPTS };
            expect(optionsFor(cfg, 'default')).toBe(OPTS);
            expect(drawsSchemaOptions(cfg, 'default')).toBe(false);
        });

        it('a text field on Default draws its rows (it has none to draw)', () => {
            expect(optionsFor({ inputType: 'text' }, 'default')).toEqual([]);
        });
    });

    it('toSchemaOptions keeps value + label only and fills a blank label', () => {
        expect(
            toSchemaOptions([
                { value: 'A', label: 'Alpha', extra: 1 },
                { value: 'B' },
                null,
                { label: 'no value' }
            ])
        ).toEqual([
            { value: 'A', label: 'Alpha' },
            { value: 'B', label: 'B' }
        ]);
    });
});
