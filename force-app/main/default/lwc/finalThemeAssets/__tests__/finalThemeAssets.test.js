// A subscriber org: the namespace renames the bundle and Salesforce adds a
// cache-buster, so the portable /resource/formThemeAssets/ text is wrong there.
jest.mock(
    '@salesforce/resourceUrl/formThemeAssets',
    () => ({ default: '/resource/1719444000000/acme__formThemeAssets' }),
    { virtual: true }
);

import { localizeAssetUrl, localizeAssetUrls } from 'c/finalThemeAssets';

const REAL = '/resource/1719444000000/acme__formThemeAssets';

describe('localizeAssetUrl', () => {
    it('swaps the portable prefix inside url("...")', () => {
        expect(
            localizeAssetUrl('url("/resource/formThemeAssets/ocean.jpg")')
        ).toBe(`url("${REAL}/ocean.jpg")`);
    });

    it("swaps inside url('...') shorthand (header backgrounds)", () => {
        expect(
            localizeAssetUrl(
                "url('/resource/formThemeAssets/marble.jpg') center/cover no-repeat"
            )
        ).toBe(`url('${REAL}/marble.jpg') center/cover no-repeat`);
    });

    it('swaps a bare address (the Design panel thumbnail value)', () => {
        expect(localizeAssetUrl('/resource/formThemeAssets/desert.jpg')).toBe(
            `${REAL}/desert.jpg`
        );
    });

    it('swaps every photo in a layered value', () => {
        expect(
            localizeAssetUrl(
                "url('/resource/formThemeAssets/a.jpg'), url('/resource/formThemeAssets/b.jpg')"
            )
        ).toBe(`url('${REAL}/a.jpg'), url('${REAL}/b.jpg')`);
    });

    it('is harmless when run twice', () => {
        const once = localizeAssetUrl('url("/resource/formThemeAssets/x.jpg")');
        expect(localizeAssetUrl(once)).toBe(once);
    });

    it('never touches the prefix in the middle of another URL', () => {
        const other =
            'url("https://cdn.example.com/resource/formThemeAssets/x.jpg")';
        expect(localizeAssetUrl(other)).toBe(other);
    });

    it('passes everything else through untouched', () => {
        expect(localizeAssetUrl('#ffffff')).toBe('#ffffff');
        expect(localizeAssetUrl('none')).toBe('none');
        expect(
            localizeAssetUrl('/sfc/servlet.shepherd/version/download/068xx')
        ).toBe('/sfc/servlet.shepherd/version/download/068xx');
        expect(localizeAssetUrl(null)).toBe(null);
        expect(localizeAssetUrl(undefined)).toBe(undefined);
        expect(localizeAssetUrl(12)).toBe(12);
    });
});

describe('localizeAssetUrls', () => {
    it('swaps photo tokens and leaves the rest alone', () => {
        const tokens = {
            '--c-page-bg': '#f0f9ff',
            '--c-page-bg-image': 'url("/resource/formThemeAssets/ocean.jpg")',
            '--c-header-bg':
                "url('/resource/formThemeAssets/wood.jpg') center/cover no-repeat"
        };
        expect(localizeAssetUrls(tokens)).toEqual({
            '--c-page-bg': '#f0f9ff',
            '--c-page-bg-image': `url("${REAL}/ocean.jpg")`,
            '--c-header-bg': `url('${REAL}/wood.jpg') center/cover no-repeat`
        });
    });

    it('never mutates the stored bag (published snapshots stay portable)', () => {
        const tokens = {
            '--c-page-bg-image': 'url("/resource/formThemeAssets/ocean.jpg")'
        };
        localizeAssetUrls(tokens);
        expect(tokens['--c-page-bg-image']).toBe(
            'url("/resource/formThemeAssets/ocean.jpg")'
        );
    });

    it('returns the same object when there is no photo', () => {
        const tokens = { '--c-page-bg': '#fff', '--c-page-bg-image': 'none' };
        expect(localizeAssetUrls(tokens)).toBe(tokens);
    });

    it('tolerates a missing bag', () => {
        expect(localizeAssetUrls(null)).toBe(null);
        expect(localizeAssetUrls(undefined)).toBe(undefined);
    });
});
