/* The standing phone-width check (docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md, slice 4).
 *
 *   node scripts/qa/phone-check.cjs --site https://<your-site>.my.site.com --form-id <Form__c Id>
 *
 * Loads a PUBLISHED, public form on the guest site as a signed-out visitor at
 * phone widths and asserts the numbers stage 3 fixed, so they cannot quietly
 * regress. Read-only: the form's spec is replaced IN MEMORY by a kitchen sink of
 * every question type, nothing is clicked, typed, submitted or saved.
 *
 * Per width (320, 360, 390 by default) and density (comfortable, compact):
 *   1. no sideways scroll;
 *   2. the answer column is at least 236px, which is five 44px buttons and four
 *      4px gaps (section cards and open sections both);
 *   3. every scale (rating 5 / 10, opinion scale 5 / 7 / 10, emoji faces, 0-10),
 *      standard and conversational: ONE ROW whenever its buttons fit, NO LONE
 *      last button, and CENTERED (a phone is a narrow form);
 *   4. every control of OURS is at least 44 x 44px, in every layout (wizard
 *      steps, tabbed pages, side rail, accordion, one at a time and split hero as
 *      well as the scrolling page); the scale checks (3) run on the scrolling
 *      page, where every question is on screen. The platform's own controls
 *      (text box, dropdown, radio and checkbox rows, toggle, help and calendar
 *      buttons) are listed with their sizes but never fail the check: no styling
 *      hook enlarges them the same way on every host (see
 *      docs/FinalDesign/qa/STAGE3_PLATFORM_CONTROLS_PROBE_2026-10-11.md).
 *
 * Exit code 0 = every check passed, 1 = a check failed, 2 = could not run.
 * Options: --widths 320,360,390  --densities comfortable,compact  --out <dir>
 * --layouts scroll,stepper,tabs,rail,accordion,oneAtATime,splitHero (the first
 * runs the full width x density matrix, the others the narrowest and widest width
 * at the first density).
 * (JSON per run; default: a temp folder). Needs the dev dependency playwright
 * and its Chromium (`npx playwright install chromium`).
 *
 *   node scripts/qa/phone-check.cjs --self-test
 * needs no browser and no org: it feeds the rules deliberately bad results and
 * fails unless every rule trips, so a check that can never fail cannot hide.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---- arguments ---------------------------------------------------------------
const arg = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const SELF_TEST = process.argv.includes('--self-test');
const SITE = (arg('site', process.env.PHONE_CHECK_SITE) || '').replace(
    /\/$/,
    ''
);
const FORM_ID = arg('form-id', process.env.PHONE_CHECK_FORM_ID);
const WIDTHS = arg('widths', '320,360,390').split(',').map(Number);
const DENSITIES = arg('densities', 'comfortable,compact').split(',');
const LAYOUTS = arg(
    'layouts',
    'scroll,stepper,tabs,rail,accordion,oneAtATime,splitHero'
).split(',');
const OUT = arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'phone-check-')));
if (!SELF_TEST && (!SITE || !FORM_ID)) {
    console.error(
        'Usage: node scripts/qa/phone-check.cjs --site https://<site>.my.site.com --form-id <Form__c Id of a published public form>\n' +
            '(or set PHONE_CHECK_SITE and PHONE_CHECK_FORM_ID)'
    );
    process.exit(2);
}

// ---- the kitchen sink (replaces the form's spec in memory) --------------------
const opt = (label, value) => ({ label, value });
const fld = (id, label, config, extra = {}) => ({
    id,
    type: 'field',
    label,
    binding: null,
    labelPosition: 'top',
    required: false,
    config,
    ...extra
});
const blk = (id, type, label, config = {}) => ({
    id,
    type,
    label,
    binding: null,
    required: false,
    config
});
const choices = [
    opt('First option', 'o1'),
    opt('Second option', 'o2'),
    opt('Third option', 'o3')
];
const scales = (convo) => ({
    id: convo ? 's_convo' : 's_scales',
    title: convo ? 'Scales, conversational look' : 'Scales',
    style: convo ? '' : 'card',
    columns: 1,
    convo,
    elements: [
        blk('r5', 'rating', 'Rating 5', {
            max: 5,
            leftLabel: 'Poor',
            rightLabel: 'Great'
        }),
        blk('r10', 'rating', 'Rating 10', { max: 10 }),
        blk('s5', 'scale', 'Opinion 5', {
            size: 5,
            leftLabel: 'Disagree',
            rightLabel: 'Agree'
        }),
        blk('s7', 'scale', 'Opinion 7', {
            size: 7,
            leftLabel: 'Disagree',
            rightLabel: 'Agree'
        }),
        blk('s10', 'scale', 'Opinion 10', { size: 10 }),
        blk('em', 'emojiScale', 'Emoji 5'),
        blk('nps', 'nps', 'Zero to ten', {
            leftLabel: 'Not likely',
            rightLabel: 'Extremely likely'
        })
    ]
});
const sections = () => [
    {
        id: 's_basics',
        title: 'Basics',
        style: 'card',
        columns: 1,
        elements: [
            fld(
                'e_text',
                'Text field',
                { inputType: 'text' },
                { required: true, help: 'Help text' }
            ),
            fld('e_email', 'Email field', { inputType: 'email' }),
            fld('e_date', 'Date field', { inputType: 'date' }),
            fld('e_area', 'Text area', { inputType: 'textarea' })
        ]
    },
    {
        id: 's_choices',
        title: 'Choices',
        style: '',
        columns: 1,
        elements: [
            fld('e_drop', 'Dropdown field', {
                inputType: 'picklist',
                renderAs: 'Dropdown',
                options: choices
            }),
            fld('e_radio', 'Radio group', {
                inputType: 'picklist',
                renderAs: 'Radio_Buttons',
                options: choices
            }),
            fld('e_chips', 'Chip choice', {
                inputType: 'picklist',
                renderAs: 'Radio_Buttons',
                options: choices,
                optionStyle: 'chips'
            }),
            fld('e_cards', 'Card choice', {
                inputType: 'picklist',
                renderAs: 'Radio_Buttons',
                options: choices,
                optionStyle: 'cards'
            }),
            fld('e_check', 'Single checkbox', { inputType: 'checkbox' }),
            fld('e_toggle', 'Toggle field', {
                inputType: 'checkbox',
                renderAs: 'Toggle'
            }),
            fld('e_slider', 'Slider field', {
                inputType: 'number',
                renderAs: 'Slider',
                slider: { min: 0, max: 100, step: 5 }
            })
        ]
    },
    scales(false),
    scales(true),
    {
        id: 's_more',
        title: 'More survey questions',
        style: 'card',
        columns: 1,
        elements: [
            blk('q_likert', 'likert', 'Likert question'),
            blk('q_yesno', 'yesNo', 'Yes or no', {
                yesLabel: 'Yes',
                noLabel: 'No'
            }),
            blk('q_rank', 'ranking', 'Ranking question', { options: choices }),
            blk('q_matrix', 'matrix', 'Matrix question', {
                rows: [opt('First statement', 'r1')]
            })
        ]
    }
];
/** The kitchen sink as three pages, so a layout with navigation (steps, tabs, rail) draws real navigation. */
const pages = () => {
    const [basics, choices, scalesStandard, scalesConvo, more] = sections();
    return [
        { id: 'pg1', name: 'About you', sections: [basics, choices] },
        { id: 'pg2', name: 'Scales', sections: [scalesStandard, scalesConvo] },
        { id: 'pg3', name: 'More', sections: [more] }
    ];
};
const mutate = (spec, density, layout) => {
    // a published guest spec carries pre-baked tokens that win over spec.theme
    delete spec.resolved;
    spec.theme = {
        name: 'editorialIvory',
        overrides: { density },
        source: 'builtin'
    };
    spec.header = {
        title: 'Phone width check',
        arrangement: 'stacked',
        style: 'standard'
    };
    spec.layout = {
        type: layout,
        maxWidth: 'medium',
        zonesDefault: { gap: 'md', arrangement: 'single' }
    };
    spec.pages = pages();
    delete spec.mapping;
};
const patchNode = (node, density, layout) => {
    if (typeof node === 'string') {
        if (
            node.startsWith('{') &&
            node.includes('"specVersion"') &&
            node.includes('"layout"')
        ) {
            try {
                const spec = JSON.parse(node);
                mutate(spec, density, layout);
                return JSON.stringify(spec);
            } catch {
                /* not a spec */
            }
        }
        return node;
    }
    if (Array.isArray(node)) {
        return node.map((n) => patchNode(n, density, layout));
    }
    if (node && typeof node === 'object') {
        if (node.specVersion !== undefined && Array.isArray(node.pages)) {
            mutate(node, density, layout);
            return node;
        }
        return Object.fromEntries(
            Object.entries(node).map(([k, v]) => [
                k,
                patchNode(v, density, layout)
            ])
        );
    }
    return node;
};

// ---- the measurements (run inside the page; pierce every shadow root) -----------
function measure() {
    const bfsAll = (root, pred) => {
        const queue = [root];
        const seen = new Set();
        const out = [];
        while (queue.length) {
            const n = queue.shift();
            if (!n || seen.has(n)) continue;
            seen.add(n);
            if (n.nodeType === 1 && pred(n)) out.push(n);
            if (n.shadowRoot) queue.push(...n.shadowRoot.childNodes);
            queue.push(...n.childNodes);
        }
        return out;
    };
    const tag = (n) => (n.tagName || '').toLowerCase();
    const hostOf = (n) => {
        const p = n.parentNode;
        return p && p.nodeType === 11 ? p.host : p;
    };
    const viewer = bfsAll(
        document.body,
        (n) => tag(n) === 'c-final-form-viewer'
    )[0];
    if (!viewer)
        return {
            error: 'no form viewer on the page (is the form published and public?)'
        };
    const px = (v) => parseFloat(v);
    const r1 = (v) => Math.round(v * 10) / 10;

    // 1. the answer column: the first visible text box
    const input = bfsAll(
        viewer,
        (n) => tag(n) === 'input' && n.type === 'text'
    ).find((n) => n.getBoundingClientRect().width > 20);
    const answerColumn = input ? r1(input.getBoundingClientRect().width) : null;

    // 1b. the page's own margin beside the form (what the Studio's "Public site" preview frame draws)
    const viewerBox = viewer.getBoundingClientRect();
    const sideMargin = [
        r1(viewerBox.left),
        r1(document.documentElement.clientWidth - viewerBox.right)
    ];

    // 2. scales
    const labelOf = (row) => {
        for (let n = row, i = 0; n && i < 14; n = hostOf(n), i++) {
            if (n.classList && n.classList.contains('field')) {
                const l = n.querySelector('.field-label');
                return l
                    ? l.textContent
                          .replace(/\s+/g, ' ')
                          .replace(/^\*\s*/, '')
                          .trim()
                    : '?';
            }
        }
        return '?';
    };
    const fieldOf = (row) => {
        for (let n = row, i = 0; n && i < 14; n = hostOf(n), i++) {
            if (n.classList && n.classList.contains('field')) return n;
        }
        return null;
    };
    const conversational = (row) => {
        for (let n = row, i = 0; n && i < 20; n = hostOf(n), i++) {
            if (n.classList && n.classList.contains('sec-convo')) return true;
        }
        return false;
    };
    const scalesOut = [];
    for (const row of bfsAll(
        viewer,
        (n) => n.classList && n.classList.contains('scale-row')
    )) {
        const field = fieldOf(row);
        if (!field) continue;
        const buttons = Array.from(row.children).filter(
            (b) => tag(b) === 'button'
        );
        const gap = px(getComputedStyle(row).columnGap) || 0;
        const available = px(getComputedStyle(field).width);
        const widths = buttons.map((b) => px(getComputedStyle(b).width));
        const need =
            widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
        const tops = [];
        for (const b of buttons) {
            const t = Math.round(b.getBoundingClientRect().top);
            const known = tops.find((x) => Math.abs(x.t - t) < 3);
            if (known) known.n++;
            else tops.push({ t, n: 1 });
        }
        tops.sort((a, b) => a.t - b.t);
        const rowRect = row.getBoundingClientRect();
        const fieldRect = field.getBoundingClientRect();
        scalesOut.push({
            name: `${labelOf(row)}${conversational(row) ? ' (conversational)' : ''}`,
            rows: tops.map((x) => x.n),
            fitsOneRow: need <= available + 0.01,
            lone:
                buttons.length > 1 &&
                tops.length > 1 &&
                tops[tops.length - 1].n === 1,
            centerOff: r1(
                rowRect.left +
                    rowRect.width / 2 -
                    (fieldRect.left + fieldRect.width / 2)
            ),
            need: r1(need),
            available: r1(available)
        });
    }

    // 3. every button and slider, ours (no lightning-* ancestor) and the platform's
    const inPlatform = (n) => {
        let found = '';
        for (let p = hostOf(n), i = 0; p && i < 30; p = hostOf(p), i++) {
            if (p.nodeType === 1 && tag(p).startsWith('lightning-'))
                found = tag(p);
        }
        return found;
    };
    const own = {};
    const platform = {};
    const targets = bfsAll(
        viewer,
        (n) =>
            tag(n) === 'button' ||
            (tag(n) === 'input' &&
                [
                    'range',
                    'text',
                    'checkbox',
                    'radio',
                    'date',
                    'email'
                ].includes(n.type)) ||
            tag(n) === 'textarea'
    );
    for (const n of targets) {
        const cs = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        if (
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            r.width <= 3 ||
            r.height <= 3
        )
            continue;
        const host = inPlatform(n);
        // a platform radio or checkbox is hit through its label, not its 1px input
        const box = { w: r1(r.width), h: r1(r.height) };
        const name =
            host ||
            (n.className && typeof n.className === 'string'
                ? n.className.split(/\s+/)[0]
                : tag(n)) ||
            tag(n);
        const bucket = host ? platform : own;
        if (
            !bucket[name] ||
            Math.min(box.w, box.h) < Math.min(bucket[name].w, bucket[name].h)
        )
            bucket[name] = box;
    }
    return {
        vw: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        answerColumn,
        sideMargin,
        scales: scalesOut,
        own,
        platform
    };
}

// ---- the rules (pure: --self-test feeds them bad results) -------------------------
const MIN_COLUMN = 236;
const MIN_TARGET = 43.5;
// What the public site's own page leaves beside the form. The Studio's preview frame draws the same
// number (previewFrame.js, HOSTS "public"); if this fails, the preview is lying again: update both.
const PAGE_MARGIN = 15;

/**
 * The failures of one measured run, as readable sentences. Scales are only
 * required where every question is on screen (the scrolling page): a layout that
 * shows one page at a time cannot show them all.
 */
function evaluate(run, result, requireScales = true) {
    if (result.error) {
        return [`${run}: ${result.error}`];
    }
    const out = [];
    const fail = (message) => out.push(`${run}: ${message}`);
    if (result.scrollWidth > result.vw) {
        fail(
            `sideways scroll (page ${result.scrollWidth}px wide on a ${result.vw}px screen)`
        );
    }
    if (result.answerColumn === null || result.answerColumn < MIN_COLUMN) {
        fail(`answer column ${result.answerColumn}px, needs ${MIN_COLUMN}`);
    }
    if (
        !result.sideMargin ||
        result.sideMargin.some((m) => Math.abs(m - PAGE_MARGIN) > 0.5)
    ) {
        fail(
            `the site leaves ${result.sideMargin} px beside the form, the Studio's "Public site" preview frame draws ${PAGE_MARGIN} px (previewFrame.js)`
        );
    }
    if (requireScales && !result.scales.length) {
        fail('no scale found');
    }
    for (const s of result.scales) {
        if (s.fitsOneRow && s.rows.length > 1) {
            fail(
                `${s.name} wraps (${s.rows.join(' + ')}) though it fits one row (needs ${s.need}px of ${s.available}px)`
            );
        }
        if (s.lone) {
            fail(`${s.name} ends in a lone button (${s.rows.join(' + ')})`);
        }
        if (Math.abs(s.centerOff) > 1.5) {
            fail(`${s.name} is ${s.centerOff}px off center`);
        }
    }
    for (const [name, box] of Object.entries(result.own)) {
        if (Math.min(box.w, box.h) < MIN_TARGET) {
            fail(
                `our control "${name}" is ${box.w} x ${box.h}px, needs 44 x 44`
            );
        }
    }
    return out;
}

function selfTest() {
    const good = () => ({
        vw: 320,
        scrollWidth: 320,
        answerColumn: 238,
        sideMargin: [15, 15],
        scales: [
            {
                name: 'Rating 5',
                rows: [5],
                fitsOneRow: true,
                lone: false,
                centerOff: 0,
                need: 236,
                available: 238
            }
        ],
        own: { 'scale-chip': { w: 44, h: 44 } },
        platform: {}
    });
    const bad = {
        'sideways scroll': (r) => {
            r.scrollWidth = 455;
        },
        'a narrow answer column': (r) => {
            r.answerColumn = 190;
        },
        'a page margin the Studio frame does not draw': (r) => {
            r.sideMargin = [5, 5];
        },
        'no scale found': (r) => {
            r.scales = [];
        },
        'a row that fits but wraps': (r) => {
            Object.assign(r.scales[0], { rows: [4, 1], fitsOneRow: true });
        },
        'a lone button': (r) => {
            Object.assign(r.scales[0], {
                rows: [4, 1],
                fitsOneRow: false,
                lone: true
            });
        },
        'a scale off center': (r) => {
            r.scales[0].centerOff = 12;
        },
        'a 36px button of ours': (r) => {
            r.own['scale-chip'] = { w: 36, h: 36 };
        },
        'a 34px arrow of ours': (r) => {
            r.own['rank-btn'] = { w: 34, h: 34 };
        },
        'a page that did not render': (r) => {
            Object.keys(r).forEach((k) => delete r[k]);
            r.error = 'no form viewer';
        }
    };
    const problems = [];
    if (evaluate('good', good()).length) {
        problems.push('a clean result was reported as failing');
    }
    const noScales = good();
    noScales.scales = [];
    if (evaluate('one page at a time', noScales, false).length) {
        problems.push(
            'a layout that shows one page was failed for having no scales on screen'
        );
    }
    const tinyDot = good();
    tinyDot.own['step-btn'] = { w: 12, h: 12 };
    if (!evaluate('wizard steps', tinyDot, false).length) {
        problems.push(
            'a 12px step dot was NOT caught in a layout without scales'
        );
    }
    for (const [name, breakIt] of Object.entries(bad)) {
        const result = good();
        breakIt(result);
        if (!evaluate(name, result).length) {
            problems.push(`"${name}" was NOT caught`);
        }
    }
    if (problems.length) {
        console.error(`self-test FAILED:\n - ${problems.join('\n - ')}`);
        process.exit(1);
    }
    console.log(
        `self-test OK: a clean result passes and all ${Object.keys(bad).length} deliberately bad ones fail.`
    );
}

// ---- run ------------------------------------------------------------------------
const failures = [];

async function check(browser, width, density, layout) {
    const run = `${layout} ${width}px ${density}`;
    const context = await browser.newContext({
        viewport: { width, height: 2200 }
    });
    const page = await context.newPage();
    await page.route(/webruntime\/api\/apex\/execute/, async (route) => {
        const body = route.request().postData() || '';
        if (!/getGuestRuntimeSpec/.test(body))
            return route.continue().catch(() => {});
        try {
            const response = await route.fetch();
            const patched = JSON.stringify(
                patchNode(JSON.parse(await response.text()), density, layout)
            );
            return await route.fulfill({ response, body: patched });
        } catch {
            return route.abort().catch(() => {});
        }
    });
    await page.goto(`${SITE}/form?formId=${FORM_ID}`, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
    });
    await page
        .locator('.field-label, .sec-title')
        .first()
        .waitFor({ state: 'attached', timeout: 90000 })
        .catch(() => {});
    await page.waitForTimeout(4000);
    const result = await page.evaluate(measure);
    await context.close();
    fs.writeFileSync(
        path.join(OUT, `phone-${layout}-${width}-${density}.json`),
        JSON.stringify(result, null, 2)
    );
    failures.push(...evaluate(run, result, layout === 'scroll'));
    if (result.error) {
        return;
    }
    const sizes = (bucket) =>
        Object.entries(bucket)
            .map(([n, b]) => `${n.replace('lightning-', '')} ${b.w}x${b.h}`)
            .join(', ');
    const rows = result.scales.length
        ? `, ${result.scales.length} scale rows [${result.scales.map((s) => s.rows.join('+')).join(' ')}]`
        : '';
    console.log(`  ${run}: column ${result.answerColumn}px${rows}`);
    console.log(`      ours (smallest): ${sizes(result.own)}`);
    console.log(
        `      platform (informational, never fails): ${sizes(result.platform)}`
    );
}

async function main() {
    let chromium;
    try {
        ({ chromium } = require('playwright'));
    } catch (error) {
        console.error(
            'Playwright is not installed. Run `npm ci` and `npx playwright install chromium`.\n' +
                error.message
        );
        process.exit(2);
    }
    const browser = await chromium.launch({ headless: true });
    console.log(
        `phone-check: ${SITE}/form?formId=${FORM_ID}  layouts ${LAYOUTS.join(',')}  widths ${WIDTHS.join(',')}  densities ${DENSITIES.join(',')}`
    );
    try {
        for (const [index, layout] of LAYOUTS.entries()) {
            // the first layout gets the full matrix; the others the narrowest and
            // widest width at the first density (their navigation does not change
            // with the density)
            const densities = index === 0 ? DENSITIES : DENSITIES.slice(0, 1);
            const widths =
                index === 0
                    ? WIDTHS
                    : [Math.min(...WIDTHS), Math.max(...WIDTHS)];
            for (const density of densities) {
                for (const width of widths) {
                    // one page load per run, in order
                    // eslint-disable-next-line no-await-in-loop
                    await check(browser, width, density, layout);
                }
            }
        }
    } finally {
        await browser.close();
    }
    if (failures.length) {
        console.error(
            `\nFAILED (${failures.length}):\n - ${failures.join('\n - ')}\n\nResults: ${OUT}`
        );
        process.exit(1);
    }
    console.log(`\nOK: every check passed. Results: ${OUT}`);
}

if (SELF_TEST) {
    selfTest();
} else {
    main().catch((error) => {
        console.error(error);
        process.exit(2);
    });
}
