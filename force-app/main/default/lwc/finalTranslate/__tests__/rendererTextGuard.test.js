/**
 * Guard: a respondent renderer must not start reading an author-text-looking
 * property that the translation inventory (TEXT_KEYS) does not know about.
 *
 * It scans the renderers' source for `el.<prop>`, `cfg.<prop>`,
 * `config.<prop>`, `opt.<prop>`, `option.<prop>`, `options.<prop>`,
 * `opts.<prop>`, `section.<prop>`, `completion.<prop>` and `header.<prop>`
 * (with or without `this.`) and requires every <prop> to be on exactly one of
 * two lists below. A new property fails the test until you decide: is it
 * text the respondent reads (add it to TEXT_KEYS in finalTranslate.js, then to
 * TRANSLATED) or not (add it to NOT_TEXT, one line, with a reason when the
 * name does not make it obvious)?
 */
import fs from 'fs';
import path from 'path';
import { TEXT_KEYS } from 'c/finalTranslate';

const LWC = path.resolve(__dirname, '../..');

const SCANNED = [
    'finalElementRenderer/finalElementRenderer.js',
    'finalElementRenderer/finalElementRenderer.html',
    'finalSectionRenderer/finalSectionRenderer.js',
    'finalSectionRenderer/finalSectionRenderer.html',
    'finalFormHeader/finalFormHeader.js',
    'finalFormHeader/finalFormHeader.html',
    'finalAfterSubmit/finalAfterSubmit.js',
    'finalAfterSubmit/finalAfterSubmit.html',
    'finalSubmitBar/finalSubmitBar.js',
    'finalSubmitBar/finalSubmitBar.html',
    'finalFormViewer/finalFormViewer.js'
];

/** Every file of every finalNav component, next to the fixed list. */
function navFiles() {
    return fs
        .readdirSync(LWC)
        .filter((dir) => dir.startsWith('finalNav'))
        .flatMap((dir) =>
            fs
                .readdirSync(path.join(LWC, dir))
                .filter((f) => /\.(js|html)$/.test(f))
                .map((f) => `${dir}/${f}`)
        );
}

/** Properties that ARE author text (or hold some): must match TEXT_KEYS. */
const TRANSLATED = [
    'title',
    'description',
    'brandName',
    'highlight', // header.highlight.text
    'text',
    'paneTitle',
    'paneSubtitle',
    'paneBrandName',
    'paneHighlight', // paneHighlight.text
    'label',
    'nextLabel',
    'backLabel',
    'advanceLabel',
    'message',
    'buttonLabel',
    'closedMessage',
    'name',
    'addLabel',
    'removeLabel',
    'entryLabel',
    'help',
    'placeholder',
    'leftLabel',
    'rightLabel',
    'yesLabel',
    'noLabel',
    'valuePrefix',
    'valueSuffix',
    'html',
    'alt',
    // containers that hold translated texts (read, never shown as such)
    'layout',
    'options',
    'settings',
    'completion',
    'availability',
    'config',
    'repeat',
    'validation',
    'points',
    'rows'
];

/** Properties known NOT to be author text. Alphabetical. */
const NOT_TEXT = [
    'accept', // file types, not words
    'actionButton', // thank-you button settings object; its words are buttonLabel
    'advanceTrigger',
    'allowDelete',
    'allowMultiple',
    'allowOther',
    'autoRedirect',
    'bgImage', // image address
    'binding',
    'buttonGoesTo',
    'buttonUrl',
    'childObject',
    'coloring',
    'dock',
    'disabled',
    'descriptionDisplay', // where the caption sits, not the caption
    'elements',
    'entries', // saved repeat entries (answers)
    'errors', // runtime messages from the built-in words, not the spec
    'firstPanelOpen',
    'focusRequest',
    'fullBleed',
    'hdr', // header style bundle
    'icon',
    'iconPosition',
    'id',
    'inputType',
    'keepTogether',
    'labelPosition',
    'labelStyle',
    'link', // related-list link target
    'logo', // image address
    'lookup',
    'lookupConfig',
    'lookupTargetObject',
    'mapping',
    'max',
    'mode',
    'multiple', // allow several files / values
    'narrowBehavior',
    'narrowMode',
    'navigation',
    'openSections',
    'paneFadeEligible',
    'paneFlow',
    'paneImage',
    'paneLogo',
    'paneTextFade',
    'polymorphic',
    'progressStyle',
    'railContent',
    'railWidth',
    'ratio',
    'readOnly',
    'recordId',
    'redirectDelay',
    'redirectTo', // address
    'referenceTo',
    'relationshipName',
    'render',
    'renderAs',
    'renderDefault',
    'required',
    'rules',
    'showDividers',
    'showHeader',
    'showProgressBar',
    'showStepCount',
    'side',
    'size',
    'slider',
    'src', // image address
    'sticky',
    'style',
    'surface',
    'tabAlignment',
    'tabStyle',
    'targetObject',
    'targetObjectApiName',
    'textFade',
    'titleRepeatsPage', // flag: the page name already shows
    'type',
    'value', // the stored value, never translated
    'variant',
    'visibility',
    'width'
];

// plain Array / String methods the pattern also catches (`options.map(...)`)
const BUILT_IN = new Set([
    'length',
    'map',
    'includes',
    'filter',
    'find',
    'some',
    'every',
    'forEach',
    'slice',
    'indexOf',
    'join',
    'push',
    'concat',
    'reduce',
    'keys'
]);

const PATTERN =
    /\b(?:this\.)?(cfg|config|el|opt|option|options|opts|section|completion|header)\??\.([A-Za-z_]\w*)/g;

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** { prop -> Set(file) } for every property the renderers read. */
function readProps() {
    const seen = new Map();
    [...SCANNED, ...navFiles()].forEach((file) => {
        const full = path.join(LWC, file);
        if (!fs.existsSync(full)) {
            return;
        }
        const source = stripComments(fs.readFileSync(full, 'utf8'));
        for (const match of source.matchAll(PATTERN)) {
            const prop = match[2];
            if (!BUILT_IN.has(prop)) {
                if (!seen.has(prop)) {
                    seen.set(prop, new Set());
                }
                seen.get(prop).add(file);
            }
        }
    });
    return seen;
}

function textKeySegments() {
    const paths = [
        ...TEXT_KEYS.root.map((r) => r[1]),
        ...TEXT_KEYS.page.map((r) => r[1]),
        ...TEXT_KEYS.section.map((r) => r[1]),
        ...TEXT_KEYS.element.map((r) => r[1]),
        ...TEXT_KEYS.elementLists.flatMap((r) => [r.list, r.text])
    ];
    return {
        all: new Set(paths.flatMap((p) => p.split('.'))),
        last: new Set(paths.map((p) => p.split('.').pop()))
    };
}

describe('renderer text guard', () => {
    it('keeps the two lists honest and apart', () => {
        expect(TRANSLATED.filter((p) => NOT_TEXT.includes(p))).toEqual([]);
        expect(new Set(TRANSLATED).size).toBe(TRANSLATED.length);
        expect(new Set(NOT_TEXT).size).toBe(NOT_TEXT.length);
    });

    it('TRANSLATED matches TEXT_KEYS', () => {
        const { all, last } = textKeySegments();
        // every name claimed as translated is really in the inventory...
        expect(TRANSLATED.filter((p) => !all.has(p))).toEqual([]);
        // ...and every property the inventory ends on is claimed here
        expect([...last].filter((p) => !TRANSLATED.includes(p))).toEqual([]);
    });

    it('every property a renderer reads is on one of the two lists', () => {
        const known = new Set([...TRANSLATED, ...NOT_TEXT]);
        const unknown = [];
        readProps().forEach((files, prop) => {
            if (!known.has(prop)) {
                unknown.push(`${prop} (read in ${[...files].join(', ')})`);
            }
        });
        // A failure here means: decide whether the new property is text the
        // respondent reads (add it to TEXT_KEYS + TRANSLATED) or not
        // (add it to NOT_TEXT).
        expect(unknown).toEqual([]);
    });

    it('scans real files (the guard is not vacuously green)', () => {
        const props = readProps();
        expect(props.size).toBeGreaterThan(40);
        expect(props.has('leftLabel')).toBe(true);
        expect(props.has('nextLabel')).toBe(true);
    });
});
