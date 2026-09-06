import { LightningElement, api } from 'lwc';
import { canMoveElement, findItem } from './movement';
export { canMoveElement } from './movement';

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
export const PALETTE_REP_MIME = 'final/palette-rep';
/** Inside-only content (Empty space — a grid-cell filler, BUILDER_SURFACES
 *  §1): lands in sections like a field, never in gaps or block wrappers. */
export const PALETTE_CELL_MIME = 'final/palette-cell';
/** File Upload is a block like any other EXCEPT that schema §4.1 forbids it
 *  inside a repeatable section. The payload naming the block type isn't
 *  readable mid-drag, so — exactly like Empty space above — it carries its own
 *  typed marker to stay distinguishable at dragover. */
export const PALETTE_FILE_MIME = 'final/palette-el-file';

/** Blueprint labels for content types (schema §4 / BUILDER_SURFACES §1). */
const BLOCK_LABELS = {
    richText: 'Display text',
    image: 'Image',
    divider: 'Divider',
    spacer: 'Spacer',
    callout: 'Callout',
    consent: 'Consent',
    emptySpace: 'Empty space',
    file: 'File upload',
    nps: 'NPS',
    rating: 'Rating',
    scale: 'Opinion scale',
    emojiScale: 'Emoji scale',
    likert: 'Likert',
    yesNo: 'Yes / No',
    imageChoice: 'Image choice',
    ranking: 'Ranking',
    matrix: 'Matrix'
};

/** Survey question registry keys — field-like on the blueprint: their chip
 *  shows the authored question text (SURVEY_PLAN §2.1). */
const SURVEY_QUESTION_TYPES = new Set([
    'nps',
    'rating',
    'scale',
    'emojiScale',
    'likert',
    'yesNo',
    'imageChoice',
    'ranking',
    'matrix'
]);

/** Always span the whole grid (mirrors finalSectionRenderer — runtime parity). */
const FULL_WIDTH_TYPES = new Set(['divider', 'spacer']);

export default class FinalBuilderCanvas extends LightningElement {
    @api spec;
    /** {kind: 'page'|'section'|'element', id} or null. */
    @api selection;
    /** The page being edited (studio-owned, like the viewer's pageIndex). */
    @api currentPageIndex = 0;

    moveOpen = false;
    actionsOpen = false;
    _actionsTop = 0;
    _actionsLeft = 0;
    destination = '';
    announcement = '';
    _pendingAction;
    _focusActions = false;
    _focusDestination = false;

    get selectedItem() {
        const hit = findItem(
            this.pages,
            this.selection?.kind,
            this.selection?.id
        );
        // Standalone blocks move as whole sections, never as their hidden
        // inner element (which can be selected from the live preview).
        return this.selection?.kind === 'element' && hit?.section.block
            ? null
            : hit;
    }

    _label(kind, item) {
        if (kind === 'page') return item.name || 'Untitled page';
        if (kind === 'section')
            return item.block
                ? BLOCK_LABELS[item.elements?.[0]?.type] || 'Block'
                : item.title || 'Untitled section';
        return item.label || BLOCK_LABELS[item.type] || item.type;
    }

    get selectedLabel() {
        return this.selectedItem
            ? this._label(this.selection.kind, this.selectedItem.item)
            : '';
    }

    get actionsLabel() {
        return `Actions for ${this.selectedLabel}`;
    }
    get actionsStyle() {
        return `top:${this._actionsTop}px;left:${this._actionsLeft}px;max-height:calc(100% - ${this._actionsTop + 8}px)`;
    }
    get showActions() {
        return this.actionsOpen && Boolean(this.selectedItem);
    }

    _openActions(event) {
        const { kind, id } = event.currentTarget.dataset;
        if (kind === 'page') this.handleChip(event);
        else this._select(kind, id);
        const root = this.template.querySelector('.bc').getBoundingClientRect();
        const item = event.currentTarget.getBoundingClientRect();
        this._actionsTop = Math.max(
            8,
            Math.min(item.bottom - root.top + 4, root.height - 240)
        );
        this._actionsLeft = Math.max(
            8,
            Math.min(item.left - root.left, root.width - 320)
        );
        this.actionsOpen = true;
        this._focusActions = true;
    }
    handleContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();
        this._openActions(event);
    }
    handleCanvasPointer(event) {
        if (this.actionsOpen && !event.target.closest('.bc-popup')) {
            this.actionsOpen = false;
            this.moveOpen = false;
        }
    }
    handlePopupFocusOut() {
        Promise.resolve().then(() => {
            const popup = this.template.querySelector('.bc-popup');
            if (popup && !popup.contains(this.template.activeElement)) {
                this.actionsOpen = false;
                this.moveOpen = false;
            }
        });
    }
    _outsidePointer = (event) => {
        if (!event.composedPath().includes(this.template.host)) {
            this.actionsOpen = false;
            this.moveOpen = false;
        }
    };
    connectedCallback() {
        document.addEventListener('pointerdown', this._outsidePointer);
    }
    disconnectedCallback() {
        document.removeEventListener('pointerdown', this._outsidePointer);
    }
    get moveUpDisabled() {
        const hit = this.selectedItem;
        return !hit || hit.siblings.indexOf(hit.item) === 0;
    }
    get moveDownDisabled() {
        const hit = this.selectedItem;
        return (
            !hit || hit.siblings.indexOf(hit.item) === hit.siblings.length - 1
        );
    }
    get moveDestinations() {
        const hit = this.selectedItem;
        if (!hit || this.selection.kind === 'page') return [];
        return this.pages.flatMap((page, index) => {
            const label = `Page ${index + 1} · ${page.name || 'Untitled'}`;
            if (this.selection.kind === 'section') {
                return page.id === hit.page.id
                    ? []
                    : [{ value: page.id, label }];
            }
            const destinations = (page.sections || [])
                .filter(
                    (section) =>
                        section.id !== hit.section.id &&
                        canMoveElement(hit.item, hit.section, section)
                )
                .map((section) => ({
                    value: section.id,
                    label: `${label} / ${section.title || 'Untitled section'}`
                }));
            if (
                !destinations.length &&
                page.id !== hit.page.id &&
                !hit.section.repeat
            ) {
                destinations.push({
                    value: `page:${page.id}`,
                    pageId: page.id,
                    label: `${label} / New section`
                });
            }
            return destinations;
        });
    }
    get moveToDisabled() {
        return !this.moveDestinations.length;
    }
    get moveConfirmDisabled() {
        return !this.moveDestinations.some(
            (option) => option.value === this.destination
        );
    }
    get moveExpanded() {
        return String(this.moveOpen);
    }
    get moveHelp() {
        return this.selection?.kind === 'element'
            ? 'Choose a compatible section. The question will move to its end.'
            : 'Choose a page. The section or block will move to its end.';
    }

    _focusItem(kind, id) {
        const button = [...this.template.querySelectorAll('[data-nav]')].find(
            (node) => node.dataset.kind === kind && node.dataset.id === id
        );
        if (button) {
            button.focus();
            button.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
    }

    handleNavigationKey(event) {
        const { key, altKey, ctrlKey, metaKey } = event;
        const { kind, id } = event.currentTarget.dataset;
        if (ctrlKey || metaKey) return;
        if (altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
            event.preventDefault();
            this._moveSibling(kind, id, key === 'ArrowUp' ? -1 : 1);
        } else if ((key === 'F10' && event.shiftKey) || key === 'ContextMenu') {
            event.preventDefault();
            this._openActions(event);
        } else if (
            !altKey &&
            ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)
        ) {
            event.preventDefault();
            const nodes = [...this.template.querySelectorAll('[data-nav]')];
            const at = nodes.indexOf(event.currentTarget);
            const index =
                key === 'Home'
                    ? 0
                    : key === 'End'
                      ? nodes.length - 1
                      : Math.max(
                            0,
                            Math.min(
                                nodes.length - 1,
                                at + (key === 'ArrowUp' ? -1 : 1)
                            )
                        );
            nodes[index]?.focus();
        }
    }

    _queueAction(kind, id, message, verify) {
        this.announcement = '';
        this._pendingAction = { kind, id, message, verify, spec: this.spec };
    }

    _moveSibling(kind, id, delta) {
        const hit = findItem(this.pages, kind, id);
        if (!hit) return;
        const at = hit.siblings.indexOf(hit.item);
        if (at + delta < 0 || at + delta >= hit.siblings.length) return;
        // Existing intents insert BEFORE a sibling; moving down skips over
        // the following sibling, or appends at the end.
        const before = hit.siblings[delta < 0 ? at - 1 : at + 2]?.id || null;
        this._queueAction(
            kind,
            id,
            `${this._label(kind, hit.item)} moved to position ${at + delta + 1} of ${hit.siblings.length}.`,
            (pages) => {
                const moved = findItem(pages, kind, id);
                return (
                    moved && moved.siblings.indexOf(moved.item) === at + delta
                );
            }
        );
        this.moveOpen = false;
        this.actionsOpen = false;
        if (kind === 'page') {
            this._emit('pagechange', { index: this.pages.indexOf(hit.page) });
            this._emit('movepage', { id, beforeId: before });
        } else if (kind === 'section')
            this._emit('movesection', {
                id,
                pageId: hit.page.id,
                beforeSectionId: before
            });
        else
            this._emit('moveelement', {
                id,
                sectionId: hit.section.id,
                beforeId: before
            });
    }

    handleMoveUp() {
        this._moveSibling(this.selection.kind, this.selection.id, -1);
    }
    handleMoveDown() {
        this._moveSibling(this.selection.kind, this.selection.id, 1);
    }
    handleMoveTo() {
        this.moveOpen = !this.moveOpen;
        this.destination = '';
        this._focusDestination = this.moveOpen;
    }
    handleDestination(event) {
        this.destination = event.target.value;
    }
    handleMoveCancel() {
        this.moveOpen = false;
        this.template.querySelector('.bc-move-to')?.focus();
    }
    handleMovePanelKey(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.handleMoveCancel();
        }
    }
    handleActionsKey(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.actionsOpen = false;
            this.moveOpen = false;
            this._focusItem(this.selection.kind, this.selection.id);
        } else if (
            ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
        ) {
            event.preventDefault();
            const buttons = [
                ...this.template.querySelectorAll(
                    '[role="menuitem"]:not(:disabled)'
                )
            ];
            const at = buttons.indexOf(this.template.activeElement);
            const index =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : (at +
                            (event.key === 'ArrowUp' ? -1 : 1) +
                            buttons.length) %
                        buttons.length;
            buttons[index]?.focus();
        }
    }
    handleMoveConfirm() {
        const target = this.moveDestinations.find(
            (option) => option.value === this.destination
        );
        if (!target || !this.selectedItem) return;
        const { kind, id } = this.selection;
        this._queueAction(
            kind,
            id,
            `${this.selectedLabel} moved to ${target.label}.`,
            (pages) => {
                const moved = findItem(pages, kind, id);
                return (
                    moved &&
                    (kind === 'section'
                        ? moved.page.id === target.value
                        : target.pageId
                          ? moved.page.id === target.pageId
                          : moved.section.id === target.value)
                );
            }
        );
        this.moveOpen = false;
        this.actionsOpen = false;
        if (kind === 'section')
            this._emit('movesection', {
                id,
                pageId: target.value,
                beforeSectionId: null
            });
        else if (target.pageId)
            this._emit('moveelement', { id, pageId: target.pageId });
        else
            this._emit('moveelement', {
                id,
                sectionId: target.value,
                beforeId: null
            });
    }

    _prepareRemoval(kind, id) {
        const hit = findItem(this.pages, kind, id);
        if (!hit || (kind === 'page' && this.pages.length < 2)) return;
        const at = hit.siblings.indexOf(hit.item);
        const neighbor = hit.siblings[at + 1] || hit.siblings[at - 1];
        const fallbackKind = neighbor
            ? kind
            : kind === 'element'
              ? 'section'
              : 'page';
        const fallback =
            neighbor || (kind === 'element' ? hit.section : hit.page);
        this.moveOpen = false;
        this.actionsOpen = false;
        this._queueAction(
            fallbackKind,
            fallback.id,
            `${this._label(kind, hit.item)} removed.`,
            (pages) => !findItem(pages, kind, id)
        );
    }

    // ---- DnD state (deliberately non-reactive — mid-drag re-renders are
    // the flicker bug the imperative model exists to prevent) ----
    _hlNode = null; // the single currently-highlighted node
    _hlCls = '';
    _dragKind = null; // section | element | page (canvas-internal drags)
    _dragElementId;
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
            // EVERY palette kind is a copy — real browsers CANCEL the drop
            // when dropEffect disagrees with the source's effectAllowed
            // (jsdom doesn't, so only org QA catches a mismatch here)
            e.dataTransfer.dropEffect = !allow
                ? 'none'
                : kind && kind.indexOf('palette') === 0
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
        if (this._pendingAction && this.spec !== this._pendingAction.spec) {
            const pending = this._pendingAction;
            this._pendingAction = null;
            if (pending.verify(this.pages)) {
                this._focusItem(pending.kind, pending.id);
                this.announcement = pending.message;
            }
        }
        if (this._focusActions && this.selectedItem) {
            this._focusActions = false;
            this.template
                .querySelector('.bc-actions button:not(:disabled)')
                ?.focus();
        }
        if (this._focusDestination && this.moveOpen) {
            this._focusDestination = false;
            this.template.querySelector('.bc-destination')?.focus();
        }
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
        // before PALETTE_EL_MIME: a file block stamps BOTH markers, and the
        // narrower one wins (it carries the §4.1 repeater restriction).
        if (Array.prototype.includes.call(types, PALETTE_FILE_MIME)) {
            return 'palette-file';
        }
        if (Array.prototype.includes.call(types, PALETTE_EL_MIME)) {
            return 'palette-el';
        }
        if (Array.prototype.includes.call(types, PALETTE_REP_MIME)) {
            return 'palette-rep';
        }
        if (Array.prototype.includes.call(types, PALETTE_CELL_MIME)) {
            return 'palette-cell';
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
            removeLabel: `Remove page ${i + 1}: ${p.name || 'Untitled'}`,
            pressed: String(sel.kind === 'page' && sel.id === p.id),
            current: i === Number(this.currentPageIndex) ? 'page' : null,
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
            const cols = [1, 2, 3, 4].includes(s.columns) ? s.columns : 1;
            return {
                id: s.id,
                isBlock,
                pressed: String(selected),
                removeLabel: `Remove ${s.block ? 'block' : 'section'}: ${this._label('section', s)}`,
                blockLabel: isBlock
                    ? BLOCK_LABELS[first && first.type] || 'Block'
                    : null,
                // §4: a repeatable section wears its child object on the
                // blueprint — the structural fact a schematic must show
                repeatChip:
                    s.repeat && s.repeat.childObject
                        ? `↻ repeats · ${s.repeat.childObject}`
                        : null,
                title: s.title || 'Untitled section',
                desc: !isBlock && s.description ? s.description : null,
                // the blueprint re-renders the REAL grid (owner: FormBuilder
                // did; a single-column schematic hides the layout being built)
                gridStyle: `grid-template-columns: repeat(${cols}, minmax(0, 1fr))`,
                emptyText: s.repeat
                    ? 'Empty — add child fields from this group’s properties.'
                    : 'Drop fields here',
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
                    : (s.elements || []).map((el) => {
                          // survey questions are field-like on the blueprint:
                          // show the QUESTION TEXT, never a raw type key
                          // (S4 gate finding #5)
                          const isField =
                              el.type === 'field' ||
                              SURVEY_QUESTION_TYPES.has(el.type);
                          const span = FULL_WIDTH_TYPES.has(el.type)
                              ? cols
                              : Math.min(
                                    Math.max(Number(el.width) || 1, 1),
                                    cols
                                );
                          return {
                              id: el.id,
                              sectionId: s.id,
                              pressed: String(
                                  sel.kind === 'element' && sel.id === el.id
                              ),
                              removeLabel: `Remove ${this._label('element', el)}`,
                              isField,
                              label: el.label || el.type,
                              typeLabel: BLOCK_LABELS[el.type] || el.type,
                              required: Boolean(el.required),
                              spanStyle:
                                  cols > 1 ? `grid-column: span ${span}` : '',
                              cls:
                                  sel.kind === 'element' && sel.id === el.id
                                      ? 'bc-row selected'
                                      : 'bc-row'
                          };
                      })
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
        // A Repeating Group IS a section (§4) — it inserts before, like a
        // section reorder, never inside.
        if (kind === 'palette-el' || kind === 'palette-rep') {
            return true;
        }
        // Schema §4.1 v1 law: a file element may NEVER sit inside a repeatable
        // section. A flat `files` array keyed by elementId can't tell entry 1's
        // file from entry 2's, so it couldn't be attached to the right child
        // record — and N × the base64 cap is a heap bomb. Otherwise it lands
        // like any other block.
        if (kind === 'palette-file') {
            return !sec.repeat;
        }
        // §3: content blocks hold nothing — fields/elements never enter.
        if (sec.block) {
            return false;
        }
        // inside-only content (Empty space): any real section, any context —
        // it's an unbound grid filler (BUILDER_SURFACES §1)
        if (kind === 'palette-cell') {
            return true;
        }
        // §1: a palette field never lands in a repeater (child fields come
        // from the repeater's inspector); §2: an element only moves between
        // sections sharing its data context.
        if (kind === 'palette-field') {
            return this._sig(sec) === 'parent';
        }
        if (kind === 'element') {
            const source = findItem(this.pages, 'element', this._dragElementId);
            return source && canMoveElement(source.item, source.section, sec);
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
        // sections/pages reorder anywhere; blocks and repeaters also drop
        // in gaps (§1/§4)
        if (
            kind === 'section' ||
            kind === 'page' ||
            kind === 'palette-el' ||
            kind === 'palette-rep'
        ) {
            return true;
        }
        const sec = this._sectionAt(target);
        if (kind === 'element' && !sec) {
            return true; // bare canvas → move lands in a real section
        }
        // A file block keeps the blanket gap-drop of its siblings (a gap is
        // outside every section, so §4.1 can't be violated there) but must be
        // asked about any section it hovers.
        if (kind === 'palette-file' && !sec) {
            return true;
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
        this._dragElementId = ds.id;
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
        // §3/§4: a section or repeater drag, or content over a BLOCK, is a
        // sibling insertion (line before) — everything else drops IN.
        this._setHighlight(
            node,
            kind === 'section' || kind === 'palette-rep' || (sec && sec.block)
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
        // A SECTION (or repeater — it IS a section, §4) drag over a field
        // keeps the section-level line; let it reach the parent.
        if (kind === 'section' || kind === 'palette-rep') {
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
        if (
            kind !== 'section' &&
            kind !== 'palette-el' &&
            kind !== 'palette-file' &&
            kind !== 'palette-rep'
        ) {
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
        } else if (data.t === 'palette-rep') {
            // §4: the group lands BEFORE this section, never inside it
            this._emit('droprepeater', {
                beforeSectionId: sectionId,
                pageId
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
        } else if (data.t === 'palette-rep') {
            this._emit('droprepeater', {
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
        if (data.t === 'palette-rep') {
            this._emit('droprepeater', {
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
        } else if (data.t === 'palette-rep') {
            this._emit('droprepeater', { pageId });
        }
    }

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }

    // ----- click intents -----

    _select(kind, id) {
        this.moveOpen = false;
        this.actionsOpen = false;
        this._pendingAction = null;
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
        this._prepareRemoval('element', event.currentTarget.dataset.id);
        this.dispatchEvent(
            new CustomEvent('removeelement', {
                detail: { id: event.currentTarget.dataset.id }
            })
        );
    }

    handleRemoveSection(event) {
        event.stopPropagation();
        this._prepareRemoval('section', event.currentTarget.dataset.id);
        this.dispatchEvent(
            new CustomEvent('removesection', {
                detail: { id: event.currentTarget.dataset.id }
            })
        );
    }

    handleRemovePage(event) {
        event.stopPropagation();
        this._prepareRemoval('page', event.currentTarget.dataset.id);
        this.dispatchEvent(
            new CustomEvent('removepage', {
                detail: { id: event.currentTarget.dataset.id }
            })
        );
    }
}
