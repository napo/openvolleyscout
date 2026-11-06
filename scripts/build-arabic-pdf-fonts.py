#!/usr/bin/env python3
"""Build mixed Arabic/Latin PDF fonts from installed SIL OFL Noto font sources.

Usage: python3 scripts/build-arabic-pdf-fonts.py /usr/share/fonts/truetype/noto
Requires the same fonttools tooling as subset-cjk-fonts.py; no runtime dependency.
Arabic shaping tables are preserved. Missing Latin glyphs use the existing CJK
font builder's donor routine. Font notices: src/assets/fonts/noto-arabic/OFL.txt.
"""
import importlib.util
from pathlib import Path
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('cjk_builder', ROOT / 'scripts/subset-cjk-fonts.py')
cjk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cjk)


def main():
    source = Path(sys.argv[1])
    output = ROOT / 'src/assets/fonts/noto-arabic'
    output.mkdir(exist_ok=True)
    for weight in ['Regular', 'Bold']:
        font = TTFont(source / f'NotoSansArabic-{weight}.ttf')
        donor = TTFont(source / f'NotoSans-{weight}.ttf')
        cjk.add_missing_glyphs(font, donor)
        for record in font['name'].names:
            if record.nameID in [1, 2, 3, 4, 6, 16, 17]:
                value = f'OVSArabic-{weight}' if record.nameID in [3, 4, 6] else ('OVSArabic' if record.nameID in [1, 16] else weight)
                record.string = value.encode(record.getEncoding())
        options = subset.Options()
        options.hinting = False
        options.notdef_outline = True
        options.name_IDs = ['*']
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=sorted(font.getBestCmap()))
        subsetter.subset(font)
        font.save(output / f'OVSArabic-{weight}.ttf')


if __name__ == '__main__':
    main()
