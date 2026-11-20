import {
    t,
    tn,
    resolveLanguage,
    normalizeLanguage,
    loadLanguage,
    setLabelOverrides,
    clearLabelOverrides
} from 'c/finalTranslate';
import { EN } from '../defaults';
import runtimeLabels from '@salesforce/apex/FinalGuestController.runtimeLabels';

jest.mock(
    '@salesforce/apex/FinalGuestController.runtimeLabels',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

afterEach(() => {
    clearLabelOverrides();
    runtimeLabels.mockReset();
    window.history.replaceState({}, '', '/');
});

describe('t()', () => {
    it('falls back to the English default when the label import is the jest stub', () => {
        expect(t('Final_Run_Next')).toBe('Next');
        expect(t('Final_Run_Submit')).toBe(EN.Final_Run_Submit);
    });

    it('prefers an override, then falls back again when it is cleared', () => {
        setLabelOverrides({ Final_Run_Next: 'Suivant' });
        expect(t('Final_Run_Next')).toBe('Suivant');
        expect(t('Final_Run_Back')).toBe('Back');
        clearLabelOverrides();
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('ignores an empty override', () => {
        setLabelOverrides({ Final_Run_Next: '' });
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('returns the name itself for an unknown label', () => {
        expect(t('Final_Run_DoesNotExist')).toBe('Final_Run_DoesNotExist');
    });

    it('replaces {0}, {1} placeholders and keeps unmatched ones', () => {
        expect(t('Final_Run_PageOf', 2, 5)).toBe('2 of 5');
        expect(t('Final_Run_PageOf', 0, 3)).toBe('0 of 3');
        expect(t('Final_Run_PageOf', 2)).toBe('2 of {1}');
        // the repeat-entry title keeps its own {index} token
        expect(t('Final_Run_EntryDefault')).toBe('Entry {index}');
    });

    it('does not treat a replacement value as a pattern', () => {
        expect(t('Final_Run_ClearNamed', '$& $1')).toBe('Clear $& $1');
    });

    it('applies placeholders to an override too', () => {
        setLabelOverrides({ Final_Run_PageOf: '{1} sur {0}' });
        expect(t('Final_Run_PageOf', 2, 5)).toBe('5 sur 2');
    });
});

describe('tn()', () => {
    it('picks singular for 1 and plural otherwise, passing n as {0}', () => {
        expect(
            tn(
                'Final_Run_FixFieldsContinueOne',
                'Final_Run_FixFieldsContinueMany',
                1
            )
        ).toBe('Fix 1 field to continue');
        expect(
            tn(
                'Final_Run_FixFieldsContinueOne',
                'Final_Run_FixFieldsContinueMany',
                3
            )
        ).toBe('Fix 3 fields to continue');
        expect(
            tn('Final_Run_MinEntriesOne', 'Final_Run_MinEntriesMany', 2)
        ).toBe('Fill in at least 2 entries.');
    });
});

describe('language codes', () => {
    it.each([
        ['fr', 'fr'],
        ['fr_CA', 'fr_CA'],
        ['fr-CA', 'fr_CA'],
        ['fr-ca', 'fr_CA'],
        ['haw', 'haw'],
        ['  de  ', 'de']
    ])('normalises %s to %s', (input, expected) => {
        expect(normalizeLanguage(input)).toBe(expected);
        expect(resolveLanguage({ param: input })).toBe(expected);
    });

    it.each([
        'FR',
        'french',
        'f',
        'fr_',
        'fr-CAN',
        'en_US_x',
        '../x',
        'fr;x',
        '',
        null,
        undefined
    ])('rejects %p', (input) => {
        expect(normalizeLanguage(input)).toBeNull();
    });

    it('reads ?lang= from the URL when no param is given', () => {
        window.history.replaceState({}, '', '/form?lang=fr-CA');
        expect(resolveLanguage({})).toBe('fr_CA');
        expect(resolveLanguage()).toBe('fr_CA');
    });

    it('reads ?c__lang= too, and prefers the host-supplied param', () => {
        window.history.replaceState({}, '', '/form?c__lang=de');
        expect(resolveLanguage({})).toBe('de');
        expect(resolveLanguage({ param: 'es' })).toBe('es');
    });

    it('is null with no param and no URL language', () => {
        window.history.replaceState({}, '', '/form?other=1');
        expect(resolveLanguage({})).toBeNull();
    });

    it('is null for a bad URL value', () => {
        window.history.replaceState({}, '', '/form?lang=%3Cscript%3E');
        expect(resolveLanguage({})).toBeNull();
    });
});

describe('loadLanguage()', () => {
    it('sets overrides from Apex', async () => {
        runtimeLabels.mockResolvedValue({ Final_Run_Next: 'Weiter' });
        await loadLanguage('de');
        expect(runtimeLabels).toHaveBeenCalledWith({ lang: 'de' });
        expect(t('Final_Run_Next')).toBe('Weiter');
        expect(t('Final_Run_Back')).toBe('Back');
    });

    it('clears overrides for a null language without calling Apex', async () => {
        setLabelOverrides({ Final_Run_Next: 'Weiter' });
        await loadLanguage(null);
        expect(runtimeLabels).not.toHaveBeenCalled();
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('swallows an Apex error and falls back to the defaults', async () => {
        setLabelOverrides({ Final_Run_Next: 'stale' });
        runtimeLabels.mockRejectedValue(new Error('boom'));
        await expect(loadLanguage('fr')).resolves.toBeUndefined();
        expect(t('Final_Run_Next')).toBe('Next');
    });

    it('treats an empty Apex answer as no translations', async () => {
        runtimeLabels.mockResolvedValue(undefined);
        await loadLanguage('fr');
        expect(t('Final_Run_Next')).toBe('Next');
    });
});
