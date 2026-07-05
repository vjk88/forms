import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';
import { getLayout } from 'c/finalLayoutRegistry';

/**
 * finalFormViewer — P0 minimal viewer: fetches one published Spec_JSON__c blob,
 * parses it (FORM_SPEC_SCHEMA v1), resolves tokens, lazy-loads the nav primitive
 * from the registry, and hands everything to finalPageFrame.
 *
 * Token source (ARCH §5): a published `resolved.tokens` snapshot wins; otherwise
 * the engine runs live (builder-preview semantics — fine for internal P0).
 * `?c__formId=` / `?c__versionId=` URL params override the configured properties.
 */
export default class FinalFormViewer extends LightningElement {
    @api formId;
    @api versionId;

    model;
    tokens = {};
    navCtor;
    error;

    /** Step-flow state (paginated layouts). The viewer is the engine for now. */
    pageIndex = 0;
    _maxVisited = 0;

    _urlFormId;
    _urlVersionId;
    _loadedKey;

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        this._urlFormId = ref && ref.state ? ref.state.c__formId : undefined;
        this._urlVersionId =
            ref && ref.state ? ref.state.c__versionId : undefined;
        this._load();
    }

    connectedCallback() {
        this._load();
    }

    get effectiveFormId() {
        return this._urlFormId || this.formId;
    }

    get effectiveVersionId() {
        return this._urlVersionId || this.versionId;
    }

    async _load() {
        const formId = this.effectiveFormId;
        const versionId = this.effectiveVersionId;
        if (!formId && !versionId) {
            return;
        }
        const key = `${formId}|${versionId}`;
        if (key === this._loadedKey) {
            return;
        }
        this._loadedKey = key;
        try {
            const raw = await getSpec({
                formId: formId || null,
                versionId: versionId || null
            });
            await this._apply(JSON.parse(raw));
        } catch (e) {
            this.model = null;
            this.error =
                (e && e.body && e.body.message) ||
                'This form could not be loaded.';
        }
    }

    async _apply(spec) {
        if (!spec || spec.specVersion !== 1) {
            this.error = 'This form uses an unsupported specification version.';
            this.model = null;
            return;
        }
        const theme =
            spec.theme && spec.theme.source === 'builtin'
                ? getBuiltinTheme(spec.theme.name)
                : null;
        this.tokens =
            (spec.resolved && spec.resolved.tokens) ||
            resolveTokens(theme, spec.theme ? spec.theme.overrides : null);

        const layout = getLayout(spec.layout ? spec.layout.type : undefined);
        const module = await layout.load();
        this.navCtor = module.default;
        this.pageIndex = 0;
        this._maxVisited = 0;

        const header = spec.header || {};
        const hasLockup = Boolean(
            header.title ||
                header.description ||
                header.brandName ||
                (header.logo && header.logo.url) ||
                (header.highlight && header.highlight.text)
        );
        const zonesDefault =
            (spec.layout && spec.layout.zonesDefault) || {};
        const options = (spec.layout && spec.layout.options) || {};
        // splitHero's brand pane replaces formHeader (registry: ownsHeader);
        // its Pane Flow = One at a Time also owns the advance, like oneAtATime.
        const ownsAdvance = Boolean(
            layout.ownsAdvance ||
                (layout.ownsHeader && options.paneFlow === 'oneAtATime')
        );
        this.model = {
            maxWidth: (spec.layout && spec.layout.maxWidth) || 'medium',
            header:
                !layout.ownsHeader && header.style !== 'none' && hasLockup
                    ? header
                    : null,
            // Each page ships with its zones config pre-merged (sparse page
            // override on top of layout.zonesDefault — schema §4).
            pages: (spec.pages || []).map((page) => ({
                ...page,
                zones: { ...zonesDefault, ...(page.zones || {}) }
            })),
            submit: spec.submit || {},
            layoutOptions: options,
            paginates: Boolean(layout.paginates),
            ownsAdvance
        };
        this.error = undefined;
    }

    get lastPageIndex() {
        return this.model ? this.model.pages.length - 1 : 0;
    }

    /**
     * Per-page validity — the engine's truth the primitives render gating from.
     * No validation engine yet (P1): a page counts valid once visited, so gated
     * steppers gate on "how far you've been", never further.
     */
    get pageValidity() {
        if (!this.model) {
            return [];
        }
        return this.model.pages.map((_page, i) => i <= this._maxVisited);
    }

    get showBack() {
        return (
            this.model &&
            this.model.paginates &&
            !this.model.ownsAdvance &&
            this.pageIndex > 0
        );
    }

    get showNext() {
        return (
            this.model &&
            this.model.paginates &&
            !this.model.ownsAdvance &&
            this.pageIndex < this.lastPageIndex
        );
    }

    /** Submit ONLY on the final page (BUILD_PHASES checklist #1). */
    get showSubmit() {
        return (
            this.model &&
            (!this.model.paginates || this.pageIndex === this.lastPageIndex)
        );
    }

    handlePageChange(event) {
        const index = event.detail ? event.detail.index : undefined;
        if (
            typeof index === 'number' &&
            index >= 0 &&
            index <= this.lastPageIndex
        ) {
            this.pageIndex = index;
            this._maxVisited = Math.max(this._maxVisited, index);
        }
    }

    handleNext() {
        // Page validation runs here once the validation engine lands (P1 later
        // slices only need the flow; blocked-state UX is already in submitBar).
        if (this.pageIndex < this.lastPageIndex) {
            this.pageIndex += 1;
            this._maxVisited = Math.max(this._maxVisited, this.pageIndex);
        }
    }

    handleBack() {
        if (this.pageIndex > 0) {
            this.pageIndex -= 1;
        }
    }

    handleSubmit() {
        // Submission engine lands in a later slice (BUILD_PHASES — P3 gate is
        // the first end-to-end submit). The bar's intent is contract-complete.
    }
}
