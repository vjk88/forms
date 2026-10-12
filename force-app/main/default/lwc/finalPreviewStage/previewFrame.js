/**
 * The Studio preview's frame model (stage 5 of the cross-host audit,
 * docs/FinalDesign/IMPL_PLAN_STAGE4_5_TYPED_FONT_AND_PREVIEW_FRAME.md). No DOM.
 *
 * A real page has two separate things the old frame mixed up: the SCREEN (what
 * CSS calls the viewport, 390 px on a phone) and the MARGIN the page the form
 * sits in leaves around it. The form is laid out at screen - 2 x margin, so its
 * container queries, theme padding and layout rules run against the width the
 * real page gives it. Nothing here hard-codes a form width.
 *
 * Margins measured 2026-10-11 on the same in-memory form (signed-out public
 * site, Lightning viewer tab); form width, answer column:
 *
 *   screen   public site     Lightning page
 *   320      290 / 238       264 / 212
 *   360      330 / 278       304 / 252
 *   390      360 / 308       334 / 282
 *   768      738 / 642       736 / 640
 *   1280     1250 / 688      1248 / 688
 *
 * The public site leaves 15 px a side at every width; Lightning leaves 28 px on
 * a phone (320, 360 and 390 alike) and 16 px at tablet and desktop.
 */

export const DEVICES = [
    { key: 'desktop', label: 'Desktop', width: 1280, height: 800 },
    { key: 'tablet', label: 'Tablet', width: 768, height: 1024 },
    { key: 'mobile', label: 'Mobile', width: 390, height: 844 }
];

/** The widths the Mobile device can take; heights are real phone screens. */
export const PHONES = [
    {
        key: '320',
        label: '320',
        width: 320,
        height: 568,
        title: 'Small phone, 320 px wide'
    },
    {
        key: '360',
        label: '360',
        width: 360,
        height: 800,
        title: 'Typical Android phone, 360 px wide'
    },
    {
        key: '390',
        label: '390',
        width: 390,
        height: 844,
        title: 'Typical iPhone, 390 px wide'
    }
];

/** px the host's page leaves on EACH side of the form, per kind of screen. */
export const HOSTS = [
    {
        key: 'public',
        label: 'Public site',
        margin: { desktop: 15, tablet: 15, mobile: 15 }
    },
    {
        key: 'lightning',
        label: 'Lightning page',
        margin: { desktop: 16, tablet: 16, mobile: 28 }
    },
    {
        key: 'none',
        label: 'Edge to edge',
        margin: { desktop: 0, tablet: 0, mobile: 0 }
    }
];

const DEFAULT_DEVICE = DEVICES[0];
const DEFAULT_PHONE = PHONES[PHONES.length - 1];
const DEFAULT_HOST = HOSTS[0];

const byKey = (list, key, fallback) =>
    list.find((item) => item.key === String(key)) || fallback;

/**
 * What a hand-off (the session the Studio keeps across Build and Design) may
 * carry, made safe: an unknown or missing key falls back on its own.
 */
export function normalizeFrame(session) {
    return {
        device: byKey(DEVICES, session?.device, DEFAULT_DEVICE).key,
        phone: byKey(PHONES, session?.phone, DEFAULT_PHONE).key,
        host: byKey(HOSTS, session?.host, DEFAULT_HOST).key
    };
}

/**
 * The frame for a choice: the screen's size, the host's margin on each side and
 * the width the form itself gets. The phone choice only matters on Mobile.
 */
export function resolveFrame(choice) {
    const { device, phone, host } = normalizeFrame(choice);
    const kind = byKey(DEVICES, device, DEFAULT_DEVICE);
    const screen =
        kind.key === 'mobile' ? byKey(PHONES, phone, DEFAULT_PHONE) : kind;
    const margin = byKey(HOSTS, host, DEFAULT_HOST).margin[kind.key];
    return {
        device: kind.key,
        phone,
        host,
        screenWidth: screen.width,
        screenHeight: screen.height,
        margin,
        formWidth: screen.width - 2 * margin
    };
}
