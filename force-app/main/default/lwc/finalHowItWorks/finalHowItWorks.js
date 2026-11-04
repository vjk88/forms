import { LightningElement, api } from 'lwc';

const STEPS = {
    autofill: [
        {
            key: 'open',
            title: 'Someone opens the form',
            text: 'From a link, a lookup, or while signed in.'
        },
        {
            key: 'read',
            title: 'We read one record',
            text: 'Only the fields you list, with the right access.'
        },
        {
            key: 'fill',
            title: 'Answers start filled in',
            text: 'They can still change any of them.'
        }
    ],
    mapping: [
        {
            key: 'submit',
            title: 'Someone submits',
            text: 'Their answers are always kept on the submission.'
        },
        {
            key: 'order',
            title: 'Records are made in order',
            text: 'Each one is found or created. A later record can point at an earlier one.'
        },
        {
            key: 'fill',
            title: 'Answers fill the fields',
            text: 'You pick which answer goes into each field.'
        }
    ]
};

/**
 * finalHowItWorks (DESIGN_SYSTEM 5.26): an info icon that sits by a dialog's
 * title. Hover, keyboard focus or a click shows the screen's idea in three
 * small steps; moving away, Tab out or Escape hides it. Nothing is stored, so
 * it can never be lost the way a dismissed strip was.
 */
export default class FinalHowItWorks extends LightningElement {
    /** Which screen: 'mapping' | 'autofill'. */
    @api topic = 'mapping';

    _open = false;
    /** Opened by a click: stays until clicked again, Escape or Tab out. */
    _pinned = false;

    get open() {
        return this._open;
    }

    /**
     * While the panel shows, Escape is heard first on the window (capture),
     * so it closes the panel even when hover opened it and focus is elsewhere,
     * and the dialog under it never hears that Escape.
     */
    set open(value) {
        const next = Boolean(value);
        if (next === this._open) {
            return;
        }
        this._open = next;
        if (next) {
            window.addEventListener('keydown', this._onWindowKeydown, true);
        } else {
            window.removeEventListener('keydown', this._onWindowKeydown, true);
        }
    }

    _onWindowKeydown = (event) => this.handleKeydown(event);

    disconnectedCallback() {
        window.removeEventListener('keydown', this._onWindowKeydown, true);
    }

    get steps() {
        const mapping = this.topic !== 'autofill';
        return (STEPS[this.topic] || STEPS.mapping).map((s, i) => ({
            ...s,
            isFirst: i === 0,
            isSecond: i === 1,
            isThird: i === 2,
            isMapping: mapping
        }));
    }

    get expanded() {
        return this.open ? 'true' : 'false';
    }

    handleEnter() {
        this.open = true;
    }

    handleLeave() {
        if (!this._pinned) {
            this.open = false;
        }
    }

    handleClick() {
        this._pinned = !this._pinned;
        this.open = this._pinned;
    }

    handleFocusIn() {
        this.open = true;
    }

    handleFocusOut(event) {
        if (!this.template.host.contains(event.relatedTarget)) {
            this._pinned = false;
            this.open = false;
        }
    }

    handleKeydown(event) {
        if (event.key === 'Escape' && this.open) {
            // Closes this panel only, never the dialog around it.
            event.preventDefault();
            event.stopImmediatePropagation();
            this._pinned = false;
            this.open = false;
        }
    }
}
