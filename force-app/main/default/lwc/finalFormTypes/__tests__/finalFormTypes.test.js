import {
    FORM,
    SURVEY,
    FREEFORM,
    isKnown,
    specValues,
    fromPicklist,
    fromSpec,
    toPicklist,
    label,
    needsObject,
    usesAnswerStore,
    usesQuestions,
    usesAnalytics,
    usesContextRecord,
    usesAutofill,
    layoutLocked
} from 'c/finalFormTypes';

describe('c/finalFormTypes', () => {
    it('translates picklist values to spec values, whatever the casing', () => {
        expect(fromPicklist('Freeform')).toBe(FREEFORM);
        expect(fromPicklist('survey')).toBe(SURVEY);
        expect(toPicklist(FORM)).toBe('Form');
        expect(label(FREEFORM)).toBe('Freeform');
    });

    it('returns undefined for a type it does not know, never form', () => {
        expect(fromPicklist('Questionnaire')).toBeUndefined();
        expect(fromPicklist('')).toBeUndefined();
        expect(fromPicklist(undefined)).toBeUndefined();
        expect(fromSpec({ form: { type: 'quiz' } })).toBeUndefined();
        expect(fromSpec({})).toBeUndefined();
        expect(fromSpec(undefined)).toBeUndefined();
        expect(isKnown('quiz')).toBe(false);
    });

    it('reads the type out of a spec', () => {
        expect(fromSpec({ form: { type: 'freeform' } })).toBe(FREEFORM);
    });

    it('knows exactly three types', () => {
        expect(specValues().sort()).toEqual(['form', 'freeform', 'survey']);
    });

    describe('capabilities', () => {
        it('form is object-bound and field-driven', () => {
            expect(needsObject(FORM)).toBe(true);
            expect(usesAnswerStore(FORM)).toBe(false);
            expect(usesQuestions(FORM)).toBe(false);
        });

        it('survey stores answers, has analytics and a locked layout', () => {
            expect(usesAnswerStore(SURVEY)).toBe(true);
            expect(usesAnalytics(SURVEY)).toBe(true);
            expect(usesContextRecord(SURVEY)).toBe(true);
            expect(layoutLocked(SURVEY)).toBe(true);
        });

        it('freeform stores answers WITHOUT survey analytics or a context record', () => {
            expect(needsObject(FREEFORM)).toBe(false);
            expect(usesAnswerStore(FREEFORM)).toBe(true);
            expect(usesQuestions(FREEFORM)).toBe(true);
            expect(usesAnalytics(FREEFORM)).toBe(false);
            expect(usesContextRecord(FREEFORM)).toBe(false);
            expect(layoutLocked(FREEFORM)).toBe(false);
            // Autofill belongs to the type; F1 only hides the tab (D7).
            expect(usesAutofill(FREEFORM)).toBe(true);
        });

        it('offers nothing for an unknown type', () => {
            expect(usesQuestions('quiz')).toBe(false);
            expect(needsObject(undefined)).toBe(false);
            expect(usesAnalytics(null)).toBe(false);
        });
    });
});
