import { LightningElement, api } from 'lwc';
import { t, normalizeLanguage } from 'c/finalTranslate';

/**
 * finalLanguageMenu: the respondent's language chip (translations PR 4).
 *
 * A native <select> dressed as a chip. The browser supplies the keyboard
 * (Arrow keys, Enter/Space, type-ahead) and the screen-reader announcement
 * ("Language, combobox, Français"), so there is no hand-built listbox to get
 * wrong. Names are written in each language's OWN language
 * (Intl.DisplayNames), first letter capitalised, falling back to the code.
 *
 * Respondent side: reads `--c-*` theme tokens only, never `--c-studio-*`.
 */
function ownName(tag) {
    try {
        const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
        if (name && name !== tag) {
            return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
        }
    } catch {
        // an unknown code: the caller falls back to the code itself
    }
    return null;
}

/**
 * A language's name in its own language ("Français"). A regional code shows
 * the plain language ("English", not "American English") unless `full` asks
 * for the regional name (two variants of one language are on offer).
 */
export function languageName(code, full = false) {
    const clean = normalizeLanguage(code) || String(code || '');
    const tag = clean.replace('_', '-');
    return ownName(full ? tag : tag.split('-')[0]) || ownName(tag) || clean;
}

export default class FinalLanguageMenu extends LightningElement {
    /** Language codes on offer, in author order. */
    @api languages = [];
    /** The code showing now. */
    @api value;

    get label() {
        return t('Final_Run_Language');
    }

    get options() {
        const list = Array.isArray(this.languages) ? this.languages : [];
        const plain = list.map((code) => languageName(code));
        return list.map((code, i) => ({
            code,
            // en_US and en_GB both on offer: tell them apart
            name:
                plain.filter((n) => n === plain[i]).length > 1
                    ? languageName(code, true)
                    : plain[i],
            selected: code === this.value
        }));
    }

    handleChange(event) {
        const code = event.target.value;
        if (code && code !== this.value) {
            this.dispatchEvent(
                new CustomEvent('languagechange', {
                    detail: { language: code }
                })
            );
        }
    }
}
