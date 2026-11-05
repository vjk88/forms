/**
 * finalPdfModel — what a PDF of a form says, before anything is drawn
 * (IMPL_PLAN_FORM_PDF §4.3).
 *
 * Three sources, one output shape:
 *   - buildFormDocument({ mode: 'answers' }) — a respondent's copy, from the
 *     spec they filled in and the payload that was just submitted;
 *   - buildFormDocument({ mode: 'blank' })   — the form itself, printable,
 *     with empty answer areas (Studio);
 *   - buildReaderDocument()                  — a stored submission, from the
 *     rows c/finalSubmissionReader already shows (so screen and paper agree).
 *
 * Output: `{ title, description, brandName, logo, banner, metaLines,
 * footerNote, blocks }` where `blocks` is a FLAT list the writer paginates.
 * Every string here is final wording; the writer never reads the spec.
 *
 * Answers are words, never stored keys: choices go through the version's own
 * option list (c/finalAnswerText, the same resolver the reader uses), scales
 * through c/finalSurveyPoints (the same points the renderer draws).
 *
 * Pure: no DOM, no Apex.
 */
import {
    answerLines,
    choiceOptions,
    formatDateTime,
    labelOf,
    optionLabel
} from 'c/finalAnswerText';
import { likertPoints, matrixPoints, scaleBounds } from 'c/finalSurveyPoints';

const NO_ANSWER = 'No answer';

/** Element types that hold no answer. */
const CONTENT_TYPES = new Set([
    'richText',
    'image',
    'divider',
    'spacer',
    'callout',
    'emptySpace',
    'video',
    'map',
    'hero'
]);

const SCALE_TYPES = new Set(['nps', 'rating', 'scale', 'emojiScale']);

export { answerLines };

// ------------------------------------------------------------ rich text --

const ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    bull: '•',
    copy: '©',
    reg: '®',
    trade: '™'
};

function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
        if (code[0] === '#') {
            const n =
                code[1] === 'x' || code[1] === 'X'
                    ? parseInt(code.slice(2), 16)
                    : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000
                ? String.fromCodePoint(n)
                : '';
        }
        const hit = ENTITIES[code.toLowerCase()];
        return hit === undefined ? m : hit;
    });
}

const BLOCK_TAGS = new Set([
    'p',
    'div',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'section',
    'article',
    'tr'
]);

/**
 * Rich text (the author's own HTML) as paragraphs of styled runs:
 * `[{ runs: [{ text, bold }], bullet, heading }]`. Tags are read, never
 * rendered; anything unknown is text-transparent. Links keep their words.
 */
export function richTextParagraphs(html) {
    if (!html || typeof html !== 'string') {
        return [];
    }
    const paragraphs = [];
    let current = null;
    let bold = 0;
    const listStack = [];
    const start = (extra) => {
        current = { runs: [], bullet: null, heading: false, ...extra };
    };
    const flush = () => {
        if (current) {
            const text = current.runs
                .map((r) => r.text)
                .join('')
                .trim();
            if (text) {
                // trim the edges of the paragraph, keep inner spacing
                current.runs[0].text = current.runs[0].text.replace(/^\s+/, '');
                const last = current.runs[current.runs.length - 1];
                last.text = last.text.replace(/\s+$/, '');
                paragraphs.push(current);
            }
        }
        current = null;
    };
    const re = /<\/?([a-z0-9]+)[^>]*>|([^<]+)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (m[2] !== undefined) {
            const text = decodeEntities(m[2]).replace(/\s+/g, ' ');
            if (!text.trim() && !current) {
                continue;
            }
            if (!current) start();
            current.runs.push({ text, bold: bold > 0 });
            continue;
        }
        const tag = m[1].toLowerCase();
        const closing = m[0][1] === '/';
        if (tag === 'b' || tag === 'strong') {
            bold += closing ? -1 : 1;
            bold = Math.max(bold, 0);
        } else if (tag === 'br') {
            if (current) {
                const keep = { bullet: null, heading: current.heading };
                flush();
                start(keep);
            }
        } else if (tag === 'ul' || tag === 'ol') {
            flush();
            if (closing) {
                listStack.pop();
            } else {
                listStack.push({ ordered: tag === 'ol', n: 0 });
            }
        } else if (BLOCK_TAGS.has(tag)) {
            flush();
            if (!closing) {
                const heading = /^h[1-6]$/.test(tag);
                let bullet = null;
                if (tag === 'li' && listStack.length) {
                    const list = listStack[listStack.length - 1];
                    list.n += 1;
                    bullet = list.ordered ? `${list.n}.` : '•';
                }
                start({ bullet, heading });
            }
        }
    }
    flush();
    return paragraphs.map((p) => {
        if (!p.heading) return p;
        return { ...p, runs: p.runs.map((r) => ({ ...r, bold: true })) };
    });
}

// ------------------------------------------------------------- answers --

/** A matrix answer `{ rowValue: pointValue }` as one line per statement. */
function matrixLines(el, value) {
    const cfg = el.config || {};
    const points = matrixPoints(cfg);
    const picks = value && typeof value === 'object' ? value : {};
    return (cfg.rows || []).map((r) => {
        const pick = picks[r.value];
        return {
            label: r.label || String(r.value),
            value:
                pick === undefined || pick === null
                    ? NO_ANSWER
                    : optionLabel(pick, points),
            answered: pick !== undefined && pick !== null
        };
    });
}

// -------------------------------------------------------------- blocks --

function questionLabel(el) {
    return el.label || el.config?.label || 'Untitled question';
}

/** Blocks for one element in ANSWERS mode. */
function answerBlocks(el, value, ctx) {
    const label = questionLabel(el);
    if (el.type === 'matrix') {
        return [{ kind: 'matrix', label, rows: matrixLines(el, value) }];
    }
    if (el.type === 'consent') {
        return [
            {
                kind: 'consent',
                paragraphs: richTextParagraphs(el.config?.html),
                label: el.label || '',
                checked: value === true || value === 'true'
            }
        ];
    }
    const lines = answerLines(el, value, ctx);
    return [
        {
            kind: 'qa',
            label,
            lines: lines.length ? lines : [NO_ANSWER],
            answered: lines.length > 0
        }
    ];
}

/** Blocks for one element in BLANK mode: the question with room to answer. */
function blankBlocks(el) {
    const cfg = el.config || {};
    const label = questionLabel(el);
    const required = Boolean(el.required);
    const help = el.help || '';
    const type = el.type;
    if (type === 'matrix') {
        return [
            {
                kind: 'matrixBlank',
                label,
                required,
                help,
                columns: matrixPoints(cfg).map(labelOf),
                rows: (cfg.rows || []).map((r) => r.label || String(r.value))
            }
        ];
    }
    if (type === 'consent') {
        return [
            {
                kind: 'consent',
                paragraphs: richTextParagraphs(cfg.html),
                label: el.label || '',
                checked: null
            }
        ];
    }
    if (type === 'likert') {
        return [
            {
                kind: 'choices',
                label,
                required,
                help,
                multi: false,
                options: likertPoints(cfg).map(labelOf)
            }
        ];
    }
    if (SCALE_TYPES.has(type)) {
        const { min, max } = scaleBounds(type, cfg);
        const points = [];
        for (let v = min; v <= max; v++) points.push(String(v));
        return [
            {
                kind: 'scale',
                label,
                required,
                help,
                points,
                lowLabel: cfg.lowLabel || cfg.minLabel || '',
                highLabel: cfg.highLabel || cfg.maxLabel || ''
            }
        ];
    }
    if (type === 'yesNo') {
        return [
            {
                kind: 'choices',
                label,
                required,
                help,
                multi: false,
                options: [cfg.yesLabel || 'Yes', cfg.noLabel || 'No']
            }
        ];
    }
    if (type === 'ranking') {
        return [
            {
                kind: 'choices',
                label,
                required,
                help,
                multi: false,
                ranking: true,
                options: (cfg.options || []).map(labelOf)
            }
        ];
    }
    const options = type === 'file' ? [] : choiceOptions(el);
    const inputType = cfg.inputType;
    if (options.length && inputType !== 'reference') {
        const multi =
            inputType === 'multipicklist' ||
            cfg.renderAs === 'Checkbox_Group' ||
            cfg.renderAs === 'Custom_MultiSelect' ||
            Boolean(cfg.multiple || cfg.multi);
        return [
            {
                kind: 'choices',
                label,
                required,
                help,
                multi,
                options: options.map(labelOf)
            }
        ];
    }
    if (inputType === 'checkbox' || inputType === 'boolean') {
        return [
            {
                kind: 'choices',
                label,
                required,
                help,
                multi: true,
                options: ['Yes']
            }
        ];
    }
    const lines =
        inputType === 'textarea' || inputType === 'richtext'
            ? 4
            : type === 'file'
              ? 2
              : 1;
    return [
        {
            kind: 'field',
            label,
            required,
            help,
            lines,
            hint:
                type === 'file'
                    ? 'Attach files separately'
                    : inputType === 'date'
                      ? 'DD / MM / YYYY'
                      : ''
        }
    ];
}

/** Content blocks: drawn in the blank form; in a copy only when asked. */
function contentBlocks(el) {
    const cfg = el.config || {};
    switch (el.type) {
        case 'richText':
            return [{ kind: 'text', paragraphs: richTextParagraphs(cfg.html) }];
        case 'callout':
            return [
                {
                    kind: 'callout',
                    variant: cfg.variant || 'info',
                    paragraphs: richTextParagraphs(cfg.html)
                }
            ];
        case 'image':
            return cfg.src
                ? [
                      {
                          kind: 'image',
                          url: cfg.src,
                          versionId: cfg.versionId || null,
                          alt: cfg.alt || '',
                          size: cfg.size || 'full'
                      }
                  ]
                : [];
        case 'divider':
            return [{ kind: 'divider' }];
        default:
            return [];
    }
}

function asSet(keys) {
    if (!keys) return new Set();
    if (keys instanceof Set) return keys;
    return new Set(Array.isArray(keys) ? keys : Object.keys(keys));
}

function headerOf(spec) {
    const h = (spec && spec.header) || {};
    const title = h.title || (spec && spec.form && spec.form.name) || 'Form';
    return {
        title,
        description: h.description || '',
        brandName: h.brandName || '',
        logo: h.logo && h.logo.url ? { ...h.logo } : null,
        banner: h.bgImage && h.bgImage.url ? { ...h.bgImage } : null
    };
}

function entryTitle(section, i) {
    const template =
        (section.repeat && section.repeat.entryLabel) || 'Entry {index}';
    return template.replace('{index}', String(i + 1));
}

/**
 * A form as a PDF document model.
 * @param {object} opts
 * @param {object} opts.spec          the spec that was filled in (projection is fine)
 * @param {'answers'|'blank'} [opts.mode]
 * @param {object} [opts.answers]     payload.answers (element id → value)
 * @param {object} [opts.repeats]     payload.repeats (section id → entries)
 * @param {Array}  [opts.files]       payload.files ([{ elementId, name }])
 * @param {object} [opts.lookupLabels] element id → chosen record's name
 * @param {Iterable|object} [opts.hiddenKeys] element ids / `repeat:<sec>` the rules hid
 * @param {string} [opts.submittedAt] ISO datetime
 * @param {boolean} [opts.includeContent] content blocks in an answers copy
 * @param {string} [opts.locale]
 */
export function buildFormDocument(opts) {
    const {
        spec,
        mode = 'answers',
        answers = {},
        repeats = {},
        files = [],
        lookupLabels = {},
        submittedAt = null,
        locale
    } = opts || {};
    const blank = mode === 'blank';
    const includeContent =
        opts && opts.includeContent !== undefined
            ? Boolean(opts.includeContent)
            : blank;
    const hidden = asSet(opts && opts.hiddenKeys);
    const ctx = { locale, lookupLabels };
    const filesByElement = {};
    for (const f of files || []) {
        if (f && f.elementId) {
            (filesByElement[f.elementId] =
                filesByElement[f.elementId] || []).push(f);
        }
    }

    const elementBlocks = (el, value) => {
        if (!el || !el.id || hidden.has(el.id) || el.type === 'spacer') {
            return [];
        }
        if (CONTENT_TYPES.has(el.type)) {
            return includeContent ? contentBlocks(el) : [];
        }
        if (blank) return blankBlocks(el);
        const v = el.type === 'file' ? filesByElement[el.id] || value : value;
        return answerBlocks(el, v, ctx);
    };

    const blocks = [];
    const pages = (spec && spec.pages) || [];
    pages.forEach((page, pageIndex) => {
        const pageBlocks = [];
        for (const section of page.sections || []) {
            const sectionBlocks = [];
            if (section.repeat) {
                if (hidden.has(`repeat:${section.id}`)) continue;
                const entries = blank
                    ? [{}]
                    : Array.isArray(repeats[section.id])
                      ? repeats[section.id]
                      : [];
                entries.forEach((entry, i) => {
                    const inner = [];
                    for (const el of section.elements || []) {
                        inner.push(...elementBlocks(el, entry && entry[el.id]));
                    }
                    if (inner.length) {
                        sectionBlocks.push(
                            { kind: 'entry', title: entryTitle(section, i) },
                            ...inner
                        );
                    }
                });
                if (!entries.length && !blank) {
                    sectionBlocks.push({
                        kind: 'qa',
                        label: section.title || 'Entries',
                        lines: ['No entries'],
                        answered: false
                    });
                }
            } else {
                for (const el of section.elements || []) {
                    sectionBlocks.push(...elementBlocks(el, answers[el.id]));
                }
            }
            if (!sectionBlocks.length) continue;
            const showHeader =
                section.showHeader !== false && !section.block && section.title;
            if (showHeader) {
                pageBlocks.push({
                    kind: 'section',
                    title: section.title,
                    description: section.description || ''
                });
            }
            pageBlocks.push(...sectionBlocks);
        }
        if (!pageBlocks.length) return;
        if (pages.length > 1 && page.name) {
            blocks.push({ kind: 'page', title: page.name, index: pageIndex });
        }
        blocks.push(...pageBlocks);
    });

    const head = headerOf(spec);
    const metaLines = [];
    if (!blank && submittedAt) {
        metaLines.push(`Submitted ${formatDateTime(submittedAt, locale)}`);
    }
    return {
        ...head,
        mode: blank ? 'blank' : 'answers',
        metaLines,
        footerNote: blank ? head.title : `${head.title} · Your answers`,
        blocks
    };
}

/**
 * A stored submission as a PDF document model, from the reader's own rows
 * (c/finalSubmissionReader `header` + `sections` + `files`), so the paper
 * copy says exactly what the screen says, orphaned answers included.
 */
export function buildReaderDocument({ spec, header, sections, files, locale }) {
    const head = headerOf(spec || {});
    const h = header || {};
    if (!spec || !spec.header || !spec.header.title) {
        head.title = h.formName || head.title;
    }
    const blocks = [];
    for (const section of sections || []) {
        if (section.title) {
            blocks.push({
                kind: 'section',
                title: section.title,
                description: ''
            });
        }
        for (const row of section.rows || []) {
            if (row.isMatrix) {
                blocks.push({
                    kind: 'matrix',
                    label: row.label,
                    rows: (row.lines || []).map((l) => ({
                        label: l.label,
                        value: l.value,
                        answered: l.answered
                    }))
                });
            } else if (row.consent) {
                // what was agreed to, ticked or not, as on the respondent copy
                blocks.push({
                    kind: 'consent',
                    label: row.label,
                    paragraphs: richTextParagraphs(row.consent.html),
                    checked: row.consent.checked
                });
            } else {
                blocks.push({
                    kind: 'qa',
                    label: row.label,
                    lines: String(row.value ?? '').split(/\r?\n/),
                    answered: Boolean(row.answered),
                    note: row.note || ''
                });
            }
        }
    }
    if (files && files.length) {
        blocks.push({ kind: 'section', title: 'Files', description: '' });
        blocks.push({
            kind: 'qa',
            label: 'Attached files',
            lines: files.map((f) => {
                return f.detail ? `${f.title} (${f.detail})` : f.title;
            }),
            answered: true
        });
    }
    const metaLines = [];
    const who = [h.submissionNumber, h.submittedBy].filter(Boolean).join(' · ');
    if (who) metaLines.push(who);
    if (h.submittedDate) {
        metaLines.push(
            `Submitted ${formatDateTime(h.submittedDate, locale)}${
                h.versionLabel ? ` · ${h.versionLabel}` : ''
            }`
        );
    }
    return {
        ...head,
        mode: 'answers',
        metaLines,
        footerNote: [head.title, h.submissionNumber]
            .filter(Boolean)
            .join(' · '),
        blocks
    };
}

/** A safe, readable file name: "Contact us - answers.pdf". */
export function pdfFileName(title, suffix) {
    const base = String(title || 'Form')
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\p{Cc}+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return `${base || 'Form'}${suffix ? ` - ${suffix}` : ''}.pdf`;
}
