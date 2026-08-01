/**
 * finalStudioLink — the ONE studio-URL helper, in its own service module.
 *
 * Lived in finalFormsLibrary until 2026-07-31, which created a MODULE CYCLE
 * once the library's template started hosting c-final-creation-gallery while
 * the gallery imported { studioUrl } back from the library. In that cycle the
 * gallery evaluates before the library's exports exist → the runtime crash
 * "studioUrl is not a function" on the creation done-screen. Shared leaf
 * modules never import components; components import them.
 *
 * The lightning.force.com host serves /apex pages WRAPPED in LEX chrome
 * (tabs + search bar) — the raw page lives on the enhanced-domain VF host:
 * {mydomain}--c.{partition}.vf.force.com. Salesforce bounce-authenticates
 * the VF domain automatically, so a direct absolute URL is safe. On any
 * other host (VF itself, my.salesforce.com) the relative URL serves raw.
 */
const STUDIO_PAGE = '/apex/FinalStudio';

export function studioUrl(formId) {
    const m = window.location.hostname.match(
        /^([^.]+)\.(.*)lightning\.force\.com$/
    );
    const base = m ? `https://${m[1]}--c.${m[2]}vf.force.com` : '';
    return `${base}${STUDIO_PAGE}?c__formId=${formId}`;
}
