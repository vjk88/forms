/**
 * When the After Submit screen may leave on its own (IMPL_PLAN_FORM_PDF §6.1).
 *
 * A thank-you screen that offers "Download a copy (PDF)" never auto-redirects:
 * a countdown would take the respondent away from the one thing the screen is
 * offering them. The Design panel makes the two settings exclusive; this is
 * the guard for a spec that arrives with both on (an import, an older draft).
 * Toast & go always leaves, and offers no download.
 *
 * @param {object} completion settings.completion
 * @param {boolean} hasCopy   the viewer holds a submitted copy to offer
 */
export function shouldAutoRedirect(completion, hasCopy) {
    const c = completion || {};
    if (c.mode === 'toast') {
        return true;
    }
    if (!c.autoRedirect) {
        return false;
    }
    return !(c.downloadCopy && hasCopy);
}
