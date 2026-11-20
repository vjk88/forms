/**
 * Keeps the four copies of the built-in respondent words in step:
 *   labels/CustomLabels.labels-meta.xml  (what the org gets)
 *   finalTranslate/defaults.js           (EN, the fallback)
 *   finalTranslate.js imports            (every label is imported)
 *   FinalGuestController.RUNTIME_LABEL_NAMES (what Apex serves per language)
 */
const fs = require('fs');
const path = require('path');
const { EN } = require('../defaults');

const ROOT = path.resolve(
    __dirname,
    '../../../../../../force-app/main/default'
);

function unescapeXml(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function readXmlLabels() {
    const xml = fs.readFileSync(
        path.join(ROOT, 'labels/CustomLabels.labels-meta.xml'),
        'utf8'
    );
    const out = {};
    const blocks = xml.match(/<labels\s*>[\s\S]*?<\/labels>/g) || [];
    blocks.forEach((block) => {
        const name = /<fullName\s*>([^<]+)<\/fullName>/.exec(block)[1];
        const value = /<value\s*>([\s\S]*?)<\/value>/.exec(block)[1];
        out[name] = {
            value: unescapeXml(value),
            language: /<language\s*>([^<]+)<\/language>/.exec(block)[1],
            category: /<categories\s*>([^<]+)<\/categories>/.exec(block)[1],
            protectedFlag: /<protected\s*>([^<]+)<\/protected>/.exec(block)[1],
            description: unescapeXml(
                /<shortDescription\s*>([\s\S]*?)<\/shortDescription>/.exec(
                    block
                )[1]
            )
        };
    });
    return out;
}

function readApexNames() {
    const cls = fs.readFileSync(
        path.join(ROOT, 'classes/FinalGuestController.cls'),
        'utf8'
    );
    const block =
        /BEGIN RUNTIME_LABEL_NAMES([\s\S]*?)END RUNTIME_LABEL_NAMES/.exec(
            cls
        )[1];
    return (block.match(/'Final_Run_[A-Za-z0-9_]+'/g) || []).map((s) =>
        s.slice(1, -1)
    );
}

describe('built-in word labels stay in sync', () => {
    const xml = readXmlLabels();
    const xmlNames = Object.keys(xml);

    it('has labels', () => {
        expect(xmlNames.length).toBeGreaterThan(50);
    });

    it('every Final_Run_ label in the XML is in EN with the identical value', () => {
        xmlNames.forEach((name) => {
            expect(name.startsWith('Final_Run_')).toBe(true);
            expect(EN[name]).toBe(xml[name].value);
        });
    });

    it('every EN key is in the XML', () => {
        Object.keys(EN).forEach((name) => {
            expect(xmlNames).toContain(name);
        });
        expect(Object.keys(EN).length).toBe(xmlNames.length);
    });

    it('every label is well-formed for Salesforce', () => {
        xmlNames.forEach((name) => {
            expect(name.length).toBeLessThanOrEqual(40);
            expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
            expect(xml[name].language).toBe('en_US');
            expect(xml[name].category).toBe('FinalRuntime');
            expect(xml[name].protectedFlag).toBe('false');
            expect(xml[name].description.length).toBeGreaterThan(0);
            expect(xml[name].description.length).toBeLessThanOrEqual(80);
            expect(xml[name].value.length).toBeLessThanOrEqual(1000);
        });
    });

    it('the Apex name list is exactly the same set (no duplicates)', () => {
        const apex = readApexNames();
        expect(new Set(apex).size).toBe(apex.length);
        expect([...apex].sort()).toEqual([...xmlNames].sort());
    });

    it('finalTranslate.js imports every label', () => {
        const js = fs.readFileSync(
            path.join(ROOT, 'lwc/finalTranslate/finalTranslate.js'),
            'utf8'
        );
        const imported = (
            js.match(/@salesforce\/label\/c\.(Final_Run_[A-Za-z0-9_]+)/g) || []
        ).map((s) => s.split('c.')[1]);
        expect([...imported].sort()).toEqual([...xmlNames].sort());
    });

    it('placeholders in each value are {0}..{n} (plus the {index} token)', () => {
        xmlNames.forEach((name) => {
            const tokens = xml[name].value.match(/\{[^}]*\}/g) || [];
            tokens.forEach((tok) => {
                expect(tok).toMatch(/^\{(\d+|index)\}$/);
            });
        });
    });
});
