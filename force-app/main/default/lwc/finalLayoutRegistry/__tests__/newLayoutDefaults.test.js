import { newLayoutDefaults, layoutAfterSwitch } from 'c/finalLayoutRegistry';
import { buildSampleSpec } from 'c/finalSampleSpec';

// The table every new form starts from. FinalFormCreateControllerTest pins
// the SAME literal against Apex layoutBlock, so the new-form preview and the
// created form cannot drift apart.
const NEW_LAYOUT_TABLE =
    'scroll:medium:-|stepper:medium:-|tabs:medium:-|accordion:medium:-|' +
    'rail:medium:-|oneAtATime:medium:-|splitHero:wide:false';
const LAYOUTS = [
    'scroll',
    'stepper',
    'tabs',
    'accordion',
    'rail',
    'oneAtATime',
    'splitHero'
];
const row = (type, block) => {
    const bleed = block.options.fullBleed;
    return `${type}:${block.maxWidth}:${bleed === undefined ? '-' : bleed}`;
};

describe('newLayoutDefaults', () => {
    it('matches the table Apex layoutBlock is pinned to', () => {
        expect(LAYOUTS.map((t) => row(t, newLayoutDefaults(t))).join('|')).toBe(
            NEW_LAYOUT_TABLE
        );
    });

    it('Conversational Split starts carded and Wide too', () => {
        expect(newLayoutDefaults('splitHero', 'oneAtATime')).toEqual({
            type: 'splitHero',
            options: { fullBleed: false, paneFlow: 'oneAtATime' },
            maxWidth: 'wide',
            zonesDefault: { arrangement: 'single', gap: 'md' }
        });
    });

    it('pane flow never rides off Split', () => {
        expect(newLayoutDefaults('stepper', 'oneAtATime').options).toEqual({});
    });

    it('hands out a fresh object every call', () => {
        const a = newLayoutDefaults('splitHero');
        a.options.fullBleed = true;
        expect(newLayoutDefaults('splitHero').options.fullBleed).toBe(false);
    });

    it('the new-form preview spec uses exactly these defaults', () => {
        LAYOUTS.forEach((t) => {
            expect(buildSampleSpec({ layout: t }).layout).toEqual(
                newLayoutDefaults(t)
            );
        });
    });
});

describe('layoutAfterSwitch', () => {
    const scroll = { type: 'scroll', options: {}, maxWidth: 'narrow' };

    it('into Split: carded and Wide', () => {
        const next = layoutAfterSwitch(scroll, 'splitHero', '');
        expect(next.options).toEqual({ fullBleed: false });
        expect(next.maxWidth).toBe('wide');
    });

    it('leaving Split: options rebuilt, width kept', () => {
        const next = layoutAfterSwitch(
            {
                type: 'splitHero',
                options: { fullBleed: false, paneFlow: 'oneAtATime' },
                maxWidth: 'wide'
            },
            'tabs',
            ''
        );
        expect(next.options).toEqual({});
        expect(next.maxWidth).toBe('wide');
    });

    it('Split to Conversational keeps the saved settings, unset included', () => {
        const saved = { type: 'splitHero', options: {}, maxWidth: 'narrow' };
        const next = layoutAfterSwitch(saved, 'splitHero', 'oneAtATime');
        expect(next.options).toEqual({ paneFlow: 'oneAtATime' });
        expect(next.maxWidth).toBe('narrow');
    });

    it('between other layouts nothing new is set; an unset width stays unset', () => {
        const next = layoutAfterSwitch(
            { type: 'scroll', options: { showDividers: true } },
            'oneAtATime',
            ''
        );
        expect(next.options).toEqual({});
        expect('maxWidth' in next).toBe(false);
        expect(next.zonesDefault).toEqual({ arrangement: 'single', gap: 'md' });
    });

    it('does not change the layout it was given', () => {
        const before = JSON.stringify(scroll);
        layoutAfterSwitch(scroll, 'splitHero', 'oneAtATime');
        expect(JSON.stringify(scroll)).toBe(before);
    });
});
