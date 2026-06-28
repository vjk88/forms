/**
 * c/layoutModel — pure functions over the Layout Spec (LAYOUT_SPEC.md).
 *
 * Contract: PHASE1_WORKPLAN.md §2.1 (FROZEN). No DOM, no Apex, no mutation
 * of inputs. This module is the single client-side implementation of:
 *   - validateSpec   schema + semantic checks (mirrors Apex validator)
 *   - normalize      orphan rule (§5): nothing ever disappears
 *   - materialize    preset fill rules (archetype boards §4)
 *   - applyOps       AI/designer semantic ops (§10)
 *   - rebaseOps      re-target ops after the base spec changed (copilot §7)
 */
import {
    PRESETS, REGISTRY, FILL_RULES, CORE_ARCHETYPES,
    LAYOUT_GROUPS, LAYOUT_LABELS, ARCHETYPE_ALIAS, resolveArchetype
} from './presets';

export {
    PRESETS, REGISTRY, FILL_RULES, CORE_ARCHETYPES,
    LAYOUT_GROUPS, LAYOUT_LABELS, ARCHETYPE_ALIAS, resolveArchetype
};

// ---------------------------------------------------------------- constants
export const SPEC_VERSION = 1;
export const LIMITS = {
    maxBytes: 32768,
    maxPages: 20,
    maxZonesPerPage: 6,
    maxChildrenPerZone: 8,
    maxNodesPerPage: 30,
    maxStackSections: 15,
    maxTrackSections: 10,
    maxOpsPerPatch: 15,
    maxKeyLength: 80,
    maxArchetypeLength: 40
};

const ENUMS = {
    nav: ['scroll', 'stepper', 'tabs', 'sidenav', 'oneAtATime', 'accordion'],
    stepperPlacement: ['top', 'rail'],
    stepperMode: ['vertical', 'horizontal', 'progress'],
    chrome: ['card', 'fullbleed', 'paper'],
    maxWidth: ['narrow', 'medium', 'wide', 'full'],
    header: ['standard', 'hero', 'minimal', 'none'],
    progress: ['auto', 'bar', 'dots', 'fraction', 'none'],
    density: ['comfortable', 'compact'],
    panelSide: ['left', 'right', 'top'],
    panelContent: ['logo', 'title', 'description', 'progress', 'image', 'props', 'quote'],
    submitPlacement: ['flow', 'auto', 'stickyBottom', 'brandPanel'],
    submitAlignment: ['left', 'center', 'right', 'stretch'],
    collapseBelow: ['480px', '768px', '1024px'],
    collapseOrder: ['source', 'mainFirst']
};

const SHELL_KEYS = ['nav', 'stepperPlacement', 'stepperMode', 'chrome', 'maxWidth', 'header', 'progress', 'brandPanel', 'submit'];
const PANEL_KEYS = ['side', 'width', 'content', 'sticky'];
const SUBMIT_KEYS = ['placement', 'alignment'];
const SPEC_KEYS = ['version', 'archetype', 'density', 'shell', 'pages', 'responsive'];
const PAGE_KEYS = ['pageKey', 'grid', 'zones'];
const ZONE_KEYS = ['type', 'span', 'sticky', 'children'];
const COLUMNS_KEYS = ['type', 'ratio', 'tracks'];
const STACK_KEYS = ['type', 'sections'];
const RESPONSIVE_KEYS = ['collapseBelow', 'collapseOrder'];
const PANEL_WIDTH_RE = /^(2[5-9]|3[0-9]|4[0-9]|50)%$/;

export const OP_TYPES = [
    'setArchetype', 'setShell', 'setDensity', 'moveSection',
    'splitColumns', 'mergeToStack', 'setZones', 'setTheme'
];

// ------------------------------------------------------------------ helpers
const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isStr = (v, max) => typeof v === 'string' && v.length > 0 && (!max || v.length <= max);

function err(errors, code, path, message) {
    errors.push({ code, path, message });
}

function checkKeys(errors, obj, allowed, path) {
    Object.keys(obj).forEach((k) => {
        if (!allowed.includes(k)) err(errors, 'unknown-key', `${path}.${k}`, `Unknown key "${k}"`);
    });
}

function checkEnum(errors, value, allowed, path) {
    if (value !== undefined && !allowed.includes(value)) {
        err(errors, 'invalid-enum', path, `"${value}" not in [${allowed.join(', ')}]`);
    }
}

// ------------------------------------------------------------- validateSpec
/**
 * @param {object} spec
 * @returns {{ ok: boolean, errors: Array<{code, path, message}> }}
 */
export function validateSpec(spec) {
    const errors = [];
    if (!isObj(spec)) return { ok: false, errors: [{ code: 'not-object', path: '$', message: 'Spec must be an object' }] };

    if (JSON.stringify(spec).length > LIMITS.maxBytes) {
        err(errors, 'too-large', '$', `Spec exceeds ${LIMITS.maxBytes} bytes`);
    }
    checkKeys(errors, spec, SPEC_KEYS, '$');
    if (spec.version !== SPEC_VERSION) err(errors, 'bad-version', '$.version', `version must be ${SPEC_VERSION}`);
    if (!isStr(spec.archetype, LIMITS.maxArchetypeLength)) err(errors, 'bad-archetype', '$.archetype', 'archetype required (string ≤ 40)');
    checkEnum(errors, spec.density, ENUMS.density, '$.density');

    validateShell(errors, spec.shell);
    validatePages(errors, spec.pages);

    if (spec.responsive !== undefined) {
        if (!isObj(spec.responsive)) err(errors, 'bad-responsive', '$.responsive', 'responsive must be an object');
        else {
            checkKeys(errors, spec.responsive, RESPONSIVE_KEYS, '$.responsive');
            checkEnum(errors, spec.responsive.collapseBelow, ENUMS.collapseBelow, '$.responsive.collapseBelow');
            checkEnum(errors, spec.responsive.collapseOrder, ENUMS.collapseOrder, '$.responsive.collapseOrder');
        }
    }
    return { ok: errors.length === 0, errors };
}

function validateShell(errors, shell) {
    if (!isObj(shell)) { err(errors, 'bad-shell', '$.shell', 'shell required'); return; }
    checkKeys(errors, shell, SHELL_KEYS, '$.shell');
    if (!ENUMS.nav.includes(shell.nav)) err(errors, 'invalid-enum', '$.shell.nav', `nav required, one of [${ENUMS.nav.join(', ')}]`);
    checkEnum(errors, shell.stepperMode, ENUMS.stepperMode, '$.shell.stepperMode');
    if (shell.stepperMode !== undefined && shell.nav !== 'stepper') {
        err(errors, 'incompatible', '$.shell.stepperMode', 'stepperMode only valid with nav: stepper');
    }
    checkEnum(errors, shell.stepperPlacement, ENUMS.stepperPlacement, '$.shell.stepperPlacement');
    if (shell.stepperPlacement !== undefined && shell.nav !== 'stepper') {
        err(errors, 'incompatible', '$.shell.stepperPlacement', 'stepperPlacement only valid with nav: stepper');
    }
    checkEnum(errors, shell.chrome, ENUMS.chrome, '$.shell.chrome');
    checkEnum(errors, shell.maxWidth, ENUMS.maxWidth, '$.shell.maxWidth');
    checkEnum(errors, shell.header, ENUMS.header, '$.shell.header');
    checkEnum(errors, shell.progress, ENUMS.progress, '$.shell.progress');

    const bp = shell.brandPanel;
    if (bp !== undefined && bp !== null) {
        if (!isObj(bp)) err(errors, 'bad-panel', '$.shell.brandPanel', 'brandPanel must be an object or null');
        else {
            checkKeys(errors, bp, PANEL_KEYS, '$.shell.brandPanel');
            if (!ENUMS.panelSide.includes(bp.side)) err(errors, 'invalid-enum', '$.shell.brandPanel.side', 'side required: left|right|top');
            if (bp.width !== undefined && !PANEL_WIDTH_RE.test(bp.width)) err(errors, 'bad-width', '$.shell.brandPanel.width', 'width must be 25%–50%');
            if (bp.content !== undefined) {
                if (!Array.isArray(bp.content) || bp.content.length > 7) err(errors, 'bad-content', '$.shell.brandPanel.content', 'content: array, max 7');
                else bp.content.forEach((c, i) => checkEnum(errors, c, ENUMS.panelContent, `$.shell.brandPanel.content[${i}]`));
            }
            if (bp.sticky !== undefined && typeof bp.sticky !== 'boolean') err(errors, 'bad-type', '$.shell.brandPanel.sticky', 'sticky must be boolean');
        }
    }
    const sub = shell.submit;
    if (sub !== undefined) {
        if (!isObj(sub)) err(errors, 'bad-submit', '$.shell.submit', 'submit must be an object');
        else {
            checkKeys(errors, sub, SUBMIT_KEYS, '$.shell.submit');
            checkEnum(errors, sub.placement, ENUMS.submitPlacement, '$.shell.submit.placement');
            checkEnum(errors, sub.alignment, ENUMS.submitAlignment, '$.shell.submit.alignment');
        }
    }
}

function validatePages(errors, pages) {
    if (!Array.isArray(pages) || pages.length < 1 || pages.length > LIMITS.maxPages) {
        err(errors, 'bad-pages', '$.pages', `pages: array of 1–${LIMITS.maxPages}`);
        return;
    }
    const pageKeys = new Set();
    const sectionKeys = new Set();
    pages.forEach((page, pi) => {
        const p = `$.pages[${pi}]`;
        if (!isObj(page)) { err(errors, 'bad-page', p, 'page must be an object'); return; }
        checkKeys(errors, page, PAGE_KEYS, p);
        if (!isStr(page.pageKey, LIMITS.maxKeyLength)) err(errors, 'bad-key', `${p}.pageKey`, 'pageKey required (string ≤ 80)');
        else if (pageKeys.has(page.pageKey)) err(errors, 'duplicate-key', `${p}.pageKey`, `duplicate pageKey "${page.pageKey}"`);
        else pageKeys.add(page.pageKey);
        if (page.grid !== undefined && page.grid !== 12) err(errors, 'bad-grid', `${p}.grid`, 'grid must be 12');

        if (!Array.isArray(page.zones) || page.zones.length < 1 || page.zones.length > LIMITS.maxZonesPerPage) {
            err(errors, 'bad-zones', `${p}.zones`, `zones: array of 1–${LIMITS.maxZonesPerPage}`);
            return;
        }
        let nodeCount = 0;
        page.zones.forEach((zone, zi) => {
            nodeCount += 1 + validateZone(errors, zone, `${p}.zones[${zi}]`, sectionKeys);
        });
        if (nodeCount > LIMITS.maxNodesPerPage) err(errors, 'too-many-nodes', `${p}`, `page exceeds ${LIMITS.maxNodesPerPage} nodes`);
    });
}

/** @returns number of child nodes (for the per-page node cap) */
function validateZone(errors, zone, path, sectionKeys) {
    if (!isObj(zone) || zone.type !== 'zone') { err(errors, 'bad-node', path, 'expected { type: "zone" }'); return 0; }
    checkKeys(errors, zone, ZONE_KEYS, path);
    if (!isInt(zone.span) || zone.span < 1 || zone.span > 12) err(errors, 'bad-span', `${path}.span`, 'span: integer 1–12');
    if (zone.sticky !== undefined && typeof zone.sticky !== 'boolean') err(errors, 'bad-type', `${path}.sticky`, 'sticky must be boolean');
    if (!Array.isArray(zone.children) || zone.children.length < 1 || zone.children.length > LIMITS.maxChildrenPerZone) {
        err(errors, 'bad-children', `${path}.children`, `children: array of 1–${LIMITS.maxChildrenPerZone}`);
        return 0;
    }
    zone.children.forEach((child, ci) => validateChild(errors, child, `${path}.children[${ci}]`, sectionKeys));
    return zone.children.length;
}

function validateChild(errors, child, path, sectionKeys) {
    if (!isObj(child)) { err(errors, 'bad-node', path, 'child must be an object'); return; }
    if (child.type === 'stack') {
        checkKeys(errors, child, STACK_KEYS, path);
        if (!Array.isArray(child.sections) || child.sections.length > LIMITS.maxStackSections) {
            err(errors, 'bad-sections', `${path}.sections`, `sections: array, max ${LIMITS.maxStackSections}`);
            return;
        }
        child.sections.forEach((s, si) => addSectionKey(errors, s, `${path}.sections[${si}]`, sectionKeys));
    } else if (child.type === 'columns') {
        checkKeys(errors, child, COLUMNS_KEYS, path);
        const ratioOk = Array.isArray(child.ratio) && child.ratio.length >= 2 && child.ratio.length <= 4
            && child.ratio.every((r) => isInt(r) && r >= 1 && r <= 3);
        if (!ratioOk) err(errors, 'bad-ratio', `${path}.ratio`, 'ratio: 2–4 integers of 1–3');
        if (!Array.isArray(child.tracks) || (ratioOk && child.tracks.length !== child.ratio.length)) {
            err(errors, 'ratio-tracks-mismatch', `${path}.tracks`, 'tracks length must equal ratio length');
            return;
        }
        child.tracks.forEach((track, ti) => {
            if (!Array.isArray(track) || track.length > LIMITS.maxTrackSections) {
                err(errors, 'bad-track', `${path}.tracks[${ti}]`, `track: array, max ${LIMITS.maxTrackSections}`);
                return;
            }
            track.forEach((s, si) => addSectionKey(errors, s, `${path}.tracks[${ti}][${si}]`, sectionKeys));
        });
    } else {
        err(errors, 'bad-node-type', path, `unknown node type "${child.type}" (columns may not nest)`);
    }
}

function addSectionKey(errors, key, path, sectionKeys) {
    if (!isStr(key, LIMITS.maxKeyLength)) { err(errors, 'bad-key', path, 'section key must be string ≤ 80'); return; }
    if (sectionKeys.has(key)) err(errors, 'duplicate-section', path, `section "${key}" placed more than once`);
    else sectionKeys.add(key);
}

// ---------------------------------------------------------------- traversal
function eachContainer(spec, fn) {
    spec.pages.forEach((page) => {
        page.zones.forEach((zone, zi) => {
            zone.children.forEach((child, ci) => {
                if (child.type === 'stack') fn({ page, zone, child, list: child.sections, zi, ci, ti: null });
                else child.tracks.forEach((track, ti) => fn({ page, zone, child, list: track, zi, ci, ti }));
            });
        });
    });
}

function collectPlacedKeys(spec) {
    const keys = new Set();
    eachContainer(spec, ({ list }) => list.forEach((k) => keys.add(k)));
    return keys;
}

/** In-order section keys per pageKey, derived from the spec tree. */
function sectionsByPage(spec) {
    const map = new Map();
    spec.pages.forEach((page) => map.set(page.pageKey, []));
    eachContainer(spec, ({ page, list }) => map.get(page.pageKey).push(...list));
    return map;
}

function removeSectionKey(spec, sectionKey) {
    let removed = false;
    eachContainer(spec, ({ list }) => {
        const i = list.indexOf(sectionKey);
        if (i !== -1) { list.splice(i, 1); removed = true; }
    });
    return removed;
}

function emptyPage(pageKey) {
    return { pageKey, grid: 12, zones: [{ type: 'zone', span: 12, children: [{ type: 'stack', sections: [] }] }] };
}

function lastStackOfPage(page) {
    const lastZone = page.zones[page.zones.length - 1];
    const lastChild = lastZone.children[lastZone.children.length - 1];
    if (lastChild.type === 'stack') return lastChild.sections;
    const stack = { type: 'stack', sections: [] };
    lastZone.children.push(stack);
    return stack.sections;
}

// -------------------------------------------------------------- materialize
/**
 * Build a spec from an archetype preset + the form's pages/sections.
 * @param {string} presetId  key of PRESETS
 * @param {Array<{key:string, order?:number}>} pages
 * @param {Array<{key:string, pageKey:string, order?:number}>} sections
 * @returns {object} a spec that passes validateSpec (throws on bad presetId)
 */
export function materialize(presetId, pages, sections) {
    const canonical = resolveArchetype(presetId);
    const preset = PRESETS[canonical];
    if (!preset) throw new Error(`Unknown preset "${presetId}"`);
    const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
    const sortedPages = [...pages].sort(byOrder);
    const sortedSections = [...sections].sort(byOrder);

    const spec = {
        version: SPEC_VERSION,
        archetype: canonical,
        density: preset.density,
        shell: clone(preset.shell),
        pages: sortedPages.map((page) => {
            const keys = sortedSections.filter((s) => s.pageKey === page.key).map((s) => s.key);
            return preset.fill === FILL_RULES.MOSAIC ? mosaicPage(page.key, keys) : stackPage(page.key, keys);
        }),
        responsive: clone(preset.responsive)
    };
    const { ok, errors } = validateSpec(spec);
    if (!ok) throw new Error(`materialize produced invalid spec: ${errors.map((e) => e.message).join('; ')}`);
    return spec;
}

function stackPage(pageKey, keys) {
    return { pageKey, grid: 12, zones: [{ type: 'zone', span: 12, children: [{ type: 'stack', sections: keys }] }] };
}

/** Mosaic board fill rule: first two → 1:1 columns; middle → stack; last → sticky span-4 zone. */
function mosaicPage(pageKey, keys) {
    if (keys.length < 3) {
        if (keys.length === 2) {
            return { pageKey, grid: 12, zones: [{ type: 'zone', span: 12, children: [{ type: 'columns', ratio: [1, 1], tracks: [[keys[0]], [keys[1]]] }] }] };
        }
        return stackPage(pageKey, keys);
    }
    const [first, second, ...rest] = keys;
    const last = rest.pop();
    const mainChildren = [{ type: 'columns', ratio: [1, 1], tracks: [[first], [second]] }];
    if (rest.length) mainChildren.push({ type: 'stack', sections: rest });
    return {
        pageKey, grid: 12,
        zones: [
            { type: 'zone', span: 8, children: mainChildren },
            { type: 'zone', span: 4, sticky: true, children: [{ type: 'stack', sections: [last] }] }
        ]
    };
}

// ---------------------------------------------------------------- normalize
/**
 * Orphan rule (LAYOUT_SPEC §5): reconcile a spec against actual data.
 * Nothing user-visible ever disappears; mismatches become warnings.
 * @returns {{ spec: object, warnings: Array<{code, message, key?}> }}
 */
export function normalize(spec, pages, sections) {
    const out = clone(spec);
    const warnings = [];
    const dataPageKeys = new Set(pages.map((p) => p.key));
    const dataSectionKeys = new Set(sections.map((s) => s.key));

    // 1. Drop spec pages that no longer exist in data.
    out.pages = out.pages.filter((page) => {
        if (dataPageKeys.has(page.pageKey)) return true;
        warnings.push({ code: 'page-unknown', key: page.pageKey, message: `Spec page "${page.pageKey}" not in data — dropped` });
        return false;
    });

    // 2. Drop section refs that no longer exist in data.
    eachContainer(out, ({ list }) => {
        for (let i = list.length - 1; i >= 0; i--) {
            if (!dataSectionKeys.has(list[i])) {
                warnings.push({ code: 'section-unknown', key: list[i], message: `Spec section "${list[i]}" not in data — dropped` });
                list.splice(i, 1);
            }
        }
    });

    // 3. Append data pages missing from the spec.
    const specPageKeys = new Set(out.pages.map((p) => p.pageKey));
    [...pages].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((p) => {
        if (!specPageKeys.has(p.key)) {
            out.pages.push(emptyPage(p.key));
            specPageKeys.add(p.key);
            warnings.push({ code: 'page-added', key: p.key, message: `Data page "${p.key}" missing from spec — appended` });
        }
    });
    if (out.pages.length === 0) out.pages.push(emptyPage('p_default'));

    // 4. Append unplaced data sections to their page's last stack.
    const placed = collectPlacedKeys(out);
    const pageByKey = new Map(out.pages.map((p) => [p.pageKey, p]));
    [...sections].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((s) => {
        if (placed.has(s.key)) return;
        const page = pageByKey.get(s.pageKey) || out.pages[out.pages.length - 1];
        lastStackOfPage(page).push(s.key);
        warnings.push({ code: 'section-orphan-appended', key: s.key, message: `Section "${s.key}" not in spec — appended to page "${page.pageKey}"` });
    });

    return { spec: out, warnings };
}

// ------------------------------------------------------------------ applyOps
/**
 * Apply semantic ops (LAYOUT_SPEC §10). All-or-nothing: any invalid op or an
 * invalid resulting spec rejects the WHOLE patch and returns the input spec.
 * `setTheme` ops are not spec mutations; they're returned in themeOps for the
 * caller to route to the Theme Spec.
 * @returns {{ spec: object, themeOps: Array, errors: Array }}
 */
export function applyOps(spec, ops) {
    const errors = [];
    const themeOps = [];
    if (!Array.isArray(ops) || ops.length === 0) {
        return { spec, themeOps, errors: [{ code: 'no-ops', message: 'ops must be a non-empty array' }] };
    }
    if (ops.length > LIMITS.maxOpsPerPatch) {
        return { spec, themeOps, errors: [{ code: 'too-many-ops', message: `max ${LIMITS.maxOpsPerPatch} ops per patch` }] };
    }
    let work = clone(spec);

    for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const fail = (code, message) => errors.push({ code, opIndex: i, op: op && op.op, message });
        if (!isObj(op) || !OP_TYPES.includes(op.op)) { fail('unknown-op', `Unknown op "${op && op.op}"`); break; }

        if (op.op === 'setTheme') { themeOps.push(op); continue; }
        const result = applyOne(work, op, fail);
        if (errors.length) break;
        if (result) work = result; // setArchetype replaces the whole spec
    }

    if (!errors.length) {
        const v = validateSpec(work);
        if (!v.ok) v.errors.forEach((e) => errors.push({ code: e.code, message: `result invalid: ${e.message}`, path: e.path }));
    }
    return errors.length ? { spec, themeOps: [], errors } : { spec: work, themeOps, errors };
}

function locate(spec, op, fail) {
    const page = spec.pages.find((p) => p.pageKey === op.pageKey || (op.target && p.pageKey === op.target.pageKey));
    if (!page) { fail('invalid-target', `page "${op.pageKey || (op.target && op.target.pageKey)}" not found`); return null; }
    const t = op.target || op;
    const zone = page.zones[t.zoneIndex];
    if (!zone) { fail('invalid-target', `zoneIndex ${t.zoneIndex} out of range`); return null; }
    if (t.childIndex === undefined) return { page, zone };
    const child = zone.children[t.childIndex];
    if (!child) { fail('invalid-target', `childIndex ${t.childIndex} out of range`); return null; }
    return { page, zone, child };
}

function applyOne(spec, op, fail) {
    switch (op.op) {
        case 'setArchetype': {
            if (!PRESETS[resolveArchetype(op.archetype)]) { fail('invalid-target', `unknown archetype "${op.archetype}"`); return null; }
            // Re-materialize from the current tree: lossless re-placement.
            const byPage = sectionsByPage(spec);
            const pages = spec.pages.map((p, i) => ({ key: p.pageKey, order: i }));
            const sections = [];
            let order = 0;
            byPage.forEach((keys, pageKey) => keys.forEach((key) => sections.push({ key, pageKey, order: order++ })));
            const next = materialize(op.archetype, pages, sections);
            next.responsive = spec.responsive ? clone(spec.responsive) : next.responsive;
            return next;
        }
        case 'setShell': {
            if (!isObj(op.patch)) { fail('invalid-target', 'setShell requires patch object'); return null; }
            spec.shell = { ...spec.shell, ...clone(op.patch) };
            // null patch values delete optional keys (e.g. remove brandPanel)
            Object.keys(spec.shell).forEach((k) => { if (spec.shell[k] === null && k !== 'brandPanel') delete spec.shell[k]; });
            return null;
        }
        case 'setDensity':
            if (!ENUMS.density.includes(op.density)) { fail('invalid-target', `bad density "${op.density}"`); return null; }
            spec.density = op.density;
            return null;
        case 'moveSection': {
            if (!isStr(op.sectionKey) || !isObj(op.target)) { fail('invalid-target', 'moveSection requires sectionKey + target'); return null; }
            const loc = locate(spec, op, fail);
            if (!loc || !loc.child) { if (loc) fail('invalid-target', 'target childIndex required'); return null; }
            if (!removeSectionKey(spec, op.sectionKey)) { fail('invalid-target', `section "${op.sectionKey}" not found`); return null; }
            if (loc.child.type === 'stack') {
                const pos = op.target.position === undefined ? loc.child.sections.length : op.target.position;
                loc.child.sections.splice(Math.min(pos, loc.child.sections.length), 0, op.sectionKey);
            } else {
                const track = loc.child.tracks[op.target.trackIndex || 0];
                if (!track) { fail('invalid-target', `trackIndex ${op.target.trackIndex} out of range`); return null; }
                track.push(op.sectionKey);
            }
            return null;
        }
        case 'splitColumns': {
            const ci = op.target ? op.target.childIndex : op.childIndex;
            if (ci === undefined) { fail('invalid-target', 'splitColumns requires childIndex'); return null; }
            const loc = locate(spec, op, fail);
            if (!loc) return null;
            if (!loc.child) { fail('invalid-target', `childIndex ${ci} out of range`); return null; }
            if (loc.child.type !== 'stack') { fail('invalid-target', 'splitColumns target must be a stack'); return null; }
            const ratio = op.ratio;
            if (!Array.isArray(ratio) || ratio.length < 2 || ratio.length > 4) { fail('invalid-target', 'ratio must have 2–4 entries'); return null; }
            let pool = [...loc.child.sections];
            if (Array.isArray(op.distribute) && op.distribute.length) {
                const bad = op.distribute.find((k) => !pool.includes(k));
                if (bad) { fail('invalid-target', `distribute key "${bad}" not in target stack`); return null; }
                pool = [...op.distribute, ...pool.filter((k) => !op.distribute.includes(k))];
            }
            const tracks = ratio.map(() => []);
            const per = Math.ceil(pool.length / ratio.length) || 1;
            pool.forEach((k, i) => tracks[Math.min(Math.floor(i / per), ratio.length - 1)].push(k));
            loc.zone.children[ci] = { type: 'columns', ratio: clone(ratio), tracks };
            return null;
        }
        case 'mergeToStack': {
            const ci = op.target ? op.target.childIndex : op.childIndex;
            if (ci === undefined) { fail('invalid-target', 'mergeToStack requires childIndex'); return null; }
            const loc = locate(spec, op, fail);
            if (!loc) return null;
            if (!loc.child) { fail('invalid-target', `childIndex ${ci} out of range`); return null; }
            if (loc.child.type !== 'columns') { fail('invalid-target', 'mergeToStack target must be columns'); return null; }
            loc.zone.children[ci] = { type: 'stack', sections: loc.child.tracks.flat() };
            return null;
        }
        case 'setZones': {
            const page = spec.pages.find((p) => p.pageKey === op.pageKey);
            if (!page) { fail('invalid-target', `page "${op.pageKey}" not found`); return null; }
            const spans = op.spans;
            if (!Array.isArray(spans) || spans.length < 1 || spans.length > LIMITS.maxZonesPerPage
                || !spans.every((s) => isInt(s) && s >= 1 && s <= 12)) {
                fail('invalid-target', 'spans must be 1–6 integers of 1–12'); return null;
            }
            // Redistribute existing children across the new zones, in order,
            // in even chunks; surplus zones get an empty stack.
            const children = page.zones.flatMap((z) => z.children);
            const per = Math.ceil(children.length / spans.length) || 1;
            page.zones = spans.map((span, zi) => {
                const slice = children.slice(zi * per, (zi + 1) * per);
                return {
                    type: 'zone', span,
                    ...(op.stickyLast && zi === spans.length - 1 ? { sticky: true } : {}),
                    children: slice.length ? slice : [{ type: 'stack', sections: [] }]
                };
            });
            return null;
        }
        default:
            fail('unknown-op', `Unhandled op "${op.op}"`);
            return null;
    }
}

// ----------------------------------------------------------------- rebaseOps
/**
 * Re-target ops against a changed base spec (COPILOT_PANEL §7 rebase-or-keep).
 * Keeps ops whose targets still resolve; reports the rest as conflicts.
 * @returns {{ ops: Array, conflicts: Array<{op, reason}> }}
 */
export function rebaseOps(ops, oldSpec, newSpec) {
    const kept = [];
    const conflicts = [];
    const placed = collectPlacedKeys(newSpec);
    const pageKeys = new Set(newSpec.pages.map((p) => p.pageKey));

    (ops || []).forEach((op) => {
        const conflict = (reason) => conflicts.push({ op, reason });
        switch (op && op.op) {
            case 'setArchetype':
            case 'setShell':
            case 'setDensity':
            case 'setTheme':
                kept.push(op); // global ops never conflict
                return;
            case 'moveSection': {
                if (!placed.has(op.sectionKey)) { conflict(`section "${op.sectionKey}" no longer exists`); return; }
                if (!resolvesTo(newSpec, op.target, 'stack-or-columns')) { conflict('target container no longer exists'); return; }
                kept.push(op);
                return;
            }
            case 'splitColumns':
                if (!resolvesTo(newSpec, op, 'stack')) { conflict('target stack no longer exists'); return; }
                if (Array.isArray(op.distribute) && op.distribute.some((k) => !placed.has(k))) { conflict('a distributed section no longer exists'); return; }
                kept.push(op);
                return;
            case 'mergeToStack':
                if (!resolvesTo(newSpec, op, 'columns')) { conflict('target columns no longer exists'); return; }
                kept.push(op);
                return;
            case 'setZones':
                if (!pageKeys.has(op.pageKey)) { conflict(`page "${op.pageKey}" no longer exists`); return; }
                kept.push(op);
                return;
            default:
                conflict(`unknown op "${op && op.op}"`);
        }
    });
    return { ops: kept, conflicts };
}

function resolvesTo(spec, target, expected) {
    const t = target.target || target;
    const page = spec.pages.find((p) => p.pageKey === t.pageKey);
    if (!page) return false;
    const zone = page.zones[t.zoneIndex];
    if (!zone) return false;
    const child = zone.children[t.childIndex];
    if (!child) return false;
    if (expected === 'stack') return child.type === 'stack';
    if (expected === 'columns') return child.type === 'columns';
    return true;
}
