import { LightningElement, api, track } from 'lwc';
import {
    buildScreens,
    clampIndex,
    isLastScreen,
    progressFraction,
    shouldAdvanceOnKey,
    isMultilineTarget,
    isTouchOnly
} from 'c/finalStepFlow';

/**
 * finalNavOneAtATime — conversational nav primitive (catalog §2).
 *
 * One SECTION per screen on the shared finalStepFlow engine. Being `ownsAdvance`,
 * this primitive owns its WHOLE action row (Back + Continue), and — the bounded
 * extension of that exception — the terminal Submit too: on the last screen the
 * primary button dispatches a `submit` intent to the viewer instead of advancing.
 * That keeps Back + primary in ONE row that never jumps between screens
 * (LAYOUT_REFINEMENTS_SPEC §3); the shared submitBar serves the other layouts.
 *
 * Immersive `bleed` (default ON, registry): page chrome (a full-width progress
 * hairline + counter) over a floating, centred question card. `bleed=false`
 * restores the carded render inside the pageFrame panel.
 *
 * Signature distance (owner): advance label defaults to "Continue"; keyboard
 * advance uses plain muted helper text ("or press Return"), never a key-chip.
 */

const ARRANGE_CLASS = {
    'together-left': 'arr-start',
    'together-right': 'arr-end',
    split: 'arr-split'
};

export default class FinalNavOneAtATime extends LightningElement {
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Spec layout.options: { advanceTrigger, advanceLabel, showProgressBar } */
    @api options;
    /** Immersive full-bleed (viewer: layout.bleed && fullBleed !== false). */
    @api bleed = false;
    /** Resolved action-row arrangement (viewer: submit ?? layout default). */
    @api arrangement = 'together-left';
    /** Terminal Submit label (viewer: submit.label). */
    @api submitLabel = 'Submit';

    @track screenIndex = 0;
    @track multilineFocus = false;

    _screens = [];
    _pages = [];

    @api
    get pages() {
        return this._pages;
    }
    set pages(value) {
        this._pages = value || [];
        this._screens = buildScreens(this._pages);
        // Re-passing pages (P3 visibility rules will) must not teleport the
        // user back to screen one — keep the position, clamped to the new list.
        this.screenIndex = clampIndex(this.screenIndex, this._screens);
    }

    get opts() {
        return this.options || {};
    }

    get currentScreenList() {
        const screen = this._screens[this.screenIndex];
        return screen ? [screen] : [];
    }

    get currentSections() {
        const screen = this._screens[this.screenIndex];
        return screen ? [screen.section] : [];
    }

    get currentZones() {
        const screen = this._screens[this.screenIndex];
        return screen ? screen.zones : undefined;
    }

    get onLastScreen() {
        return isLastScreen(this.screenIndex, this._screens);
    }

    get showBackLink() {
        return this.screenIndex > 0;
    }

    get advanceLabel() {
        return this.opts.advanceLabel || 'Continue';
    }

    /** Continue while stepping; the Submit label on the final screen. */
    get primaryLabel() {
        return this.onLastScreen ? this.submitLabel || 'Submit' : this.advanceLabel;
    }

    get layoutClass() {
        return this.bleed ? 'oaat mode-bleed' : 'oaat';
    }

    get bodyClass() {
        return this.bleed ? 'oaat-body question-card' : 'oaat-body';
    }

    get actionRowClass() {
        return `action-row ${ARRANGE_CLASS[this.arrangement] || ARRANGE_CLASS['together-left']}`;
    }

    get showProgress() {
        return this.opts.showProgressBar !== false;
    }

    get showTopChrome() {
        return this.bleed && this.showProgress;
    }

    get showInlineProgress() {
        return !this.bleed && this.showProgress;
    }

    get progressFillStyle() {
        return `transform: scaleX(${progressFraction(this.screenIndex, this._screens)})`;
    }

    get progressText() {
        return `${this.screenIndex + 1} of ${this._screens.length}`;
    }

    get counterText() {
        return `${this.screenIndex + 1} / ${this._screens.length}`;
    }

    get keyboardAdvanceOn() {
        return this.opts.advanceTrigger === 'keyboard' && !isTouchOnly();
    }

    /** Plain muted words in our own voice — never a key-chip. */
    get keyboardHelperText() {
        if (!this.keyboardAdvanceOn) {
            return null;
        }
        return this.multilineFocus ? 'or press Ctrl+Enter' : 'or press Return';
    }

    get showHelperRow() {
        return Boolean(this.keyboardHelperText) && !this.onLastScreen;
    }

    handleKeydown(event) {
        if (!this.keyboardAdvanceOn || this.onLastScreen) {
            return;
        }
        const origin = event.composedPath ? event.composedPath()[0] : event.target;
        if (shouldAdvanceOnKey(event, origin)) {
            event.preventDefault();
            this._go(this.screenIndex + 1);
        }
    }

    handleFocusIn(event) {
        const origin = event.composedPath ? event.composedPath()[0] : event.target;
        this.multilineFocus = isMultilineTarget(origin);
    }

    handlePrimary() {
        if (this.onLastScreen) {
            this.dispatchEvent(new CustomEvent('submit'));
        } else {
            this._go(this.screenIndex + 1);
        }
    }

    handleBack() {
        this._go(this.screenIndex - 1);
    }

    _go(rawIndex) {
        const index = clampIndex(rawIndex, this._screens);
        if (index === this.screenIndex) {
            return;
        }
        const fromPage = this._screens[this.screenIndex].pageIndex;
        this.screenIndex = index;
        const toPage = this._screens[index].pageIndex;
        if (toPage !== fromPage) {
            this.dispatchEvent(
                new CustomEvent('pagechange', { detail: { index: toPage } })
            );
        }
        // Focus lands on the new screen (contract: focus moves on advance).
        requestAnimationFrame(() => {
            const panel = this.template.querySelector('.screen-panel');
            if (panel) {
                panel.focus();
            }
        });
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
