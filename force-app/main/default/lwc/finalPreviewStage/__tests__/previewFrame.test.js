import {
    DEVICES,
    PHONES,
    HOSTS,
    resolveFrame,
    normalizeFrame
} from '../previewFrame';

/**
 * Stage 5 of the cross-host audit (docs/FinalDesign/IMPL_PLAN_STAGE4_5_TYPED_FONT_AND_PREVIEW_FRAME.md).
 *
 * The expected form widths are what the REAL hosts gave the same in-memory form
 * on 2026-10-11 (signed-out public site, Lightning viewer tab): the screen minus
 * the margin the host's own page leaves on each side.
 */
const MEASURED = [
    { device: 'mobile', phone: '320', public: 290, lightning: 264 },
    { device: 'mobile', phone: '360', public: 330, lightning: 304 },
    { device: 'mobile', phone: '390', public: 360, lightning: 334 },
    { device: 'tablet', phone: '390', public: 738, lightning: 736 },
    { device: 'desktop', phone: '390', public: 1250, lightning: 1248 }
];

describe('preview frame model', () => {
    it.each(MEASURED)(
        'gives the form the width the real hosts give it (%j)',
        (row) => {
            const onPublic = resolveFrame({
                device: row.device,
                phone: row.phone,
                host: 'public'
            });
            const inLightning = resolveFrame({
                device: row.device,
                phone: row.phone,
                host: 'lightning'
            });
            expect([onPublic.formWidth, inLightning.formWidth]).toEqual([
                row.public,
                row.lightning
            ]);
        }
    );

    it('form width is always the screen minus a margin on each side, for every combination', () => {
        const wrong = [];
        for (const device of DEVICES) {
            for (const phone of PHONES) {
                for (const host of HOSTS) {
                    const f = resolveFrame({
                        device: device.key,
                        phone: phone.key,
                        host: host.key
                    });
                    if (f.formWidth !== f.screenWidth - 2 * f.margin) {
                        wrong.push(`${device.key}/${phone.key}/${host.key}`);
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it('edge to edge is the old frame: the form is the whole screen', () => {
        const frames = [
            resolveFrame({ device: 'desktop', phone: '390', host: 'none' }),
            resolveFrame({ device: 'tablet', phone: '390', host: 'none' }),
            resolveFrame({ device: 'mobile', phone: '390', host: 'none' })
        ];
        expect(frames.map((f) => [f.margin, f.formWidth])).toEqual([
            [0, 1280],
            [0, 768],
            [0, 390]
        ]);
    });

    it('the screen is the frame: phones come in 320, 360 and 390 with real-phone heights', () => {
        expect(PHONES.map((p) => [p.width, p.height])).toEqual([
            [320, 568],
            [360, 800],
            [390, 844]
        ]);
        expect(DEVICES.map((d) => [d.key, d.width, d.height])).toEqual([
            ['desktop', 1280, 800],
            ['tablet', 768, 1024],
            ['mobile', 390, 844]
        ]);
    });

    it('the phone choice only matters on Mobile', () => {
        const desktop = resolveFrame({
            device: 'desktop',
            phone: '320',
            host: 'public'
        });
        expect([desktop.screenWidth, desktop.screenHeight]).toEqual([
            1280, 800
        ]);
        const phone = resolveFrame({
            device: 'mobile',
            phone: '320',
            host: 'public'
        });
        expect([phone.screenWidth, phone.screenHeight]).toEqual([320, 568]);
    });

    it('Lightning leaves more room on a phone than on a tablet or desktop; the public site leaves the same everywhere', () => {
        const margin = (host, device) =>
            resolveFrame({ device, phone: '390', host }).margin;
        expect(
            ['mobile', 'tablet', 'desktop'].map((d) => margin('public', d))
        ).toEqual([15, 15, 15]);
        expect(
            ['mobile', 'tablet', 'desktop'].map((d) => margin('lightning', d))
        ).toEqual([28, 16, 16]);
    });

    describe('normalizeFrame (what a hand-off may carry)', () => {
        it('defaults to Desktop, a 390 phone and the Public site', () => {
            expect(normalizeFrame(undefined)).toEqual({
                device: 'desktop',
                phone: '390',
                host: 'public'
            });
            expect(normalizeFrame({})).toEqual({
                device: 'desktop',
                phone: '390',
                host: 'public'
            });
        });

        it('keeps valid keys and falls back per key for unknown ones', () => {
            expect(
                normalizeFrame({
                    device: 'tablet',
                    phone: '360',
                    host: 'lightning'
                })
            ).toEqual({ device: 'tablet', phone: '360', host: 'lightning' });
            expect(
                normalizeFrame({ device: 'watch', phone: '999', host: 'moon' })
            ).toEqual({ device: 'desktop', phone: '390', host: 'public' });
            expect(normalizeFrame({ device: 'mobile', phone: 360 }).phone).toBe(
                '360'
            );
        });

        it('an older hand-off without a phone or host still loads (Mobile is 390 on the Public site)', () => {
            expect(
                normalizeFrame({ device: 'mobile', zoom: 'actual' })
            ).toEqual({
                device: 'mobile',
                phone: '390',
                host: 'public'
            });
        });
    });
});
