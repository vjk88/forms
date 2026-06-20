import { LightningElement, api } from 'lwc';

/**
 * c/shellStack — the parameterized "Continuous flow" shell (Phase 3 T3.3).
 *
 * Serves the **Stacked** and **Bento** layouts, and absorbs the retired
 * per-look shells (classic/sfRecordPage/glass/document/console/mosaic). Their
 * *looks* now come from THEMES (c/formThemes) — e.g. the glass blur rides the
 * `--c-glass-blur` token, the paper surface rides the Editorial theme — so this
 * shell stays structure-only and reads its variant from `model.shell`:
 *   chrome   card | paper | fullbleed
 *   header   standard | hero | minimal | none
 *   maxWidth narrow | medium | wide | full
 *   submit   { placement: flow | stickyBottom, alignment }
 * Bento is just this shell with the MOSAIC fill rule (zones arrive pre-gridded).
 *
 * A shell owns ONLY chrome; all containers render via c/layoutZones. Never
 * call Apex. Tokens only — no raw hex/px.
 */
export default class ShellStack extends LightningElement {
    @api model;
    @api nav; // unused: scroll = all pages stacked
    @api mode;

    get shell() {
        return (this.model && this.model.shell) || {};
    }

    get showHeader() {
        const h = this.shell.header;
        const hd = (this.model && this.model.header) || {};
        // The highlight badge now lives inside the header lockup, so it must also
        // keep the header rendered even when there's no title/description/logo.
        return h !== 'none' && !!(hd.title || hd.description || hd.logo || hd.highlight);
    }
    get highlightVariant() {
        return this.shell.header === 'hero' ? 'banner' : '';
    }
    get headerArrangement() {
        return (this.model && this.model.header && this.model.header.arrangement) || 'stacked';
    }
    get showLogo() {
        const h = (this.model && this.model.header) || {};
        return this.headerArrangement !== 'textOnly' && !!h.logo;
    }
    get headClass() {
        return `head head-${this.shell.header || 'standard'} arrange-${this.headerArrangement}`;
    }

    get wrapperClass() {
        return `wrap chrome-${this.shell.chrome || 'card'}`;
    }
    get surfaceClass() {
        return `surface maxw-${this.shell.maxWidth || 'narrow'}`;
    }
    get isPaper() {
        return this.shell.chrome === 'paper';
    }

    get pages() {
        const ps = (this.model && this.model.pages) || [];
        // Scroll nav: page labels become dividers only when a form has > 1 page.
        return ps.map((p) => ({ ...p, showLabel: ps.length > 1 && !!p.label }));
    }

    get submitInfo() {
        return this.shell.submit || { placement: 'flow', alignment: 'right' };
    }
    get isStickySubmit() {
        return this.submitInfo.placement === 'stickyBottom';
    }
    get isFlowSubmit() {
        return !this.isStickySubmit;
    }
    get submitClass() {
        return `submit-row align-${this.submitInfo.alignment || 'right'}`;
    }

    get submitLabel() {
        return (this.model && this.model.labels && this.model.labels.submit) || 'Submit';
    }

    fireSubmit() {
        this.dispatchEvent(new CustomEvent('submitrequest'));
    }
}
