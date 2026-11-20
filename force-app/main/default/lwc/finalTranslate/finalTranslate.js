/**
 * Built-in respondent words (Next, Submit, error messages…) from Salesforce
 * Custom Labels, so admins can translate them in Translation Workbench.
 * IMPL_PLAN_TRANSLATIONS §4. No UI.
 *
 * Order of lookup for t(name): an Apex override for the chosen language
 * (guests and ?lang=) -> the imported label (the running user's language) ->
 * the English default in ./defaults -> the name itself.
 */
import { EN } from './defaults';
import runtimeLabels from '@salesforce/apex/FinalGuestController.runtimeLabels';
import USER_LANG from '@salesforce/i18n/lang';
import IS_GUEST from '@salesforce/user/isGuest';
import Final_Run_Submit from '@salesforce/label/c.Final_Run_Submit';
import Final_Run_Next from '@salesforce/label/c.Final_Run_Next';
import Final_Run_Back from '@salesforce/label/c.Final_Run_Back';
import Final_Run_Continue from '@salesforce/label/c.Final_Run_Continue';
import Final_Run_Submitting from '@salesforce/label/c.Final_Run_Submitting';
import Final_Run_Retry from '@salesforce/label/c.Final_Run_Retry';
import Final_Run_TryAgain from '@salesforce/label/c.Final_Run_TryAgain';
import Final_Run_Cancel from '@salesforce/label/c.Final_Run_Cancel';
import Final_Run_Delete from '@salesforce/label/c.Final_Run_Delete';
import Final_Run_Undo from '@salesforce/label/c.Final_Run_Undo';
import Final_Run_Required from '@salesforce/label/c.Final_Run_Required';
import Final_Run_Logo from '@salesforce/label/c.Final_Run_Logo';
import Final_Run_PageOf from '@salesforce/label/c.Final_Run_PageOf';
import Final_Run_StepOf from '@salesforce/label/c.Final_Run_StepOf';
import Final_Run_StepN from '@salesforce/label/c.Final_Run_StepN';
import Final_Run_Pages from '@salesforce/label/c.Final_Run_Pages';
import Final_Run_FormPages from '@salesforce/label/c.Final_Run_FormPages';
import Final_Run_FormSteps from '@salesforce/label/c.Final_Run_FormSteps';
import Final_Run_PressCtrlEnter from '@salesforce/label/c.Final_Run_PressCtrlEnter';
import Final_Run_PressReturn from '@salesforce/label/c.Final_Run_PressReturn';
import Final_Run_ExpandCollapse from '@salesforce/label/c.Final_Run_ExpandCollapse';
import Final_Run_LoadingForm from '@salesforce/label/c.Final_Run_LoadingForm';
import Final_Run_LoadingRecord from '@salesforce/label/c.Final_Run_LoadingRecord';
import Final_Run_FillingDetails from '@salesforce/label/c.Final_Run_FillingDetails';
import Final_Run_FormCouldNotLoad from '@salesforce/label/c.Final_Run_FormCouldNotLoad';
import Final_Run_FormUnavailable from '@salesforce/label/c.Final_Run_FormUnavailable';
import Final_Run_FormClosed from '@salesforce/label/c.Final_Run_FormClosed';
import Final_Run_UnsupportedSpec from '@salesforce/label/c.Final_Run_UnsupportedSpec';
import Final_Run_WrongPageCreate from '@salesforce/label/c.Final_Run_WrongPageCreate';
import Final_Run_WrongPageEdit from '@salesforce/label/c.Final_Run_WrongPageEdit';
import Final_Run_SurveyNeedsRecord from '@salesforce/label/c.Final_Run_SurveyNeedsRecord';
import Final_Run_EditNeedsRecord from '@salesforce/label/c.Final_Run_EditNeedsRecord';
import Final_Run_RecordLoadFailed from '@salesforce/label/c.Final_Run_RecordLoadFailed';
import Final_Run_AutofillFailed from '@salesforce/label/c.Final_Run_AutofillFailed';
import Final_Run_SaveFailed from '@salesforce/label/c.Final_Run_SaveFailed';
import Final_Run_AnswersRejected from '@salesforce/label/c.Final_Run_AnswersRejected';
import Final_Run_AnswerRejected from '@salesforce/label/c.Final_Run_AnswerRejected';
import Final_Run_CheckSelection from '@salesforce/label/c.Final_Run_CheckSelection';
import Final_Run_FixFieldsContinueOne from '@salesforce/label/c.Final_Run_FixFieldsContinueOne';
import Final_Run_FixFieldsContinueMany from '@salesforce/label/c.Final_Run_FixFieldsContinueMany';
import Final_Run_FixFieldsSubmitOne from '@salesforce/label/c.Final_Run_FixFieldsSubmitOne';
import Final_Run_FixFieldsSubmitMany from '@salesforce/label/c.Final_Run_FixFieldsSubmitMany';
import Final_Run_ValueNotValid from '@salesforce/label/c.Final_Run_ValueNotValid';
import Final_Run_PleaseAnswer from '@salesforce/label/c.Final_Run_PleaseAnswer';
import Final_Run_MinEntriesOne from '@salesforce/label/c.Final_Run_MinEntriesOne';
import Final_Run_MinEntriesMany from '@salesforce/label/c.Final_Run_MinEntriesMany';
import Final_Run_Success from '@salesforce/label/c.Final_Run_Success';
import Final_Run_ThankYou from '@salesforce/label/c.Final_Run_ThankYou';
import Final_Run_RedirectIn from '@salesforce/label/c.Final_Run_RedirectIn';
import Final_Run_DestRecord from '@salesforce/label/c.Final_Run_DestRecord';
import Final_Run_DestUrl from '@salesforce/label/c.Final_Run_DestUrl';
import Final_Run_RecordNoun from '@salesforce/label/c.Final_Run_RecordNoun';
import Final_Run_PluralOf from '@salesforce/label/c.Final_Run_PluralOf';
import Final_Run_ListNoYet from '@salesforce/label/c.Final_Run_ListNoYet';
import Final_Run_ListLoading from '@salesforce/label/c.Final_Run_ListLoading';
import Final_Run_ListLoadFailed from '@salesforce/label/c.Final_Run_ListLoadFailed';
import Final_Run_ListHoldsUpTo from '@salesforce/label/c.Final_Run_ListHoldsUpTo';
import Final_Run_ListShowingAdd from '@salesforce/label/c.Final_Run_ListShowingAdd';
import Final_Run_ListShowing from '@salesforce/label/c.Final_Run_ListShowing';
import Final_Run_OpenRecord from '@salesforce/label/c.Final_Run_OpenRecord';
import Final_Run_OpenOne from '@salesforce/label/c.Final_Run_OpenOne';
import Final_Run_OpensNewTab from '@salesforce/label/c.Final_Run_OpensNewTab';
import Final_Run_NoValue from '@salesforce/label/c.Final_Run_NoValue';
import Final_Run_ViewAll from '@salesforce/label/c.Final_Run_ViewAll';
import Final_Run_Row from '@salesforce/label/c.Final_Run_Row';
import Final_Run_Actions from '@salesforce/label/c.Final_Run_Actions';
import Final_Run_New from '@salesforce/label/c.Final_Run_New';
import Final_Run_NewEntry from '@salesforce/label/c.Final_Run_NewEntry';
import Final_Run_ViewOnly from '@salesforce/label/c.Final_Run_ViewOnly';
import Final_Run_ViewOnlySr from '@salesforce/label/c.Final_Run_ViewOnlySr';
import Final_Run_Open from '@salesforce/label/c.Final_Run_Open';
import Final_Run_EntryDefault from '@salesforce/label/c.Final_Run_EntryDefault';
import Final_Run_AddAnother from '@salesforce/label/c.Final_Run_AddAnother';
import Final_Run_RemoveEntry from '@salesforce/label/c.Final_Run_RemoveEntry';
import Final_Run_RowN from '@salesforce/label/c.Final_Run_RowN';
import Final_Run_NameN from '@salesforce/label/c.Final_Run_NameN';
import Final_Run_DeleteConflict from '@salesforce/label/c.Final_Run_DeleteConflict';
import Final_Run_WillBeDeleted from '@salesforce/label/c.Final_Run_WillBeDeleted';
import Final_Run_DeleteRowAria from '@salesforce/label/c.Final_Run_DeleteRowAria';
import Final_Run_DeleteRowConfirm from '@salesforce/label/c.Final_Run_DeleteRowConfirm';
import Final_Run_UndoDeleteAria from '@salesforce/label/c.Final_Run_UndoDeleteAria';
import Final_Run_OwnAnswerPlaceholder from '@salesforce/label/c.Final_Run_OwnAnswerPlaceholder';
import Final_Run_Other from '@salesforce/label/c.Final_Run_Other';
import Final_Run_ThisQuestion from '@salesforce/label/c.Final_Run_ThisQuestion';
import Final_Run_OtherAria from '@salesforce/label/c.Final_Run_OtherAria';
import Final_Run_Untitled from '@salesforce/label/c.Final_Run_Untitled';
import Final_Run_UnsupportedElement from '@salesforce/label/c.Final_Run_UnsupportedElement';
import Final_Run_Yes from '@salesforce/label/c.Final_Run_Yes';
import Final_Run_No from '@salesforce/label/c.Final_Run_No';
import Final_Run_VeryUnhappy from '@salesforce/label/c.Final_Run_VeryUnhappy';
import Final_Run_Unhappy from '@salesforce/label/c.Final_Run_Unhappy';
import Final_Run_Neutral from '@salesforce/label/c.Final_Run_Neutral';
import Final_Run_Happy from '@salesforce/label/c.Final_Run_Happy';
import Final_Run_VeryHappy from '@salesforce/label/c.Final_Run_VeryHappy';
import Final_Run_StronglyDisagree from '@salesforce/label/c.Final_Run_StronglyDisagree';
import Final_Run_Disagree from '@salesforce/label/c.Final_Run_Disagree';
import Final_Run_Agree from '@salesforce/label/c.Final_Run_Agree';
import Final_Run_StronglyAgree from '@salesforce/label/c.Final_Run_StronglyAgree';
import Final_Run_EmojiOf from '@salesforce/label/c.Final_Run_EmojiOf';
import Final_Run_ScaleEnd from '@salesforce/label/c.Final_Run_ScaleEnd';
import Final_Run_ScaleRange from '@salesforce/label/c.Final_Run_ScaleRange';
import Final_Run_SliderRange from '@salesforce/label/c.Final_Run_SliderRange';
import Final_Run_MoveUp from '@salesforce/label/c.Final_Run_MoveUp';
import Final_Run_MoveDown from '@salesforce/label/c.Final_Run_MoveDown';
import Final_Run_AddFile from '@salesforce/label/c.Final_Run_AddFile';
import Final_Run_AddFiles from '@salesforce/label/c.Final_Run_AddFiles';
import Final_Run_FileUpTo from '@salesforce/label/c.Final_Run_FileUpTo';
import Final_Run_FileHintAny from '@salesforce/label/c.Final_Run_FileHintAny';
import Final_Run_FileHintAccept from '@salesforce/label/c.Final_Run_FileHintAccept';
import Final_Run_RemoveFile from '@salesforce/label/c.Final_Run_RemoveFile';
import Final_Run_FileReadFailed from '@salesforce/label/c.Final_Run_FileReadFailed';
import Final_Run_FileTooLarge from '@salesforce/label/c.Final_Run_FileTooLarge';
import Final_Run_SearchPlaceholder from '@salesforce/label/c.Final_Run_SearchPlaceholder';
import Final_Run_ClearNamed from '@salesforce/label/c.Final_Run_ClearNamed';
import Final_Run_ClearSelection from '@salesforce/label/c.Final_Run_ClearSelection';
import Final_Run_ResultsNamed from '@salesforce/label/c.Final_Run_ResultsNamed';
import Final_Run_SearchResults from '@salesforce/label/c.Final_Run_SearchResults';
import Final_Run_ThisSelection from '@salesforce/label/c.Final_Run_ThisSelection';
import Final_Run_SelectionStale from '@salesforce/label/c.Final_Run_SelectionStale';
import Final_Run_Searching from '@salesforce/label/c.Final_Run_Searching';
import Final_Run_TypeMore from '@salesforce/label/c.Final_Run_TypeMore';
import Final_Run_NoMatches from '@salesforce/label/c.Final_Run_NoMatches';
import Final_Run_ResultOne from '@salesforce/label/c.Final_Run_ResultOne';
import Final_Run_ResultsMany from '@salesforce/label/c.Final_Run_ResultsMany';

const IMPORTED = {
    Final_Run_Submit,
    Final_Run_Next,
    Final_Run_Back,
    Final_Run_Continue,
    Final_Run_Submitting,
    Final_Run_Retry,
    Final_Run_TryAgain,
    Final_Run_Cancel,
    Final_Run_Delete,
    Final_Run_Undo,
    Final_Run_Required,
    Final_Run_Logo,
    Final_Run_PageOf,
    Final_Run_StepOf,
    Final_Run_StepN,
    Final_Run_Pages,
    Final_Run_FormPages,
    Final_Run_FormSteps,
    Final_Run_PressCtrlEnter,
    Final_Run_PressReturn,
    Final_Run_ExpandCollapse,
    Final_Run_LoadingForm,
    Final_Run_LoadingRecord,
    Final_Run_FillingDetails,
    Final_Run_FormCouldNotLoad,
    Final_Run_FormUnavailable,
    Final_Run_FormClosed,
    Final_Run_UnsupportedSpec,
    Final_Run_WrongPageCreate,
    Final_Run_WrongPageEdit,
    Final_Run_SurveyNeedsRecord,
    Final_Run_EditNeedsRecord,
    Final_Run_RecordLoadFailed,
    Final_Run_AutofillFailed,
    Final_Run_SaveFailed,
    Final_Run_AnswersRejected,
    Final_Run_AnswerRejected,
    Final_Run_CheckSelection,
    Final_Run_FixFieldsContinueOne,
    Final_Run_FixFieldsContinueMany,
    Final_Run_FixFieldsSubmitOne,
    Final_Run_FixFieldsSubmitMany,
    Final_Run_ValueNotValid,
    Final_Run_PleaseAnswer,
    Final_Run_MinEntriesOne,
    Final_Run_MinEntriesMany,
    Final_Run_Success,
    Final_Run_ThankYou,
    Final_Run_RedirectIn,
    Final_Run_DestRecord,
    Final_Run_DestUrl,
    Final_Run_RecordNoun,
    Final_Run_PluralOf,
    Final_Run_ListNoYet,
    Final_Run_ListLoading,
    Final_Run_ListLoadFailed,
    Final_Run_ListHoldsUpTo,
    Final_Run_ListShowingAdd,
    Final_Run_ListShowing,
    Final_Run_OpenRecord,
    Final_Run_OpenOne,
    Final_Run_OpensNewTab,
    Final_Run_NoValue,
    Final_Run_ViewAll,
    Final_Run_Row,
    Final_Run_Actions,
    Final_Run_New,
    Final_Run_NewEntry,
    Final_Run_ViewOnly,
    Final_Run_ViewOnlySr,
    Final_Run_Open,
    Final_Run_EntryDefault,
    Final_Run_AddAnother,
    Final_Run_RemoveEntry,
    Final_Run_RowN,
    Final_Run_NameN,
    Final_Run_DeleteConflict,
    Final_Run_WillBeDeleted,
    Final_Run_DeleteRowAria,
    Final_Run_DeleteRowConfirm,
    Final_Run_UndoDeleteAria,
    Final_Run_OwnAnswerPlaceholder,
    Final_Run_Other,
    Final_Run_ThisQuestion,
    Final_Run_OtherAria,
    Final_Run_Untitled,
    Final_Run_UnsupportedElement,
    Final_Run_Yes,
    Final_Run_No,
    Final_Run_VeryUnhappy,
    Final_Run_Unhappy,
    Final_Run_Neutral,
    Final_Run_Happy,
    Final_Run_VeryHappy,
    Final_Run_StronglyDisagree,
    Final_Run_Disagree,
    Final_Run_Agree,
    Final_Run_StronglyAgree,
    Final_Run_EmojiOf,
    Final_Run_ScaleEnd,
    Final_Run_ScaleRange,
    Final_Run_SliderRange,
    Final_Run_MoveUp,
    Final_Run_MoveDown,
    Final_Run_AddFile,
    Final_Run_AddFiles,
    Final_Run_FileUpTo,
    Final_Run_FileHintAny,
    Final_Run_FileHintAccept,
    Final_Run_RemoveFile,
    Final_Run_FileReadFailed,
    Final_Run_FileTooLarge,
    Final_Run_SearchPlaceholder,
    Final_Run_ClearNamed,
    Final_Run_ClearSelection,
    Final_Run_ResultsNamed,
    Final_Run_SearchResults,
    Final_Run_ThisSelection,
    Final_Run_SelectionStale,
    Final_Run_Searching,
    Final_Run_TypeMore,
    Final_Run_NoMatches,
    Final_Run_ResultOne,
    Final_Run_ResultsMany
};

const LANG_PATTERN = /^[a-z]{2,3}([_-][A-Za-z]{2})?$/;

let overrides = {};

/** Replace the per-language overrides (a name -> text map from Apex). */
export function setLabelOverrides(map) {
    overrides = map && typeof map === 'object' ? { ...map } : {};
}

export function clearLabelOverrides() {
    overrides = {};
}

function usable(name, value) {
    return typeof value === 'string' && value !== '' && value !== 'c.' + name;
}

function raw(name) {
    if (usable(name, overrides[name])) {
        return overrides[name];
    }
    if (usable(name, IMPORTED[name])) {
        return IMPORTED[name];
    }
    if (typeof EN[name] === 'string') {
        return EN[name];
    }
    return name;
}

/** The built-in word `name`, with {0}, {1}… replaced by the arguments. */
export function t(name, ...args) {
    const text = raw(name);
    if (!args.length) {
        return text;
    }
    return text.replace(/\{(\d+)\}/g, (whole, i) => {
        const v = args[Number(i)];
        return v === undefined || v === null ? whole : String(v);
    });
}

/** Singular or plural label by count; the count is {0}. */
export function tn(oneName, manyName, n) {
    return t(Number(n) === 1 ? oneName : manyName, n);
}

/**
 * "fr", "fr_CA" or "fr-CA" -> Salesforce style ("fr" / "fr_CA"); anything
 * else -> null.
 */
export function normalizeLanguage(value) {
    const text = String(
        value === undefined || value === null ? '' : value
    ).trim();
    if (!LANG_PATTERN.test(text)) {
        return null;
    }
    const [lang, region] = text.split(/[_-]/);
    return region ? lang + '_' + region.toUpperCase() : lang;
}

function fromUrl() {
    try {
        const params = new URL(window.location.href).searchParams;
        return params.get('lang') || params.get('c__lang');
    } catch {
        return null;
    }
}

/**
 * The language to show. `param` is the value the host already read from the
 * page reference (`lang` or `c__lang`: Lightning drops unknown params, but
 * keeps c__ ones); with none, the browser URL is read.
 */
export function resolveLanguage({ param } = {}) {
    return normalizeLanguage(param || fromUrl());
}

/** Load one language's translations; null puts everything back to defaults. */
export async function loadLanguage(lang) {
    if (!lang) {
        clearLabelOverrides();
        return;
    }
    try {
        setLabelOverrides(await runtimeLabels({ lang }));
    } catch {
        // fall back silently to the imported (running user's language) labels
        clearLabelOverrides();
    }
}

// ---------------------------------------------------------------------------
// Author text in the spec (IMPL_PLAN_TRANSLATIONS §1-§2, PR 2)
// ---------------------------------------------------------------------------

/**
 * EVERY author-written text the respondent sees, in ONE table, shared by
 * localizeSpec (swap) and listTexts (future export). A property missing here
 * stays in the default language, so a new text property gets a row here and
 * the inventory test (finalTranslate.test.js) fails until it does.
 *
 * Each row is [key, dotted path]. Paths are read from the spec root, the page,
 * the section or the element. Never listed: choice/point/row VALUES, ids, URLs,
 * icons, config.accept, schemaOptions (Salesforce's own picklist labels).
 */
export const TEXT_KEYS = {
    root: [
        ['header.title', 'header.title'],
        ['header.description', 'header.description'],
        ['header.brandName', 'header.brandName'],
        ['header.highlight', 'header.highlight.text'],
        ['pane.title', 'layout.options.paneTitle'],
        ['pane.subtitle', 'layout.options.paneSubtitle'],
        ['pane.brandName', 'layout.options.paneBrandName'],
        ['pane.highlight', 'layout.options.paneHighlight.text'],
        ['submit.label', 'submit.label'],
        ['submit.nextLabel', 'submit.nextLabel'],
        ['submit.backLabel', 'submit.backLabel'],
        ['layout.advanceLabel', 'layout.options.advanceLabel'],
        ['done.title', 'settings.completion.title'],
        ['done.message', 'settings.completion.message'],
        ['done.buttonLabel', 'settings.completion.buttonLabel'],
        ['closed.message', 'settings.availability.closedMessage']
    ],
    // key = `page:<id>.<name>`; a page with no id is keyed by its index
    page: [['name', 'name']],
    // key = `sec:<id>.<name>`; {index} stays as written in repeat.entryLabel
    section: [
        ['title', 'title'],
        ['description', 'description'],
        ['addLabel', 'repeat.addLabel'],
        ['removeLabel', 'repeat.removeLabel'],
        ['entryLabel', 'repeat.entryLabel']
    ],
    // key = `el:<id>.<name>`
    element: [
        ['label', 'label'],
        ['help', 'help'],
        ['description', 'description'],
        ['placeholder', 'placeholder'],
        ['leftLabel', 'config.leftLabel'],
        ['rightLabel', 'config.rightLabel'],
        ['yesLabel', 'config.yesLabel'],
        ['noLabel', 'config.noLabel'],
        ['valuePrefix', 'config.valuePrefix'],
        ['valueSuffix', 'config.valueSuffix'],
        ['html', 'config.html'],
        ['alt', 'config.alt']
    ],
    // key = `el:<id>.<prefix>:<item id>`; value rows are keyed by the stored
    // value, never the label; validation entries by their position
    elementLists: [
        { prefix: 'opt', list: 'config.options', text: 'label', by: 'value' },
        {
            prefix: 'optdesc',
            list: 'config.options',
            text: 'description',
            by: 'value'
        },
        { prefix: 'point', list: 'config.points', text: 'label', by: 'value' },
        { prefix: 'row', list: 'config.rows', text: 'label', by: 'value' },
        { prefix: 'msg', list: 'validation', text: 'message', by: 'index' }
    ]
};

function getAt(obj, path) {
    let cur = obj;
    for (const part of path) {
        if (cur === null || typeof cur !== 'object') {
            return undefined;
        }
        cur = cur[part];
    }
    return cur;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object';
}

function listElementTexts(add, el, elPath) {
    TEXT_KEYS.element.forEach(([name, dotted]) =>
        add(`el:${el.id}.${name}`, [...elPath, ...dotted.split('.')])
    );
    TEXT_KEYS.elementLists.forEach((row) => {
        const listPath = row.list.split('.');
        asArray(getAt(el, listPath)).forEach((item, ii) => {
            const id = row.by === 'index' ? ii : item && item.value;
            if (id === undefined || id === null || id === '') {
                return;
            }
            add(`el:${el.id}.${row.prefix}:${id}`, [
                ...elPath,
                ...listPath,
                ii,
                row.text
            ]);
        });
    });
}

function listSectionTexts(add, section, secPath) {
    if (section.id) {
        TEXT_KEYS.section.forEach(([name, dotted]) =>
            add(`sec:${section.id}.${name}`, [...secPath, ...dotted.split('.')])
        );
    }
    asArray(section.elements).forEach((el, ei) => {
        if (isObject(el) && el.id) {
            listElementTexts(add, el, [...secPath, 'elements', ei]);
        }
    });
}

/** Every author text in `spec` as { key, path, text } (path from the root). */
export function listTexts(spec) {
    const out = [];
    if (!isObject(spec)) {
        return out;
    }
    const add = (key, path) => {
        const text = getAt(spec, path);
        if (typeof text === 'string' && text !== '') {
            out.push({ key, path, text });
        }
    };
    TEXT_KEYS.root.forEach(([key, dotted]) => add(key, dotted.split('.')));
    asArray(spec.pages).forEach((page, pi) => {
        if (!isObject(page)) {
            return;
        }
        const pageId = page.id === undefined || page.id === null ? pi : page.id;
        TEXT_KEYS.page.forEach(([name, dotted]) =>
            add(`page:${pageId}.${name}`, ['pages', pi, ...dotted.split('.')])
        );
        asArray(page.sections).forEach((section, si) => {
            if (isObject(section)) {
                listSectionTexts(add, section, ['pages', pi, 'sections', si]);
            }
        });
    });
    return out;
}

function setAt(obj, path, value) {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        cur = cur[path[i]];
    }
    cur[path[path.length - 1]] = value;
}

function baseOf(code) {
    return code ? code.split('_')[0] : null;
}

/** Matching rule shared with Apex FinalSpecLanguage: exact, then the
 *  candidate's base language (fr_CA -> fr), then an offered regional variant
 *  of that base (fr -> fr_CA). Returns the code as offered, or null. */
function matchAvailable(candidate, available) {
    const code = normalizeLanguage(candidate);
    if (!code) {
        return null;
    }
    const base = baseOf(code);
    return (
        available.find((a) => a === code) ||
        available.find((a) => a === base) ||
        available.find((a) => baseOf(a) === base) ||
        null
    );
}

function availableOf(spec) {
    return asArray(spec.languages.available)
        .map(normalizeLanguage)
        .filter(Boolean);
}

function defaultBrowserLanguages() {
    if (typeof navigator === 'undefined') {
        return [];
    }
    return navigator.languages || [navigator.language];
}

/**
 * The form language for this visit, limited to `languages.available`.
 * Order: link param -> the signed-in user's language (never a guest's: a
 * guest's is the site guest user's) -> each browser language -> the default.
 * Without `spec.languages` the old rule holds: the link param only.
 */
export function pickLanguage({ spec, param, userLang, browserLangs } = {}) {
    if (!spec || !spec.languages) {
        return normalizeLanguage(param);
    }
    const available = availableOf(spec);
    let own = userLang;
    if (own === undefined) {
        own = IS_GUEST ? null : USER_LANG;
    }
    const browser =
        browserLangs === undefined ? defaultBrowserLanguages() : browserLangs;
    for (const c of [param, own, ...asArray(browser)]) {
        const hit = c ? matchAvailable(c, available) : null;
        if (hit) {
            return hit;
        }
    }
    return normalizeLanguage(spec.languages.default);
}

/**
 * A copy of `spec` with every inventoried author text replaced from
 * `spec.translations[lang]` (the exact code, else its base language). A key
 * with no translation keeps the default text. Never mutates the input; with
 * no language, the default language or no translations it returns `spec`.
 */
export function localizeSpec(spec, lang) {
    const code = normalizeLanguage(lang);
    if (!spec || !code || !isObject(spec.translations)) {
        return spec;
    }
    const def = spec.languages && normalizeLanguage(spec.languages.default);
    if (def && def === code) {
        return spec;
    }
    const candidates = [
        spec.translations[code],
        spec.translations[baseOf(code)]
    ];
    const tables = candidates.filter(isObject);
    if (!tables.length) {
        return spec;
    }
    const copy = JSON.parse(JSON.stringify(spec));
    for (const { key, path } of listTexts(spec)) {
        const hit = tables
            .map((x) => x[key])
            .find((v) => typeof v === 'string' && v !== '');
        if (hit !== undefined) {
            setAt(copy, path, hit);
        }
    }
    return copy;
}
