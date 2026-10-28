import {
    previewGeometry,
    previewSettings,
    newLayoutDefaults
} from 'c/finalLayoutRegistry';
import { MAX_WIDTHS, BLEED_MAX_WIDTHS } from 'c/finalPageFrame';

// IMPL_PLAN_SPLIT_DEFAULTS_AND_PREVIEW §3: a picker preview stands for a
// 1280px desktop and draws the form at its real width share, from the same
// tables c/finalPageFrame uses.

describe('previewGeometry: carded layouts', () => {
    it.each([
        ['narrow', '43.8%'],
        ['medium', '59.4%'],
        ['wide', '81.3%'],
        ['full', '100%']
    ])('%s draws the card at %s of the page', (width, card) => {
        expect(previewGeometry('scroll', undefined, width)).toEqual({
            bleed: false,
            card
        });
    });

    it('unset width reads Medium, as the page frame does', () => {
        expect(previewGeometry('tabs', undefined, undefined).card).toBe(
            '59.4%'
        );
    });

    it('reads the page frame tables, not copies', () => {
        expect(MAX_WIDTHS.medium).toBe('760px');
        expect(BLEED_MAX_WIDTHS.wide).toBe('680px');
    });

    it('full-bleed off makes a bleed layout carded', () => {
        expect(previewGeometry('splitHero', false, 'wide')).toEqual({
            bleed: false,
            card: '81.3%'
        });
        expect(previewGeometry('oneAtATime', false, undefined)).toEqual({
            bleed: false,
            card: '59.4%'
        });
    });

    it('full-bleed is meaningless on a layout that cannot bleed', () => {
        expect(previewGeometry('stepper', true, 'medium').bleed).toBe(false);
    });
});

describe('previewGeometry: full-bleed', () => {
    it('One at a time, unset: its own 640px question column', () => {
        expect(previewGeometry('oneAtATime', undefined, undefined)).toEqual({
            bleed: true,
            card: '50%'
        });
    });

    it('One at a time, a picked width uses the bleed scale', () => {
        expect(previewGeometry('oneAtATime', true, 'narrow').card).toBe(
            '37.5%'
        );
        expect(previewGeometry('oneAtATime', true, 'full').card).toBe('100%');
    });

    it('Split, unset: halves, the card fills 90% of the form side', () => {
        expect(previewGeometry('splitHero', undefined, undefined)).toEqual({
            bleed: true,
            form: '50%',
            card: '83.3%'
        });
    });

    it('Split at Wide: the form side grows past half (pane shrinks)', () => {
        expect(previewGeometry('splitHero', true, 'wide')).toEqual({
            bleed: true,
            form: '56.9%',
            card: '93.4%'
        });
    });

    it('Split at Full: the form side stops at 60%', () => {
        expect(previewGeometry('splitHero', true, 'full').form).toBe('60%');
    });
});

describe('previewSettings', () => {
    it('no form (the new-form gallery): a new form’s start', () => {
        expect(previewSettings(null, 'splitHero', '')).toEqual(
            newLayoutDefaults('splitHero', '')
        );
    });

    it('the form’s own layout: its own settings', () => {
        const own = {
            type: 'splitHero',
            options: {},
            maxWidth: 'narrow'
        };
        expect(previewSettings(own, 'splitHero', '')).toBe(own);
    });

    it('another layout: what a switch would give', () => {
        const own = { type: 'scroll', options: {}, maxWidth: 'narrow' };
        const split = previewSettings(own, 'splitHero', '');
        expect(split.options.fullBleed).toBe(false);
        expect(split.maxWidth).toBe('wide');
        expect(previewSettings(own, 'tabs', '').maxWidth).toBe('narrow');
    });

    it('Split vs Conversational are different layouts to preview', () => {
        const own = { type: 'splitHero', options: {}, maxWidth: 'medium' };
        const convo = previewSettings(own, 'splitHero', 'oneAtATime');
        expect(convo.options).toEqual({ paneFlow: 'oneAtATime' });
        expect(convo.maxWidth).toBe('medium');
    });
});

describe('previewGeometry: carded Split pane (PR 413 review)', () => {
    it('Half is a true half, Third a third', () => {
        expect(previewGeometry('splitHero', false, 'wide').pane).toBe('50%');
        expect(previewGeometry('splitHero', false, 'wide', 'third').pane).toBe(
            '33.3%'
        );
    });

    it('Narrow stacks the brand pane on top, as the real split does', () => {
        // 560px panel - 64px padding = 496px, under the 540px stack point
        expect(previewGeometry('splitHero', false, 'narrow').stacked).toBe(
            true
        );
        expect(previewGeometry('splitHero', false, 'medium').stacked).toBe(
            false
        );
    });

    it('full-bleed ignores Pane width, as the real split does', () => {
        expect(
            'pane' in previewGeometry('splitHero', true, undefined, 'third')
        ).toBe(false);
    });
});
