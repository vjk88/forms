/**
 * The one place the client knows how many form types exist and what each can do.
 *
 * The Apex half is `FinalFormTypes.cls`; the two tables must change together.
 * Callers ask the capability they care about ("does this type use questions?")
 * rather than "is it a survey?", because Freeform wants SOME survey behavior
 * and not the rest — and because `x === 'survey' ? a : b` silently treats a
 * third type as a Form.
 *
 * Keyed by the SPEC value (`spec.form.type`), never the picklist value.
 * Design: FREEFORM_SPEC.md §4.1.
 */

export const FORM = 'form';
export const SURVEY = 'survey';
export const FREEFORM = 'freeform';

const DEFINITIONS = {
    [FORM]: {
        specValue: FORM,
        picklistValue: 'Form',
        label: 'Form',
        needsObject: true,
        usesAnswerStore: false,
        usesQuestions: false,
        usesAnalytics: false,
        usesContextRecord: false,
        usesAutofill: true,
        layoutLocked: false
    },
    [SURVEY]: {
        specValue: SURVEY,
        picklistValue: 'Survey',
        label: 'Survey',
        needsObject: false,
        usesAnswerStore: true,
        usesQuestions: true,
        usesAnalytics: true,
        usesContextRecord: true,
        usesAutofill: true,
        layoutLocked: true
    },
    [FREEFORM]: {
        specValue: FREEFORM,
        picklistValue: 'Freeform',
        label: 'Freeform',
        needsObject: false,
        usesAnswerStore: true,
        usesQuestions: true,
        // No Topics, no scores — Freeform does not inherit survey analytics.
        usesAnalytics: false,
        usesContextRecord: false,
        // TRUE because Autofill is a property of the TYPE; the Studio hides
        // the tab until F2 gives rules their own source object (D7).
        usesAutofill: true,
        layoutLocked: false
    }
};

/**
 * A capability question about an UNKNOWN type has no honest answer, and the
 * client must never render a half-configured builder on a guess. Every getter
 * therefore returns `false` for an unknown type (nothing is offered) while
 * `isKnown` is the explicit check a caller uses to show an error instead.
 * Apex, where an unknown type means corrupt data mid-write, throws instead.
 */
const definition = (specValue) => DEFINITIONS[specValue] || null;

export const isKnown = (specValue) => Boolean(definition(specValue));

export const specValues = () => Object.keys(DEFINITIONS);

/** `Form__c.Form_Type__c` → spec value; undefined when unrecognized. */
export function fromPicklist(picklistValue) {
    const key = String(picklistValue || '')
        .trim()
        .toLowerCase();
    const hit = Object.values(DEFINITIONS).find(
        (d) => d.picklistValue.toLowerCase() === key
    );
    return hit ? hit.specValue : undefined;
}

/** The spec value carried by a spec object, or undefined. */
export function fromSpec(spec) {
    const raw = spec && spec.form ? spec.form.type : undefined;
    return isKnown(raw) ? raw : undefined;
}

export function toPicklist(specValue) {
    const d = definition(specValue);
    return d ? d.picklistValue : undefined;
}

export function label(specValue) {
    const d = definition(specValue);
    return d ? d.label : undefined;
}

const capability = (name) => (specValue) => {
    const d = definition(specValue);
    return d ? d[name] : false;
};

export const needsObject = capability('needsObject');
export const usesAnswerStore = capability('usesAnswerStore');
export const usesQuestions = capability('usesQuestions');
export const usesAnalytics = capability('usesAnalytics');
export const usesContextRecord = capability('usesContextRecord');
export const usesAutofill = capability('usesAutofill');
export const layoutLocked = capability('layoutLocked');
