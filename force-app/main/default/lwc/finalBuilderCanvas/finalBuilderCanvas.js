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
 * `removeelement`/`removesection`/`removepage` {id} · and the DnD intents
 * `dropfield` {field, sectionId?, beforeId?, pageId?} · `moveelement`
 * {id, sectionId?, beforeId?, pageId?} · `movesection` {id,
 * beforeSectionId?, pageId} · `movepage` {id, beforeId}. Structural
 * mutation never happens here.
 *
 * The DnD machinery below is the SANCTIONED legacy code port
 * (CANVAS_RULES §7, owner 2026-07-05): capture-phase gatekeeper owning
 * preventDefault + auto-scroll, one validity predicate feeding cursor AND
 * highlight, imperative highlights (no re-render mid-drag = no cursor
 * flicker), native no-drop as the only rejection feedback (§1: no toasts).
 * Adapted for spec ids (pg_/sec_/el_), the split palette component (drag
 * kind travels as a typed dataTransfer marker — drag DATA is protected
 * until drop, types are not), and bc- class names (LEX leak rule).
 *
 * bc- prefixed classes (LEX .stage leak lesson).
 */

/** Typed markers finalFieldPalette stamps on its drags (types are visible
 *  during dragover; the JSON payload is not until drop). */
export const PALETTE_FIELD_MIME = 'final/palette-field';
export const PALETTE_EL_MIME = 'final/palette-el';

/** Blueprint labels for standalone content blocks (schema §4 v1 types). */
const BLOCK_LABELS = {
    richText: 'Display text',
    image: 'Image',
    divider: 'Divider',
    spacer: 'Spacer'
};

export default class FinalBuilderCanvas extends LightningElement {
    @api spec;
    /** {kind: 'page'|'section'|'element', id} or null. */
    @api selection;
    /** The page being edited (studio-owned, like the viewer's pageIndex). */
    @api currentPageIndex = 0;

    // ---- DnD state (deliberately non-reactive — mid-drag re-renders are
    // the flicker bug the imperative model exists to prevent) ----
    _hlNode = null; // the single currently-highlighted node
    _hlCls = '';
    _dragKind = null; // section | element | page (canvas-internal drags)
    _dragElSig = 'parent'; // data-context sig of a dragged element's source
    _boundRootEl = null; // canvas root the capture gatekeeper is bound to

    /**
     * Capturing dragover for the whole canvas. Two jobs (legacy verbatim):
     *  1) Blanket preventDefault + a stable dropEffect so the native cursor
     *     never flips to the OS "no-drop" badge over dead zones between
     *     specific drop targets — that flip is the drag-cursor flicker.
     *  2) Auto-scroll while dragging near the blueprint's top/bottom edge.
     * Capture phase: fires before target handlers and any stopPropagation.
     * Calling preventDefault marks the spot droppable; leaving it alone
     * keeps the browser's native no-drop — which IS the rejection feedback.
     */
    _gatekeeper = (e) => {
        const kind = this._kindOf(e);
        const allow = this._dragAllowedAt(e.target, kind);
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = !allow
                ? 'none'
                : kind === 'palette-field'
                  ? 'copy'
                  : 'move';
        }
        if (allow) {
            e.preventDefault();
        }
        const sc = this.template.querySelector('.bc-scroll');
        if (!sc) {
            return;
        }
        const r = sc.getBoundingClientRect();
        const EDGE = 52;
        const SPEED = 16;
        if (e.clientY < r.top + EDGE) {
            sc.scrollTop -= SPEED;
        } else if (e.clientY > r.bottom - EDGE) {
            sc.scrollTop += SPEED;
        }
    };

    renderedCallback() {
        const root = this.template.querySelector('.bc');
        if (root && root !== this._boundRootEl) {
            root.addEventListener('dragover', this._gatekeeper, true);
            this._boundRootEl = root;
        } else if (!root) {
            this._boundRootEl = null;
        }
    }

    /** The active drag's kind: canvas-internal state, else the palette's
     *  typed marker (the only cross-component signal available mid-drag). */
    _kindOf(e) {
        if (this._dragKind) {
            return this._dragKind;
        }
        const types = (e.dataTransfer && e.dataTransfer.types) || [];
        if (Array.prototype.includes.call(types, PALETTE_FIELD_MIME)) {
            return 'palette-field';
        }
        if (Array.prototype.includes.call(types, PALETTE_EL_MIME)) {
            return 'palette-el';
        }
        return null;
    }

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
        return (page.sections || []).map((s) => {
            const selected = sel.kind === 'section' && sel.id === s.id;
            // §3: a standalone content block is a marked wrapper section —
            // the blueprint renders it as a compact block row, not a box
            const isBlock = Boolean(s.block);
            const first = (s.elements || [])[0];
            return {
                id: s.id,
                gapKey: `gap_${s.id}`,
                isBlock,
                blockLabel: isBlock
                    ? BLOCK_LABELS[first && first.type] || 'Block'
                    : null,
                title: s.title || 'Untitled section',
                cls: isBlock
                    ? selected
                        ? 'bc-block selected'
                        : 'bc-block'
                    : selected
                      ? 'bc-section selected'
                      : 'bc-section',
                empty: !(s.elements || []).length,
                elements: isBlock
                    ? []
                    : (s.elements || []).map((el) => ({
                          id: el.id,
                          sectionId: s.id,
                          label: el.label || el.type,
                          required: Boolean(el.required),
                          cls:
                              sel.kind === 'element' && sel.id === el.id
                                  ? 'bc-row selected'
                                  : 'bc-row'
                      }))
            };
        });
    }

    get isEmpty() {
        const page = this.currentPage;
        return (
            !page ||
            !(page.sections || []).some((s) => (s.elements || []).length)
        );
    }

    _sectionById(id) {
        const page = this.currentPage;
        return ((page && page.sections) || []).find((s) => s.id === id) || null;
    }

    /** Data-context signature (CANVAS_RULES §2): 'parent' for primary-object
     *  sections, rel:{child} for repeaters — fields can't wander across. */
    _sig(sec) {
        return sec && sec.repeat && sec.repeat.childObject
            ? `rel:${sec.repeat.childObject}`
            : 'parent';
    }

    // --- Drop validity (§1: ONE source of truth for cursor AND highlight) ---
    _sectionAcceptsDrag(sec, kind) {
        if (!sec) {
            return false;
        }
        if (kind === 'section' || kind === 'page') {
            return true;
        }
        // §1: content blocks land anywhere (into field sections, or as a
        // sibling BEFORE another block — the drop handler decides which).
        if (kind === 'palette-el') {
            return true;
        }
        // §3: content blocks hold nothing — fields/elements never enter.
        if (sec.block) {
            return false;
        }
        // §1: a palette field never lands in a repeater (child fields come
        // from the repeater's inspector); §2: an element only moves between
        // sections sharing its data context.
        if (kind === 'palette-field') {
            return this._sig(sec) === 'parent';
        }
        if (kind === 'element') {
            return this._sig(sec) === this._dragElSig;
        }
        return false;
    }

    /** The blueprint section enclosing a dragover target (ancestor walk). */
    _sectionAt(target) {
        let node = target;
        while (node && node !== this._boundRootEl) {
            const ds = node.dataset;
            if (ds) {
                let sec = ds.sectionId && this._sectionById(ds.sectionId);
                if (!sec && ds.id) {
                    sec = this._sectionById(ds.id);
                }
                if (sec) {
                    return sec;
                }
            }
            node = node.parentElement;
        }
        return null;
    }

    /** Whether the current drag may drop at this target (gatekeeper's ask). */
    _dragAllowedAt(target, kind) {
        if (!kind) {
            return false;
        }
        // sections/pages reorder anywhere; blocks also drop in gaps (§1)
        if (kind === 'section' || kind === 'page' || kind === 'palette-el') {
            return true;
        }
        const sec = this._sectionAt(target);
        if (kind === 'element' && !sec) {
            return true; // bare canvas → move lands in a real section
        }
        return this._sectionAcceptsDrag(sec, kind);
    }

    // Imperative drop highlight — toggles a class directly on the node so
    // the blueprint never re-renders mid-drag (the flicker fix). One node
    // at a time.
    _setHighlight(node, cls) {
        if (this._hlNode === node && this._hlCls === cls) {
            return;
        }
        if (this._hlNode) {
            this._hlNode.classList.remove(this._hlCls);
        }
        this._hlNode = node || null;
        this._hlCls = cls || '';
        if (node && cls) {
            node.classList.add(cls);
        }
    }

    _clearHighlight() {
        if (this._hlNode) {
            this._hlNode.classList.remove(this._hlCls);
        }
        this._hlNode = null;
        this._hlCls = '';
    }

    _clearDnd() {
        this._clearHighlight();
    }

    // ---- drag sources ----

    _setDrag(e, data) {
        e.dataTransfer.setData('text/plain', JSON.stringify(data));
        // Existing nodes are MOVED (palette drags are stamped 'copy' by the
        // palette itself); effectAllowed must agree with the gatekeeper's
        // dropEffect or the native badge flickers.
        e.dataTransfer.effectAllowed = 'move';
    }

    _readDrag(e) {
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    handleSectionDragStart(e) {
        this._dragKind = 'section';
        this._setDrag(e, { t: 'section', id: e.currentTarget.dataset.id });
    }

    handleElementDragStart(e) {
        e.stopPropagation(); // the section root is draggable too
        this._dragKind = 'element';
        const ds = e.currentTarget.dataset;
        this._dragElSig = this._sig(this._sectionById(ds.sectionId));
        this._setDrag(e, {
            t: 'element',
            id: ds.id,
            sectionId: ds.sectionId
        });
    }

    handleChipDragStart(e) {
        this._dragKind = 'page';
        this._setDrag(e, { t: 'page', id: e.currentTarget.dataset.id });
    }

    handleDragEndClear() {
        this._clearDnd();
        this._dragKind = null;
    }

    // ---- dragover refinement (highlight only — preventDefault is the
    // gatekeeper's; these may still clear the highlight on invalid spots) ----

    // Over a section's whitespace → "drops in here"; a section drag → an
    // insertion LINE before it.
    handleSecDragOver(e) {
        const kind = this._kindOf(e);
        if (!kind) {
            return;
        }
        const node = e.currentTarget;
        const sec = this._sectionById(node.dataset.id);
        if (sec && !this._sectionAcceptsDrag(sec, kind)) {
            this._clearHighlight();
            return;
        }
        // §3: a section drag, or content over a BLOCK, is a sibling
        // insertion (line before) — everything else drops IN (highlight).
        this._setHighlight(
            node,
            kind === 'section' || (sec && sec.block)
                ? 'bc-drop-before'
                : 'bc-drop-on'
        );
    }

    // Over an element row → insertion line before it. stopPropagation so the
    // parent section's dragover doesn't steal the highlight.
    handleElDragOver(e) {
        const kind = this._kindOf(e);
        if (!kind) {
            return;
        }
        // A SECTION drag over a field keeps the section-level line — you're
        // reordering sections, not fields; let it reach the parent.
        if (kind === 'section') {
            return;
        }
        e.stopPropagation();
        const node = e.currentTarget;
        const sec = this._sectionById(node.dataset.sectionId);
        if (sec && !this._sectionAcceptsDrag(sec, kind)) {
            this._clearHighlight();
            return;
        }
        this._setHighlight(node, 'bc-drop-before');
    }

    // Inter-section gap — a section reorders here, a palette block lands
    // here STANDALONE (§1/§3). Fields can't live between sections, so they
    // get no line and the gatekeeper leaves them a native no-drop.
    handleGapDragOver(e) {
        const kind = this._kindOf(e);
        if (kind !== 'section' && kind !== 'palette-el') {
            this._clearHighlight();
            return;
        }
        e.stopPropagation();
        this._setHighlight(e.currentTarget, 'bc-gap-over');
    }

    handleGapLeave(e) {
        if (this._hlNode === e.currentTarget) {
            this._clearHighlight();
        }
    }

    handleDragLeave(e) {
        if (this._hlNode === e.currentTarget) {
            this._clearHighlight();
        }
    }

    // Page chips accept everything: page reorder (line), or moving a
    // section/element/palette field to that page (drop-on).
    handleChipDragOver(e) {
        const kind = this._kindOf(e);
        if (!kind) {
            return;
        }
        this._setHighlight(
            e.currentTarget,
            kind === 'page' ? 'bc-drop-before' : 'bc-drop-on'
        );
    }

    // ---- drops (the gatekeeper already vetoed invalid spots — a drop
    // firing here implies validity) ----

    handleSectionDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) {
            return;
        }
        const sectionId = e.currentTarget.dataset.id;
        const pageId = this.currentPage && this.currentPage.id;
        if (data.t === 'section') {
            this._emit('movesection', {
                id: data.id,
                beforeSectionId: sectionId,
                pageId
            });
        } else if (data.t === 'element') {
            this._emit('moveelement', {
                id: data.id,
                sectionId,
                beforeId: null
            });
        } else if (data.t === 'palette-field') {
            this._emit('dropfield', {
                field: data.field,
                sectionId,
                beforeId: null
            });
        } else if (data.t === 'palette-el') {
            const sec = this._sectionById(sectionId);
            if (sec && sec.block) {
                // §3: onto a block → a standalone SIBLING before it
                this._emit('dropblock', {
                    blockType: data.elType,
                    beforeSectionId: sectionId,
                    pageId
                });
            } else {
                // into a field section → a content element, appended
                this._emit('dropblock', {
                    blockType: data.elType,
                    sectionId,
                    beforeId: null
                });
            }
        }
    }

    handleElementDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) {
            return;
        }
        const ds = e.currentTarget.dataset;
        const pageId = this.currentPage && this.currentPage.id;
        // A section released over a field still reorders — the field area is
        // most of a section's surface; don't make the user aim for the header.
        if (data.t === 'section') {
            this._emit('movesection', {
                id: data.id,
                beforeSectionId: ds.sectionId,
                pageId
            });
        } else if (data.t === 'element') {
            this._emit('moveelement', {
                id: data.id,
                sectionId: ds.sectionId,
                beforeId: ds.id
            });
        } else if (data.t === 'palette-field') {
            this._emit('dropfield', {
                field: data.field,
                sectionId: ds.sectionId,
                beforeId: ds.id
            });
        } else if (data.t === 'palette-el') {
            // a content block dropped on a field row → inserted right there
            this._emit('dropblock', {
                blockType: data.elType,
                sectionId: ds.sectionId,
                beforeId: ds.id
            });
        }
    }

    handleGapDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) {
            return;
        }
        if (data.t === 'palette-el') {
            // §1: a block in a gap = standalone, right here
            this._emit('dropblock', {
                blockType: data.elType,
                beforeSectionId: e.currentTarget.dataset.before || null,
                pageId: this.currentPage && this.currentPage.id
            });
            return;
        }
        if (data.t !== 'section') {
            return; // fields/elements never land in gaps (§1)
        }
        this._emit('movesection', {
            id: data.id,
            beforeSectionId: e.currentTarget.dataset.before || null,
            pageId: this.currentPage && this.currentPage.id
        });
    }

    handleChipDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._clearDnd();
        const data = this._readDrag(e);
        if (!data) {
            return;
        }
        const pageId = e.currentTarget.dataset.id;
        if (data.t === 'page') {
            this._emit('movepage', { id: data.id, beforeId: pageId });
        } else if (data.t === 'section') {
            this._emit('movesection', {
                id: data.id,
                beforeSectionId: null,
                pageId
            });
        } else if (data.t === 'element') {
            this._emit('moveelement', { id: data.id, pageId });
        } else if (data.t === 'palette-field') {
            this._emit('dropfield', { field: data.field, pageId });
        } else if (data.t === 'palette-el') {
            // block onto a page chip → standalone at that page's end
            this._emit('dropblock', { blockType: data.elType, pageId });
        }
    }

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }

    // ----- click intents -----

    _select(kind, id) {
        this.dispatchEvent(new CustomEvent('select', { detail: { kind, id } }));
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
