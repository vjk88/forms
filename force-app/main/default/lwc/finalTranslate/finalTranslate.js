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
import Final_Run_AndMore from '@salesforce/label/c.Final_Run_AndMore';
import Final_Run_EntryN from '@salesforce/label/c.Final_Run_EntryN';
import Final_Run_NameColon from '@salesforce/label/c.Final_Run_NameColon';
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
import Final_Run_Language from '@salesforce/label/c.Final_Run_Language';
import Final_Run_TooFast from '@salesforce/label/c.Final_Run_TooFast';
import Final_Run_StillSending from '@salesforce/label/c.Final_Run_StillSending';
import Final_Run_AlreadySent from '@salesforce/label/c.Final_Run_AlreadySent';
import Final_Run_AddressStreet from '@salesforce/label/c.Final_Run_AddressStreet';
import Final_Run_AddressCity from '@salesforce/label/c.Final_Run_AddressCity';
import Final_Run_AddressProvince from '@salesforce/label/c.Final_Run_AddressProvince';
import Final_Run_AddressPostalCode from '@salesforce/label/c.Final_Run_AddressPostalCode';
import Final_Run_AddressCountry from '@salesforce/label/c.Final_Run_AddressCountry';
import Final_Run_AddressSearch from '@salesforce/label/c.Final_Run_AddressSearch';
import Final_Run_AddressNoMatches from '@salesforce/label/c.Final_Run_AddressNoMatches';
import Final_Run_AddressSearchDown from '@salesforce/label/c.Final_Run_AddressSearchDown';
import Final_Run_AddressPartRequired from '@salesforce/label/c.Final_Run_AddressPartRequired';

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
    Final_Run_AndMore,
    Final_Run_EntryN,
    Final_Run_NameColon,
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
    Final_Run_ResultsMany,
    Final_Run_Language,
    Final_Run_TooFast,
    Final_Run_StillSending,
    Final_Run_AlreadySent,
    Final_Run_AddressStreet,
    Final_Run_AddressCity,
    Final_Run_AddressProvince,
    Final_Run_AddressPostalCode,
    Final_Run_AddressCountry,
    Final_Run_AddressSearch,
    Final_Run_AddressNoMatches,
    Final_Run_AddressSearchDown,
    Final_Run_AddressPartRequired
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
 * localizeSpec (swap) and listTexts (the Translate screen). A property missing
 * here stays in the default language, so a new text property gets a row here
 * and the inventory test (finalTranslate.test.js) fails until it does; the
 * renderer guard test (rendererTextGuard.test.js) fails when a renderer reads
 * a property that is neither listed here nor known not to be text.
 *
 * Each row is [key, dotted path, kind, rich?]. Paths are read from the spec
 * root, the page, the section or the element. `kind` is the short sentence-case
 * label the grid shows; `rich` marks texts rendered as HTML. Never listed:
 * choice/point/row VALUES, ids, URLs, icons, config.accept, schemaOptions
 * (Salesforce's own picklist labels).
 */
export const TEXT_KEYS = {
    root: [
        ['header.title', 'header.title', 'Form title', true],
        ['header.description', 'header.description', 'Form description', true],
        ['header.brandName', 'header.brandName', 'Brand name', true],
        ['header.highlight', 'header.highlight.text', 'Highlight'],
        ['pane.title', 'layout.options.paneTitle', 'Pane title', true],
        ['pane.subtitle', 'layout.options.paneSubtitle', 'Pane subtitle', true],
        ['pane.brandName', 'layout.options.paneBrandName', 'Pane brand name'],
        [
            'pane.highlight',
            'layout.options.paneHighlight.text',
            'Pane highlight'
        ],
        ['submit.label', 'submit.label', 'Submit button'],
        ['submit.nextLabel', 'submit.nextLabel', 'Next button'],
        ['submit.backLabel', 'submit.backLabel', 'Back button'],
        [
            'layout.advanceLabel',
            'layout.options.advanceLabel',
            'Continue button'
        ],
        ['done.title', 'settings.completion.title', 'Thank-you title'],
        [
            'done.message',
            'settings.completion.message',
            'Thank-you message',
            true
        ],
        [
            'done.buttonLabel',
            'settings.completion.buttonLabel',
            'Thank-you button'
        ],
        [
            'closed.message',
            'settings.availability.closedMessage',
            'Closed message'
        ]
    ],
    // key = `page:<id>.<name>`; a page with no id is keyed by its index
    page: [['name', 'name', 'Page name']],
    // key = `sec:<id>.<name>`; {index} stays as written in repeat.entryLabel
    section: [
        ['title', 'title', 'Section title'],
        ['description', 'description', 'Section description'],
        ['addLabel', 'repeat.addLabel', 'Add button'],
        ['removeLabel', 'repeat.removeLabel', 'Remove button'],
        ['entryLabel', 'repeat.entryLabel', 'Entry name']
    ],
    // key = `el:<id>.<name>`
    element: [
        ['label', 'label', 'Question'],
        ['help', 'help', 'Help text'],
        ['description', 'description', 'Caption'],
        ['placeholder', 'placeholder', 'Placeholder'],
        ['leftLabel', 'config.leftLabel', 'Scale · left end'],
        ['rightLabel', 'config.rightLabel', 'Scale · right end'],
        ['yesLabel', 'config.yesLabel', 'Yes label'],
        ['noLabel', 'config.noLabel', 'No label'],
        ['valuePrefix', 'config.valuePrefix', 'Value prefix'],
        ['valueSuffix', 'config.valueSuffix', 'Value suffix'],
        ['html', 'config.html', 'Content', true],
        ['alt', 'config.alt', 'Image description']
    ],
    // key = `el:<id>.<prefix>:<item id>`; value rows are keyed by the stored
    // value, never the label; validation rules by their stable `id` (falling
    // back to their position for specs from before rule ids existed)
    elementLists: [
        {
            prefix: 'opt',
            list: 'config.options',
            text: 'label',
            by: 'value',
            kind: 'Option'
        },
        {
            prefix: 'optdesc',
            list: 'config.options',
            text: 'description',
            by: 'value',
            kind: 'Option description'
        },
        {
            prefix: 'point',
            list: 'config.points',
            text: 'label',
            by: 'value',
            kind: 'Point'
        },
        {
            prefix: 'row',
            list: 'config.rows',
            text: 'label',
            by: 'value',
            kind: 'Statement'
        },
        {
            prefix: 'msg',
            list: 'validation',
            text: 'message',
            by: 'ruleId',
            kind: 'Error message'
        }
    ]
};

const GROUP_HEADER = 'Form header';
const GROUP_BUTTONS = 'Buttons';
const GROUP_DONE = 'After submit';
const GROUP_CLOSED = 'When the form is closed';

/** Which form-level group a root key belongs to. */
function rootGroupOf(key) {
    if (/^(header|pane)\./.test(key)) {
        return GROUP_HEADER;
    }
    if (/^(submit|layout)\./.test(key)) {
        return GROUP_BUTTONS;
    }
    return key.startsWith('done.') ? GROUP_DONE : GROUP_CLOSED;
}

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

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function hasText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

/** The id a list row is keyed by (undefined = no key, row skipped). */
function itemKeyOf(row, item, index) {
    if (row.by === 'ruleId') {
        return isObject(item) && hasText(item.id) ? item.id : index;
    }
    return item && item.value;
}

/** "Page 2" or "Page 2 · About you" (a page still named "Page 2" adds nothing). */
function pageLabel(pageNo, pageName) {
    const name = hasText(pageName) ? pageName.trim() : '';
    return name && name.toLowerCase() !== `page ${pageNo}`
        ? `Page ${pageNo} · ${name}`
        : `Page ${pageNo}`;
}

function listElementTexts(add, el, elPath, pageNo, pageName) {
    const label = hasText(el.label) ? el.label.trim() : 'Untitled question';
    const group = {
        id: `el:${el.id}`,
        title: `${pageLabel(pageNo, pageName)} · Question: ${label}`
    };
    TEXT_KEYS.element.forEach(([name, dotted, kind, rich]) =>
        add(`el:${el.id}.${name}`, [...elPath, ...dotted.split('.')], {
            kind,
            rich,
            group
        })
    );
    TEXT_KEYS.elementLists.forEach((row) => {
        const listPath = row.list.split('.');
        asArray(getAt(el, listPath)).forEach((item, ii) => {
            const id = itemKeyOf(row, item, ii);
            if (id === undefined || id === null || id === '') {
                return;
            }
            add(
                `el:${el.id}.${row.prefix}:${id}`,
                [...elPath, ...listPath, ii, row.text],
                {
                    kind:
                        row.prefix === 'msg' ? row.kind : `${row.kind} · ${id}`,
                    rich: false,
                    group
                }
            );
        });
    });
}

function listSectionTexts(add, section, secPath, pageNo, pageName) {
    if (section.id) {
        const title = hasText(section.title)
            ? section.title.trim()
            : 'Untitled section';
        const group = {
            id: `sec:${section.id}`,
            title: `${pageLabel(pageNo, pageName)} · Section: ${title}`
        };
        TEXT_KEYS.section.forEach(([name, dotted, kind, rich]) =>
            add(
                `sec:${section.id}.${name}`,
                [...secPath, ...dotted.split('.')],
                { kind, rich, group }
            )
        );
    }
    asArray(section.elements).forEach((el, ei) => {
        if (isObject(el) && el.id) {
            listElementTexts(
                add,
                el,
                [...secPath, 'elements', ei],
                pageNo,
                pageName
            );
        }
    });
}

/**
 * Every author text in `spec` as { key, path, text, kind, rich, group } (path
 * from the root; group = { order, title }). Spec order: the form header, then
 * pages -> sections -> elements, then the buttons, the thank-you page and the
 * closed message. Only texts that exist (non-empty default text) are listed.
 */
export function listTexts(spec) {
    const out = [];
    if (!isObject(spec)) {
        return out;
    }
    const groups = new Map();
    const add = (key, path, { kind, rich, group }) => {
        const text = getAt(spec, path);
        if (typeof text !== 'string' || text === '') {
            return;
        }
        if (!groups.has(group.id)) {
            groups.set(group.id, { order: groups.size, title: group.title });
        }
        out.push({
            key,
            path,
            text,
            kind,
            rich: Boolean(rich),
            group: groups.get(group.id)
        });
    };
    const addRoot = (wanted) =>
        TEXT_KEYS.root.forEach(([key, dotted, kind, rich]) => {
            const title = rootGroupOf(key);
            if (wanted(title)) {
                add(key, dotted.split('.'), {
                    kind,
                    rich,
                    group: { id: `root:${title}`, title }
                });
            }
        });
    addRoot((title) => title === GROUP_HEADER);
    asArray(spec.pages).forEach((page, pi) => {
        if (!isObject(page)) {
            return;
        }
        const pageId = page.id === undefined || page.id === null ? pi : page.id;
        TEXT_KEYS.page.forEach(([name, dotted, kind]) =>
            add(`page:${pageId}.${name}`, ['pages', pi, ...dotted.split('.')], {
                kind,
                group: {
                    id: `page:${pageId}`,
                    title: pageLabel(pi + 1, page.name)
                }
            })
        );
        asArray(page.sections).forEach((section, si) => {
            if (isObject(section)) {
                listSectionTexts(
                    add,
                    section,
                    ['pages', pi, 'sections', si],
                    pi + 1,
                    page.name
                );
            }
        });
    });
    addRoot((title) => title !== GROUP_HEADER);
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

// ---------------------------------------------------------------------------
// Translate-screen groundwork (IMPL_PLAN_TRANSLATIONS build order 3A)
// ---------------------------------------------------------------------------

/** A new validation-rule id, same style as the Studio's element ids. */
export function mintRuleId() {
    let suffix = '';
    for (let i = 0; i < 8; i++) {
        let n;
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            n = crypto.getRandomValues(new Uint8Array(1))[0];
        } else {
            n = Math.floor(Math.random() * 256);
        }
        suffix += (n % 36).toString(36);
    }
    return `vr_${suffix}`;
}

function eachElement(spec, visit) {
    asArray(spec.pages).forEach((page) =>
        asArray(isObject(page) && page.sections).forEach((section) =>
            asArray(isObject(section) && section.elements).forEach((el) => {
                if (isObject(el)) {
                    visit(el);
                }
            })
        )
    );
}

/**
 * A copy of `spec` where every validation rule has an `id`, and translation
 * keys written by position (`el:<id>.msg:0`) are renamed to the rule's id
 * (`el:<id>.msg:vr_x1`), in every language and in translationSources. An
 * existing id key is never overwritten. Safe to run repeatedly.
 */
export function ensureRuleIds(spec) {
    if (!isObject(spec)) {
        return spec;
    }
    const copy = clone(spec);
    const renames = [];
    eachElement(copy, (el) => {
        asArray(el.validation).forEach((rule, i) => {
            if (!isObject(rule)) {
                return;
            }
            if (!hasText(rule.id)) {
                rule.id = mintRuleId();
            }
            if (hasText(el.id)) {
                renames.push([
                    `el:${el.id}.msg:${i}`,
                    `el:${el.id}.msg:${rule.id}`
                ]);
            }
        });
    });
    ['translations', 'translationSources'].forEach((block) => {
        if (!isObject(copy[block])) {
            return;
        }
        Object.values(copy[block]).forEach((table) => {
            if (!isObject(table)) {
                return;
            }
            renames.forEach(([from, to]) => {
                if (Object.prototype.hasOwnProperty.call(table, from)) {
                    if (!Object.prototype.hasOwnProperty.call(table, to)) {
                        table[to] = table[from];
                    }
                    delete table[from];
                }
            });
        });
    });
    return copy;
}

/** A copy of an element (duplicate / paste) whose rules all get NEW ids. */
export function withFreshRuleIds(element) {
    const copy = clone(element);
    asArray(copy.validation).forEach((rule) => {
        if (isObject(rule)) {
            rule.id = mintRuleId();
        }
    });
    return copy;
}

/**
 * 8 hex chars (FNV-1a, 32 bit) of `text` with whitespace collapsed and
 * trimmed, so re-flowing the English never reads as a change.
 */
export function textFingerprint(text) {
    const norm = String(text === undefined || text === null ? '' : text)
        .replace(/\s+/g, ' ')
        .trim();
    let h = 0x811c9dc5;
    for (let i = 0; i < norm.length; i++) {
        h ^= norm.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

function tableOf(spec, block, code) {
    const all = isObject(spec[block]) ? spec[block] : {};
    return isObject(all[code]) ? all[code] : {};
}

/**
 * Every listed text with its translation into `lang`:
 * { ...entry, source, translation, status } where status is `done`
 * (translated, and the English is what it was then), `changed` (translated,
 * but the English differs or its fingerprint was never stored) or `missing`.
 */
export function translationStatus(spec, lang) {
    const code = normalizeLanguage(lang) || lang;
    const table = isObject(spec) ? tableOf(spec, 'translations', code) : {};
    const sources = isObject(spec)
        ? tableOf(spec, 'translationSources', code)
        : {};
    return listTexts(spec).map((entry) => {
        const translation = table[entry.key];
        let status = 'missing';
        if (hasText(translation)) {
            status =
                sources[entry.key] === textFingerprint(entry.text)
                    ? 'done'
                    : 'changed';
        }
        return {
            ...entry,
            source: entry.text,
            translation: hasText(translation) ? translation : '',
            status
        };
    });
}

/** { total, done, missing, changed } for one language. */
export function translationProgress(spec, lang) {
    const out = { total: 0, done: 0, missing: 0, changed: 0 };
    translationStatus(spec, lang).forEach(({ status }) => {
        out.total += 1;
        out[status] += 1;
    });
    return out;
}

/**
 * A NEW spec with `text` stored as the `lang` translation of `key`, and the
 * fingerprint of the English it was written against. Blank text removes both.
 * A key that is not a listed text leaves the spec unchanged.
 */
export function setTranslation(spec, lang, key, text) {
    const copy = clone(spec);
    const code = normalizeLanguage(lang) || lang;
    const entry = listTexts(spec).find((x) => x.key === key);
    if (!entry) {
        return copy;
    }
    ['translations', 'translationSources'].forEach((block) => {
        if (!isObject(copy[block])) {
            copy[block] = {};
        }
        if (!isObject(copy[block][code])) {
            copy[block][code] = {};
        }
    });
    if (hasText(text)) {
        copy.translations[code][key] = text;
        copy.translationSources[code][key] = textFingerprint(entry.text);
    } else {
        delete copy.translations[code][key];
        delete copy.translationSources[code][key];
    }
    return copy;
}

/** A NEW spec offering `lang`; creates `languages` when the spec has none. */
export function addLanguage(spec, lang) {
    const copy = clone(spec);
    const code = normalizeLanguage(lang);
    if (!code) {
        return copy;
    }
    const languages = isObject(copy.languages) ? copy.languages : {};
    const def = normalizeLanguage(languages.default) || 'en_US';
    const available = asArray(languages.available)
        .map(normalizeLanguage)
        .filter(Boolean);
    if (!available.includes(def)) {
        available.unshift(def);
    }
    if (!available.includes(code)) {
        available.push(code);
    }
    copy.languages = { ...languages, default: def, available };
    return copy;
}

/**
 * A NEW spec without `lang`: its translations and fingerprints go too. The
 * default language is never removed.
 */
export function removeLanguage(spec, lang) {
    const copy = clone(spec);
    const code = normalizeLanguage(lang) || lang;
    const def = isObject(copy.languages)
        ? normalizeLanguage(copy.languages.default)
        : null;
    if (!code || code === def) {
        return copy;
    }
    if (isObject(copy.languages)) {
        copy.languages.available = asArray(copy.languages.available).filter(
            (a) => normalizeLanguage(a) !== code
        );
    }
    ['translations', 'translationSources'].forEach((block) => {
        if (isObject(copy[block])) {
            delete copy[block][code];
        }
    });
    return copy;
}

/**
 * A NEW spec without translation / fingerprint keys that no listed text
 * produces any more (deleted questions, options, rules; blanked English).
 */
export function pruneTranslations(spec) {
    const copy = clone(spec);
    const live = new Set(listTexts(spec).map((x) => x.key));
    ['translations', 'translationSources'].forEach((block) => {
        if (!isObject(copy[block])) {
            return;
        }
        Object.values(copy[block]).forEach((table) => {
            if (!isObject(table)) {
                return;
            }
            Object.keys(table).forEach((key) => {
                if (!live.has(key)) {
                    delete table[key];
                }
            });
        });
    });
    return copy;
}
