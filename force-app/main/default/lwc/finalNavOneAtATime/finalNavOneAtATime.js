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
 * One SECTION per screen on the shared finalStepFlow engine. The Advance
 * Trigger is THIS primitive's own control (the sanctioned submitBar
 * exception) — but the final screen renders the actions slot instead, so
 * Submit still comes from the one shared bar.
 *
 * Signature distance (owner): advance label defaults to "Continue"; the
 * keyboard feature is "Keyboard advance" with plain muted helper text
 * ("or press Return" / "or press Ctrl+Enter"), never a key-chip; touch
 * devices hide the helper entirely; choice inputs never auto-advance.
 * Focus moves to the new screen on advance (a11y contract).
 */
export default class FinalNavOneAtATime extends LightningElement {
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Spec layout.options: { advanceTrigger, advanceLabel, showProgressBar, backLinkStyle } */
    @api options;

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
        this.screenIndex = 0;
    }

    get opts() {
        return this.options || {};
    }

    get screens() {
        return this._screens;
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

    get backIsArrow() {
        return this.opts.backLinkStyle === 'arrow';
    }

    get advanceLabel() {
        return this.opts.advanceLabel || 'Continue';
    }

    get showProgress() {
        return this.opts.showProgressBar !== false;
    }

    get progressFillStyle() {
        return `transform: scaleX(${progressFraction(this.screenIndex, this._screens)})`;
    }

    get progressText() {
        return `${this.screenIndex + 1} of ${this._screens.length}`;
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

    handleAdvance() {
        this._go(this.screenIndex + 1);
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
}
