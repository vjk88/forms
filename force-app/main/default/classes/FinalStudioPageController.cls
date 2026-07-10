/**
 * Server-side bits for the FinalStudio Visualforce host page (the full-page
 * builder). getLightningHost feeds the page's exit link: Url.getOrgDomainUrl()
 * is the org's core domain, and core /lightning/* URLs redirect into LEX from
 * the VF-served domain — the one reliable cross-domain hop without hardcoding
 * enhanced-vs-legacy domain formats in page JavaScript.
 */
public with sharing class FinalStudioPageController {
    public String getLightningHost() {
        return Url.getOrgDomainUrl().toExternalForm();
    }
}
