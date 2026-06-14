import {
    FORM_TEMPLATES,
    TEMPLATE_CATEGORIES,
    toEngineParts,
    toBodyJson,
    templateById
} from 'c/formTemplates';
import { materialize, CORE_ARCHETYPES } from 'c/layoutModel';

/**
 * Catalog-integrity guard. The gallery grows by appending to FORM_TEMPLATES,
 * so this suite is the safety net: it fails loudly if a new template breaks a
 * rule (bad archetype, dead category, duplicate id, unrenderable spec). Run
 * `npm run test:unit` after adding a template — green means it will work in the
 * gallery and create a valid form.
 */
const CATEGORY_VALUES = new Set(TEMPLATE_CATEGORIES.map((c) => c.value));
const ARCHETYPES = new Set(CORE_ARCHETYPES);
const ELEMENT_TYPES = new Set([
    'Field', 'Rich_Text', 'Static_Text', 'Divider', 'Image',
    'Callout', 'Spacer', 'Consent', 'File_Upload'
]);

describe('FORM_TEMPLATES catalog integrity', () => {
    it('has at least one template', () => {
        expect(FORM_TEMPLATES.length).toBeGreaterThan(0);
    });

    it('every template id is unique and resolvable', () => {
        const ids = FORM_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        ids.forEach((id) => expect(templateById(id)).not.toBeNull());
    });

    it.each(FORM_TEMPLATES.map((t) => [t.id, t]))(
        '%s — required fields, known archetype + category',
        (id, tpl) => {
            expect(tpl.name).toBeTruthy();
            expect(tpl.description).toBeTruthy();
            expect(tpl.formType === 'Form' || tpl.formType === 'Survey').toBe(true);
            expect(ARCHETYPES.has(tpl.archetype)).toBe(true);
            expect(CATEGORY_VALUES.has(tpl.category)).toBe(true);
            // Appearance now rides themeId/skinId (resolved via c/formThemes),
            // not an inline theme literal.
            expect(tpl.themeId).toBeTruthy();
            expect(tpl.skinId).toBeTruthy();
            expect(Array.isArray(tpl.sections)).toBe(true);
            // A Form needs a bound object (Blank is the deliberate exception).
            const needsObject = tpl.formType === 'Form' && tpl.id !== 'blank';
            expect(!needsObject || !!tpl.suggestedObject).toBe(true);
        }
    );

    it.each(FORM_TEMPLATES.map((t) => [t.id, t]))(
        '%s — element types are all known kinds with field api names',
        (id, tpl) => {
            const allElements = (tpl.sections || []).flatMap(
                (sec) => sec.elements || []
            );
            const typesOk = allElements.every((el) =>
                ELEMENT_TYPES.has(el.type || 'Field')
            );
            const fieldsHaveApi = allElements.every(
                (el) => (el.type || 'Field') !== 'Field' || !!el.fieldApiName
            );
            expect(typesOk).toBe(true);
            expect(fieldsHaveApi).toBe(true);
        }
    );

    it.each(FORM_TEMPLATES.map((t) => [t.id, t]))(
        '%s — renders a valid engine spec (preview will not blank out)',
        (id, tpl) => {
            const parts = toEngineParts(tpl, null);
            expect(parts.pages.length).toBeGreaterThan(0);
            // materialize throws on an invalid archetype/spec — must not.
            const spec = materialize(tpl.archetype, parts.pages, parts.sections);
            expect(spec.archetype).toBe(tpl.archetype);
        }
    );

    it.each(FORM_TEMPLATES.map((t) => [t.id, t]))(
        '%s — produces a well-formed Layout_Config body',
        (id, tpl) => {
            const body = toBodyJson(tpl, tpl.suggestedObject || 'Contact', null);
            expect(body.schemaVersion).toBe(1);
            expect(body.layoutMode).toBe(tpl.layoutMode);
            expect(body.header).toBeTruthy();
            expect(body.formSettings).toBeTruthy();
            expect(Array.isArray(body.pages)).toBe(true);
            expect(body.pages.length).toBeGreaterThan(0);
            // Every page/section/element carries a stable id (publish slugs).
            body.pages.forEach((pg) => {
                expect(pg.id).toBeTruthy();
                (pg.sections || []).forEach((sec) => {
                    expect(sec.id).toBeTruthy();
                    (sec.elements || []).forEach((el) =>
                        expect(el.id).toBeTruthy()
                    );
                });
            });
        }
    );
});

describe('object remap helper (used only by the Blank picker / future remap)', () => {
    it('drops fields the chosen object lacks when validApis is provided', () => {
        const tpl = FORM_TEMPLATES.find((t) => t.id === 'contact-intake');
        const onlyLastName = new Set(['lastname']);
        const parts = toEngineParts(tpl, onlyLastName);
        const fieldEls = parts.elements.filter((e) => e.type === 'Field');
        // Only LastName survives; display elements (Consent) still render.
        expect(fieldEls.length).toBe(1);
        expect(
            parts.elements.some((e) => e.type === 'Consent')
        ).toBe(true);
    });

    it('keeps all fields when validApis is null (pre-bound templates)', () => {
        const tpl = FORM_TEMPLATES.find((t) => t.id === 'contact-intake');
        const parts = toEngineParts(tpl, null);
        const fieldEls = parts.elements.filter((e) => e.type === 'Field');
        expect(fieldEls.length).toBeGreaterThan(1);
    });
});
