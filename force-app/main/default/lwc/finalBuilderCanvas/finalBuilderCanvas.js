import { LightningElement, api } from 'lwc';

/**
 * finalBuilderCanvas — the blueprint (FORM_STUDIO_IA §4).
 *
 * Deliberately schematic and DARK: structure only — page chips, sections
 * with grips, field rows as skeleton bars. It never re-flows when layouts or
 * themes change; the live preview is the truth for looks.
 *
 * DUMB view: the studio owns the spec. This component renders it and emits
 * intents — `select` {kind,id} · `addpage` · `addsection` {pageId} ·
 * `removeelement`/`removesection`/`removepage` {id}. Structural mutation
 * never happens here. Slice 3b ports the legacy DnD machinery onto these
 * same rows (CANVAS_RULES §7); until then adding is palette click-add.
 *
 * bc- prefixed classes (LEX .stage leak lesson).
 */
export default class FinalBuilderCanvas extends LightningElement {
    @api spec;
    /** {kind: 'page'|'section'|'element', id} or null. */
    @api selection;
    /** The page being edited (studio-owned, like the viewer's pageIndex). */
    @api currentPageIndex = 0;

    get pages() {
        return (this.spec && this.spec.pages) || [];
    }

    get hasPages() {
        return this.pages.length > 0;
    }

    get pageChips() {
        const sel = this.selection || {};
        return this.pages.map((p, i) => ({
            id: p.id,
            label: `Page ${i + 1} · ${p.name || 'Untitled'}`,
            // the ACTIVE chip carries the remove affordance (never the only page)
            removable:
                i === Number(this.currentPageIndex) && this.pages.length > 1,
            cls:
                i === Number(this.currentPageIndex)
                    ? sel.kind === 'page' && sel.id === p.id
                        ? 'bc-chip on selected'
                        : 'bc-chip on'
                    : 'bc-chip'
        }));
    }

    get currentPage() {
        return this.pages[Number(this.currentPageIndex)] || null;
    }

    get sections() {
        const sel = this.selection || {};
        const page = this.currentPage;
        if (!page) {
            return [];
        }
        return (page.sections || []).map((s) => ({
            id: s.id,
            title: s.title || 'Untitled section',
            cls:
                sel.kind === 'section' && sel.id === s.id
                    ? 'bc-section selected'
                    : 'bc-section',
            empty: !(s.elements || []).length,
            elements: (s.elements || []).map((el) => ({
                id: el.id,
                label: el.label || el.type,
                required: Boolean(el.required),
                cls:
                    sel.kind === 'element' && sel.id === el.id
                        ? 'bc-row selected'
                        : 'bc-row'
            }))
        }));
    }

    get isEmpty() {
        const page = this.currentPage;
        return (
            !page ||
            !(page.sections || []).some((s) => (s.elements || []).length)
        );
    }

    // ----- intents -----

    _select(kind, id) {
        this.dispatchEvent(
            new CustomEvent('select', { detail: { kind, id } })
        );
    }

    handleChip(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const index = this.pages.findIndex((p) => p.id === id);
        this.dispatchEvent(
            new CustomEvent('pagechange', { detail: { index } })
        );
        this._select('page', id);
    }

    handleSectionClick(event) {
        event.stopPropagation();
        this._select('section', event.currentTarget.dataset.id);
    }

    handleElementClick(event) {
        event.stopPropagation();
        this._select('element', event.currentTarget.dataset.id);
    }

    handleAddPage(event) {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('addpage'));
    }

    handleAddSection(event) {
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('addsection', {
                detail: { pageId: this.currentPage && this.currentPage.id }
            })
        );
    }

    handleRemoveElement(event) {
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('removeelement', {
                detail: { id: event.currentTarget.dataset.id }
            })
        );
    }

    handleRemoveSection(event) {
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('removesection', {
                detail: { id: event.currentTarget.dataset.id }
            })
        );
    }

    handleRemovePage(event) {
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('removepage', {
                detail: { id: event.currentTarget.dataset.id }
            })
        );
    }
}
