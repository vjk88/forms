#!/usr/bin/env python3
"""
build-pdf-fonts — builds the `formPdfFonts` static resource (IMPL_PLAN_FORM_PDF §3).

A developer tool, run by hand after `build-font-bundle.mjs`, never at runtime:

    python3 -m pip install fonttools brotli
    python3 scripts/fonts/build-pdf-fonts.py           # build everything
    python3 scripts/fonts/build-pdf-fonts.py --check   # writes nothing; exits 1
                                                       # if the resource is stale

Why it exists: the PDF writer (pdf-lib + fontkit) cannot embed the bundled
WOFF2 files. fontkit's WOFF2 reader breaks on transformed glyph tables (the
subsetter crashes, and an unsubsetted WOFF2 lands in the PDF as an invalid
font). Plain TrueType works, so every bundled face is converted here:

    variable file, weight '400 700'  → <name>-400.ttf and <name>-700.ttf
                                       (static instances: real bold, no faking)
    static file,   weight '400'/'700' → <name>.ttf

finalPdfFonts.pdfFontFiles() derives the same names from bundledFontData.js,
so the browser needs no manifest. Licence files are copied beside each family.
"""
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'force-app/main/default/staticresources/formFonts')
OUT = os.path.join(ROOT, 'force-app/main/default/staticresources/formPdfFonts')
DATA = os.path.join(
    ROOT, 'force-app/main/default/lwc/finalFontFamilies/bundledFontData.js'
)


def faces():
    """(file, weight) pairs from the generated bundle data (the one source)."""
    text = open(DATA, encoding='utf-8').read()
    return re.findall(r"file:\s*'([^']+)',\s*weight:\s*'([^']+)'", text)


def outputs(file, weight):
    """The TTF names for one bundled face, with the weight each one holds."""
    base = file[: -len('.woff2')]
    if ' ' in weight:  # variable: '400 700'
        return [(f'{base}-400.ttf', 400), (f'{base}-700.ttf', 700)]
    return [(f'{base}.ttf', None)]


def convert(src, weight):
    # recalcTimestamp=False keeps head.modified from the source, so a rebuild
    # is byte-identical and --check can compare hashes.
    font = TTFont(src, recalcTimestamp=False)
    if weight is not None and 'fvar' in font:
        loc = {}
        for axis in font['fvar'].axes:
            if axis.axisTag == 'wght':
                loc['wght'] = max(axis.minValue, min(axis.maxValue, weight))
            else:
                loc[axis.axisTag] = axis.defaultValue
        font = instancer.instantiateVariableFont(font, loc)
    font.flavor = None
    font.recalcTimestamp = False
    return font


def build(target):
    manifest = {}
    for file, weight in faces():
        src = os.path.join(SRC, file)
        for name, w in outputs(file, weight):
            dest = os.path.join(target, name)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            convert(src, w).save(dest)
            with open(dest, 'rb') as fh:
                manifest[name] = hashlib.sha256(fh.read()).hexdigest()
        lic_dir = os.path.dirname(file)
        for lic in os.listdir(os.path.join(SRC, lic_dir)):
            if not lic.endswith('.woff2'):
                shutil.copy(
                    os.path.join(SRC, lic_dir, lic),
                    os.path.join(target, lic_dir, lic),
                )
    notices = os.path.join(SRC, 'THIRD-PARTY-NOTICES.txt')
    if os.path.exists(notices):
        shutil.copy(notices, os.path.join(target, 'THIRD-PARTY-NOTICES.txt'))
    with open(os.path.join(target, 'fonts.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write('\n')
    return manifest


def main():
    if '--check' in sys.argv:
        with tempfile.TemporaryDirectory() as tmp:
            fresh = build(tmp)
        try:
            with open(os.path.join(OUT, 'fonts.json'), encoding='utf-8') as fh:
                committed = json.load(fh)
        except FileNotFoundError:
            committed = {}
        if fresh != committed:
            print('formPdfFonts is stale: run scripts/fonts/build-pdf-fonts.py')
            sys.exit(1)
        print('formPdfFonts is up to date')
        return
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    manifest = build(OUT)
    print(f'wrote {len(manifest)} fonts to {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
