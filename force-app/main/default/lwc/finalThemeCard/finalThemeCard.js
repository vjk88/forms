import { LightningElement, api } from 'lwc';
import { getBuiltinTheme } from 'c/finalThemeCatalog';
import { resolveTokens, tokensToStyle } from 'c/finalThemeEngine';

/**
 * finalThemeCard — one theme preview card (ported from formStudio's formThemeCard).
 *
 * The preview is a lightweight CSS mock driven ENTIRELY by the theme's resolved
 * `--c-*` tokens (no live form engine per card). Unlike the old build, the mock's
 * SHAPE follows the `layout` handed in by the gallery (the step-1 choice), not the
 * theme's own affinity — so every theme previews in the layout you picked. Logo
 * emblem + font pairing are intentionally dropped (owner).
 */

// Sample brand copy per theme — pure personality for the mock (matches the
// theme-comparison.html identities). Falls back to a generic lockup.
const BRAND = {
    editorialIvory: { title: 'The Gazette', subtitle: 'Subscribe to our weekly print edition.' },
    nordic: { title: 'Pre-Flight Manifest', subtitle: 'Verify passenger and crew credentials.' },
    neoBrutalism: { title: 'Creator Application', subtitle: 'Apply for the early access program.' },
    dracula: { title: 'Central Core Uplink', subtitle: 'Authorize security token to sync.' },
    terracotta: { title: 'Workshop Registry', subtitle: 'Join our pottery classes in Austin.' },
    forest: { title: 'Ranger Application', subtitle: 'Register for conservation patrols.' },
    slate: { title: 'Customs Declaration', subtitle: 'Declare global freight manifests.' },
    tokyo: { title: 'Node Connection', subtitle: 'Enter credentials for terminal 4-G.' },
    sandstone: { title: 'Guest Concierge', subtitle: 'Submit preferences for your stay.' },
    terminal: { title: 'SYSOP Authentication', subtitle: 'INPUT SECURE TOKENS FOR ACCESS.' },
    lavender: { title: 'Patient Admittance', subtitle: 'Provide medical information.' },
    execNav: { title: 'Corporate Onboarding', subtitle: 'Complete compliance checklists.' },
    startupNav: { title: 'API Key Generation', subtitle: 'Generate production credentials.' },
    mintStepper: { title: 'Developer Setup', subtitle: 'Initialize environment parameters.' },
    retroStepper: { title: 'Bootloader Wizard', subtitle: 'Mounting virtual system image.' },
    snowStepper: { title: 'Flight Check-in', subtitle: 'Confirm seat assignments.' },
    marbleSplit: { title: 'VIP Lounge Sign-in', subtitle: 'Enter the luxury rewards portal.' },
    cyberSplit: { title: 'Infiltration Gate', subtitle: 'Establishing remote SSH session.' },
    claySplit: { title: 'Artisan Membership', subtitle: 'Receive special discounts and invites.' },
    botanicalSplit: { title: 'Forest Preservation', subtitle: 'Join our carbon offsets program.' },
    auraSplit: { title: 'Artist Portfolio', subtitle: 'Upload your creative submissions.' },
    sunsetDunes: { title: 'Desert Expedition', subtitle: 'Book a luxury guided safari.' },
    forestMist: { title: 'Retreat Enrollment', subtitle: 'Escape to our off-grid cabins.' },
    marbleLuxury: { title: 'Exhibition RSVP', subtitle: 'Reserve private viewing passes.' },
    carbonMatrix: { title: 'Threat Assessment', subtitle: 'File an infrastructure hazard report.' },
    oceanBreeze: { title: 'Dive Charter Signup', subtitle: 'Confirm rental and experience level.' },
    cosmicVortex: { title: 'Telescope Booking', subtitle: 'Reserve time on deep-space optics.' },
    desertOasis: { title: 'Booking Request', subtitle: 'Check availability for canvas tents.' },
    vintagePaper: { title: 'Literary Submission', subtitle: 'Send poems or short stories.' },
    auroraBorealis: { title: 'Expedition Registry', subtitle: 'Register scientific equipment.' },
    silkLuxury: { title: 'Atelier Booking', subtitle: 'Schedule a custom fitting.' }
};

/** Final layout → one of the three mock shapes the card can draw. */
function mockShape(layout) {
    if (layout === 'splitHero') return 'split';
    if (layout === 'stepper') return 'stepped';
    return 'classic';
}

export default class FinalThemeCard extends LightningElement {
    @api themeKey;
    @api label;
    @api description;
    /** The layout picked in step 1 — drives the mock's SHAPE. */
    @api layout = 'scroll';
    @api selected = false;

    get _theme() {
        return getBuiltinTheme(this.themeKey) || {};
    }

    get _pal() {
        return this._theme.palette || {};
    }

    /** Every --c-* the mock reads, as an inline style string. */
    get tokenStyle() {
        try {
            return tokensToStyle(resolveTokens(this._theme));
        } catch (e) {
            return '';
        }
    }

    get shape() {
        return mockShape(this.layout);
    }
    get isSplit() {
        return this.shape === 'split';
    }
    get isStepped() {
        return this.shape === 'stepped';
    }

    get hasBanner() {
        const h = this._pal.headerBg;
        return Boolean(h) && h !== 'transparent' && h !== 'none';
    }

    get brand() {
        return (
            BRAND[this.themeKey] || {
                title: 'Registration',
                subtitle: 'Tell us a little about yourself.'
            }
        );
    }

    get swatches() {
        const p = this._pal;
        return [
            ['Accent', p.accent],
            ['Surface', p.contentBg],
            ['Page', p.pageBg],
            ['Text', p.text]
        ].map(([name, val], i) => ({
            key: `${name}-${i}`,
            name,
            style: `background:${val || '#cccccc'};`
        }));
    }

    get rootClass() {
        return this.selected ? 'tc is-on' : 'tc';
    }
    get pressed() {
        return this.selected ? 'true' : 'false';
    }

    _emit() {
        this.dispatchEvent(
            new CustomEvent('select', { detail: { themeKey: this.themeKey } })
        );
    }
    handleClick() {
        this._emit();
    }
    handleKey(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._emit();
        }
    }
}
