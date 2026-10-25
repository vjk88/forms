import { LightningElement, api, track } from 'lwc';
import { listThemeFamilies, getBuiltinTheme } from 'c/finalThemeCatalog';
import { resolveTokens } from 'c/finalThemeEngine';
import { localizeAssetUrl } from 'c/finalThemeAssets';

/**
 * finalThemeGallery — the "Pick a theme" step (ported from formStudio's
 * formCreationGallery theme step), shared by the Studio's "Change…" picker
 * and the creation gallery.
 *
 * One card per theme FAMILY (IMPL_PLAN_THEME_FAMILIES). Under a family with
 * several looks sits a row of dots, one per variant:
 *   - choosing a dot (click, or the arrow keys inside the row) changes ONLY
 *     the preview: no event, so the creation gallery doesn't move on a step
 *     and the Design panel doesn't touch the form;
 *   - activating the preview card (click, Enter, Space) picks the variant it
 *     shows and emits `themeselect` { themeKey }, exactly as a card always has.
 * A card opens on the form's current theme when it is in that family.
 *
 * The `layout` picked in step 1 drives every card's preview SHAPE, and the
 * "Preview in" switcher re-previews the roster in any layout without leaving
 * the step; a dot's choice survives the switch.
 */

// "Preview in" chips — the 8 step-1 choices (7 layouts + splitHero's
// Conversational pane-flow variant, keyed `layout:paneFlow`).
const LAYOUTS = [
    { value: 'scroll', label: 'Scroll' },
    { value: 'stepper', label: 'Stepper' },
    { value: 'tabs', label: 'Tabs' },
    { value: 'accordion', label: 'Accordion' },
    { value: 'rail', label: 'Rail' },
    { value: 'oneAtATime', label: 'One at a time' },
    { value: 'splitHero', label: 'Split hero' },
    { value: 'splitHero:oneAtATime', label: 'Split · One at a time' }
];

// A dot shows its variant's photo, or its page colour beside its accent.
const dotStyles = new Map();
function dotStyle(key) {
    if (!dotStyles.has(key)) {
        let style = 'background:var(--c-studio-border);';
        try {
            const t = resolveTokens(getBuiltinTheme(key), null);
            const photos = [t['--c-page-bg-image'], t['--c-header-bg-image']]
                .map((v) => /url\([^)]*\)/.exec(v || ''))
                .filter(Boolean);
            style = photos.length
                ? `background-image:${localizeAssetUrl(photos[0][0])};background-size:cover;background-position:center;`
                : `background:linear-gradient(135deg, ${t['--c-page-bg']} 0 50%, ${t['--c-accent']} 50% 100%);`;
        } catch {
            // an unknown key keeps the neutral chip
        }
        dotStyles.set(key, style);
    }
    return dotStyles.get(key);
}

export default class FinalThemeGallery extends LightningElement {
    /** Layout picked in step 1 — the default preview shape. */
    @api layout = 'scroll';
    /** splitHero pane flow picked in step 1 ('oneAtATime' → conversational). */
    @api paneFlow = '';
    @api selectedThemeKey = '';

    @track _previewKey = '';
    /** Local pick (an @api prop must not be reassigned); wins over the prop. */
    @track _pickedThemeKey = '';
    /** Family key → the variant its card is showing (a dot's choice). */
    @track _shown = {};

    get previewKey() {
        if (this._previewKey) {
            return this._previewKey;
        }
        const base = this.layout || 'scroll';
        return this.paneFlow ? `${base}:${this.paneFlow}` : base;
    }
    get previewLayout() {
        return this.previewKey.split(':')[0];
    }
    get previewPaneFlow() {
        return this.previewKey.split(':')[1] || '';
    }

    get layoutChips() {
        return LAYOUTS.map((l) => ({
            ...l,
            cls: this.previewKey === l.value ? 'lchip is-on' : 'lchip'
        }));
    }

    get families() {
        const sel = this._pickedThemeKey || this.selectedThemeKey;
        return listThemeFamilies().map((f) => {
            const keys = f.members.map((m) => m.key);
            const shownKey =
                this._shown[f.key] || (keys.includes(sel) ? sel : keys[0]);
            const shown = f.members.find((m) => m.key === shownKey);
            const many = f.members.length > 1;
            return {
                key: f.key,
                themeKey: shown.key,
                label: shown.name,
                description: many
                    ? `${f.name} · ${f.members.length} looks`
                    : f.name,
                selected: shown.key === sel,
                many,
                groupLabel: `${f.name} looks`,
                // after a dot moved away from the form's look, say which is theirs
                yours:
                    keys.includes(sel) && shownKey !== sel
                        ? `Yours: ${f.members.find((m) => m.key === sel).name}`
                        : '',
                dots: f.members.map((m) => {
                    const on = m.key === shownKey;
                    const current = m.key === sel;
                    let cls = on ? 'fam-dot is-on' : 'fam-dot';
                    if (current) {
                        cls += ' is-current';
                    }
                    return {
                        key: m.key,
                        name: current
                            ? `${m.name}, your current theme`
                            : m.name,
                        title: m.name,
                        checked: on ? 'true' : 'false',
                        tabindex: on ? '0' : '-1',
                        cls,
                        style: dotStyle(m.key)
                    };
                })
            };
        });
    }

    handleLayout(e) {
        this._previewKey = e.currentTarget.dataset.value;
    }

    /** A dot changes only the preview: no event. */
    handleDot(e) {
        const { family, key } = e.currentTarget.dataset;
        this._show(family, key);
    }

    /** Arrow keys (and Home/End) move through a family's dots. */
    handleDotKey(e) {
        const { family, key } = e.currentTarget.dataset;
        const f = listThemeFamilies().find((x) => x.key === family);
        const keys = f ? f.members.map((m) => m.key) : [];
        const i = keys.indexOf(key);
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            next = keys[(i + 1) % keys.length];
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            next = keys[(i - 1 + keys.length) % keys.length];
        } else if (e.key === 'Home') {
            next = keys[0];
        } else if (e.key === 'End') {
            next = keys[keys.length - 1];
        }
        if (!next) {
            return;
        }
        e.preventDefault();
        this._show(family, next);
        this._focusDot = { family, key: next };
    }

    renderedCallback() {
        if (this._focusDot) {
            const { family, key } = this._focusDot;
            this._focusDot = null;
            const dot = this.template.querySelector(
                `.fam-dot[data-family="${family}"][data-key="${key}"]`
            );
            if (dot) {
                dot.focus();
            }
        }
    }

    _show(family, key) {
        this._shown = { ...this._shown, [family]: key };
    }

    /** Activating a card picks the variant it shows. */
    handleSelect(e) {
        this._pickedThemeKey = e.detail.themeKey;
        this.dispatchEvent(
            new CustomEvent('themeselect', {
                detail: { themeKey: e.detail.themeKey }
            })
        );
    }
}
