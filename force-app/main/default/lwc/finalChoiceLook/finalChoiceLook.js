/**
 * How a choice field looks, and which options it draws. No DOM, no LWC.
 * Shared by the Studio inspector (which tile is on, what a click writes) and
 * the renderer (what respondents see), so the two can never disagree again.
 * docs/FinalDesign/IMPL_PLAN_APPEARANCE_PICKER.md, DEFERRED 36.
 *
 * The look lives in the same two config keys as before, always written
 * together: `renderAs` (one answer or several - Apex, Autofill and the preview
 * session read it) and `optionStyle` (chips | cards, or absent).
 *
 *   Default to schema  Default         -
 *   Dropdown           Dropdown        -
 *   Radio list         Radio_Buttons   -
 *   Checkboxes         Checkbox_Group  -
 *   Chips / Cards      Radio_Buttons   chips | cards   (Checkbox_Group = several)
 */

export const LOOKS = ['default', 'dropdown', 'radio', 'chips', 'cards'];

const MULTI = new Set(['Checkbox_Group', 'Custom_MultiSelect']);

/** The field's own choice, else the form's default for its type (what the
 *  viewer stamps as `renderDefault`), else the schema's. */
export function effectiveRenderAs(cfg, formDefault) {
    return (cfg && cfg.renderAs) || formDefault || 'Default';
}

/**
 * What respondents see: { look, multi }. Chips and cards win whenever the
 * field has options, whatever `renderAs` says - that is what the renderer has
 * always drawn, so a form stuck in the old bug opens on the look it shows.
 * Non-choice values (Toggle, Slider, Filtered_Search) read as 'default'.
 */
export function lookOf(cfg, formDefault) {
    const c = cfg || {};
    const renderAs = effectiveRenderAs(c, formDefault);
    const multi = MULTI.has(renderAs);
    const hasOptions = (c.options || []).length > 0;
    if (
        hasOptions &&
        (c.optionStyle === 'chips' || c.optionStyle === 'cards')
    ) {
        return { look: c.optionStyle, multi };
    }
    if (renderAs === 'Dropdown') {
        return { look: 'dropdown', multi: false };
    }
    if (renderAs === 'Radio_Buttons' || multi) {
        return { look: 'radio', multi };
    }
    return { look: 'default', multi: false };
}

/** The config patch a tile writes. Both keys every time (optionStyle
 *  `undefined` drops out of the saved JSON). A dropdown and the schema's
 *  control take one answer, so `multi` is ignored there. */
export function configFor(look, multi) {
    const several = Boolean(multi) && look !== 'dropdown' && look !== 'default';
    if (look === 'dropdown') {
        return { renderAs: 'Dropdown', optionStyle: undefined };
    }
    if (look === 'radio' || look === 'chips' || look === 'cards') {
        return {
            renderAs: several ? 'Checkbox_Group' : 'Radio_Buttons',
            optionStyle: look === 'radio' ? undefined : look
        };
    }
    return { renderAs: 'Default', optionStyle: undefined };
}

/**
 * The options a field draws. A picklist on Default to schema shows the
 * field's choices exactly as Salesforce has them (`schemaOptions`, copied from
 * describe): no emoji, no sublabel, no renamed labels. Every other look draws
 * the author's own rows. A spec saved before `schemaOptions` existed keeps
 * drawing its rows (they are the describe copy unless someone edited them).
 */
export function optionsFor(cfg, look) {
    const c = cfg || {};
    const own = c.options || [];
    if (look === 'default' && c.inputType === 'picklist') {
        const schema = c.schemaOptions || [];
        if (schema.length) {
            return schema.map((o) => ({
                label: o.label || o.value,
                value: o.value
            }));
        }
    }
    return own;
}

/** True when a Default picklist is drawing Salesforce's own list. */
export function drawsSchemaOptions(cfg, look) {
    const c = cfg || {};
    return (
        look === 'default' &&
        c.inputType === 'picklist' &&
        (c.schemaOptions || []).length > 0
    );
}

/** describe rows ({ value, label }) -> what `schemaOptions` stores. */
export function toSchemaOptions(describeOptions) {
    return (describeOptions || [])
        .filter((o) => o && o.value !== undefined && o.value !== null)
        .map((o) => ({ value: o.value, label: o.label || o.value }));
}
