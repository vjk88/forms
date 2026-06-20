import { LightningElement, api } from 'lwc';
import { themeVars, resolveTheme, FONT_PAIRINGS } from 'c/formThemes';
import { getLogoUrl, getContrastRatio, getBackgroundHex } from 'c/brandEmblem';

const COMPANY_BRAND_MAP = {
    nordic: { name: 'AeroSpace', title: 'Pre-Flight Manifest', subtitle: 'Verify passenger and crew credentials.' },
    neoBrutalism: { name: 'Gumroad Inc.', title: 'Creator Application', subtitle: 'Apply for the early access billing program.' },
    dracula: { name: 'Cyberdyne Systems', title: 'Central Core Uplink', subtitle: 'Authorize security token to initiate sync.' },
    terracotta: { name: 'Clay & Co.', title: 'Workshop Registry', subtitle: 'Join our pottery classes in Austin, TX.' },
    forest: { name: 'EcoProtect', title: 'Ranger Application', subtitle: 'Register for seasonal conservation patrols.' },
    slate: { name: 'Acme Logistics', title: 'Customs Declaration', subtitle: 'Declare global freight and cargo manifests.' },
    tokyo: { name: 'NetSec Division', title: 'Node Connection', subtitle: 'Enter credentials for terminal 4-G.' },
    sandstone: { name: 'Dunes Resort', title: 'Guest Concierge', subtitle: 'Submit preferences for your desert stay.' },
    terminal: { name: 'Mainframe 88', title: 'SYSOP Authentication', subtitle: 'INPUT SECURE TOKENS FOR KERNEL ACCESS.' },
    lavender: { name: 'Apex Health', title: 'Patient Admittance', subtitle: 'Provide medical information prior to arrival.' },
    mintStepper: { name: 'Veloce Coding', title: 'Developer Setup', subtitle: 'Initialize developer environment parameters.' },
    retroStepper: { name: 'Vax Host', title: 'Bootloader Wizard', subtitle: 'Mounting virtual system image sectors.' },
    snowStepper: { name: 'Alta Air', title: 'Flight Check-in', subtitle: 'Confirm seat assignments and baggage.' },
    marbleSplit: { name: 'Aurelia Jewelers', title: 'VIP Lounge Sign-in', subtitle: 'Enter luxury rewards portal.' },
    cyberSplit: { name: 'Specter Net', title: 'Infiltration Gate', subtitle: 'Establishing remote SSH session.' },
    claySplit: { name: 'Terracotta Boutique', title: 'Artisan Membership', subtitle: 'Receive special discounts and invites.' },
    botanicalSplit: { name: 'Green Canopy', title: 'Forest Preservation', subtitle: 'Join our carbon offsets program.' },
    execNav: { name: 'Stark Finance', title: 'Corporate Onboarding', subtitle: 'Complete employee compliance checklists.' },
    startupNav: { name: 'Prism AI', title: 'API Key Generation', subtitle: 'Generate production credentials.' },
    auraSplit: { name: 'Aura Studio', title: 'Artist Portfolio', subtitle: 'Upload your creative collection submissions.' },
    sunsetDunes: { name: 'Solaris Journeys', title: 'Desert Expedition', subtitle: 'Book a luxury guided safari across Dunes.' },
    forestMist: { name: 'Evergreen Lodge', title: 'Retreat Enrollment', subtitle: 'Escape the city in our off-grid cabins.' },
    marbleLuxury: { name: 'Helsinki Fine Arts', title: 'Exhibition RSVP', subtitle: 'Reserve private viewing passes.' },
    carbonMatrix: { name: 'Securitas Corp', title: 'Threat Assessment', subtitle: 'File a physical infrastructure hazard report.' },
    oceanBreeze: { name: 'Reef Explorers', title: 'Dive Charter Signup', subtitle: 'Confirm equipment rental and experience level.' },
    cosmicVortex: { name: 'StarGaze', title: 'Telescope Booking', subtitle: 'Reserve viewing time on deep space optics.' },
    desertOasis: { name: 'Sahara Glamping', title: 'Booking Request', subtitle: 'Check availability for luxury canvas tents.' },
    vintagePaper: { name: 'The Typist Café', title: 'Literary Submission', subtitle: 'Send poems or short stories for our zine.' },
    auroraBorealis: { name: 'Polar Research', title: 'Expedition Registry', subtitle: 'Register scientific equipment for cold storage.' },
    silkLuxury: { name: 'Maison de Rose', title: 'Atelier Booking', subtitle: 'Schedule custom fittings with our design team.' }
};

/**
 * c/formThemeCard — a single, elegant theme preview card.
 * The brand/logo engine (getLogoUrl + contrast helpers) now lives in the shared
 * c/brandEmblem module so the live form (c/formViewer) draws identical emblems.
 */
export default class FormThemeCard extends LightningElement {
    @api themeId;
    @api skinId;
    @api accent = '';
    @api label;
    @api description;
    @api selected = false;

    get _opts() {
        return this.accent ? { accent: this.accent } : undefined;
    }
    
    get tokenStyle() {
        try {
            return themeVars(this.themeId, this.skinId, this._opts);
        } catch (e) {
            return '';
        }
    }
    
    get _resolved() {
        try {
            return resolveTheme(this.themeId, this.skinId, this._opts) || {};
        } catch (e) {
            return {};
        }
    }
    
    get hasBanner() {
        const h = this._resolved.headerBg;
        return !!h && h !== 'transparent' && h !== 'none';
    }
    
    get rootClass() {
        return this.selected ? 'tc is-on' : 'tc';
    }
    
    get pressed() {
        return this.selected ? 'true' : 'false';
    }
    
    get swatches() {
        const t = this._resolved;
        return [
            ['Accent', t.accent || '#6366f1'],
            ['Surface', t.surface || '#ffffff'],
            ['Page', t.pageBg || '#f3f4f6'],
            ['Text', t.text || '#16325c']
        ].map(([name, val], i) => ({ key: `${name}-${i}`, name, style: `background:${val};` }));
    }

    // Dynamic brand mapping
    get brand() {
        return COMPANY_BRAND_MAP[this.themeId] || {
            name: 'Company',
            title: 'Registration',
            subtitle: 'Tell us a little about yourself'
        };
    }

    get displayFont() {
        const fontKey = this._resolved.font || 'salesforce';
        const pairing = FONT_PAIRINGS[fontKey] || {};
        return pairing.display || 'system-ui';
    }

    // Layout identification
    get isSplitLayout() {
        return this._resolved.layout === 'split';
    }

    get isSteppedLayout() {
        return this._resolved.layout === 'stepped';
    }

    // Arrangement identification
    get isArrangementInline() {
        return this._resolved.headerArrangement === 'inline';
    }

    get isArrangementLogoBeside() {
        return this._resolved.headerArrangement === 'logoBeside';
    }

    get showLogo() {
        return !!this._resolved.logoType && this._resolved.headerArrangement !== 'textOnly';
    }

    // Highlights
    get highlightText() {
        return this._resolved.headerHighlight || '';
    }

    get highlightHtml() {
        return !!this.highlightText;
    }

    // Dynamic Logo URLs (with contrast checking)
    get targetLogoUrl() {
        const theme = this._resolved;
        if (!theme.logoType) return '';
        const bg = theme.surface || '#ffffff';
        const txt = theme.text || '#16325c';
        const acc = theme.accent || '#6366f1';
        return this.computeLogoUrl(theme.logoType, bg, txt, acc);
    }

    get targetLogoUrlBanner() {
        const theme = this._resolved;
        if (!theme.logoType) return '';
        const bg = theme.headerBg || theme.surface || '#ffffff';
        const txt = theme.headerText || theme.text || '#16325c';
        const acc = theme.accent || '#6366f1';
        return this.computeLogoUrl(theme.logoType, bg, txt, acc);
    }

    get targetLogoUrlSplit() {
        const theme = this._resolved;
        if (!theme.logoType) return '';
        const bg = theme.headerBg || theme.accent || '#6366f1';
        const txt = theme.headerText || '#ffffff';
        const acc = theme.accent || '#6366f1';
        return this.computeLogoUrl(theme.logoType, bg, txt, acc);
    }

    computeLogoUrl(logoType, bgValue, textColor, accentColor) {
        const isComplexBg = bgValue && (bgValue.includes('url(') || bgValue.includes('gradient') || bgValue.includes('-gradient'));
        let emblemColor = accentColor;
        if (isComplexBg) {
            emblemColor = textColor;
        } else {
            const bgHex = getBackgroundHex(bgValue, textColor);
            const contrast = getContrastRatio(accentColor, bgHex);
            if (contrast < 3.5) {
                emblemColor = textColor;
            }
        }
        return getLogoUrl(logoType, emblemColor, textColor, this.brand.name, this.displayFont);
    }

    // Highlight styles
    get highlightStyle() {
        return 'background: color-mix(in srgb, var(--c-accent) 10%, transparent); color: var(--c-accent); border-left: 3px solid var(--c-accent);';
    }

    get highlightBannerStyle() {
        return 'background: rgba(255, 255, 255, 0.15); color: var(--c-header-text, #ffffff); border-left: 3px solid rgba(255, 255, 255, 0.3);';
    }

    get highlightSplitStyle() {
        return 'background: rgba(255, 255, 255, 0.15); color: var(--c-header-text, #ffffff); border-left: 3px solid rgba(255, 255, 255, 0.3);';
    }

    _emit() {
        this.dispatchEvent(new CustomEvent('select', { detail: { themeId: this.themeId } }));
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
