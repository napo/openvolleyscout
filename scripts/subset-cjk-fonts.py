#!/usr/bin/env python3
"""Build the CJK fonts embedded in exported PDFs (Japanese and Chinese UI or names).

Ubuntu, the PDF font, has no CJK glyphs, so pdfmake would print blanks for
Japanese/Chinese text. The full Noto Sans JP/SC files are 5-10 MB per weight,
so this keeps what a match report realistically needs:

  * Latin, punctuation and symbols (team names, stats, units),
  * kana + the JIS X 0208 kanji (JP) / the GB 2312 hanzi (SC),
  * every character used by any locale in src/i18n/locales,
  * the Latin/Greek/Cyrillic letters Noto CJK lacks (e.g. ą č ł ş ő, common in
    player names), borrowed from the matching Ubuntu weight, because pdfmake
    typesets a whole document in one font and cannot fall back per glyph.

Sources: the static Noto Sans JP/SC TTFs (SIL OFL 1.1), e.g. from the
@expo-google-fonts/noto-sans-jp and @expo-google-fonts/noto-sans-sc npm packages.

Usage: pip install fonttools
       python3 scripts/subset-cjk-fonts.py <dir with NotoSans{JP,SC}_{400Regular,700Bold}.ttf>
"""
import pathlib
import sys

import tempfile

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'src' / 'assets' / 'fonts' / 'noto-cjk'
UBUNTU_DIR = ROOT / 'src' / 'assets' / 'fonts' / 'ubuntu'

COMMON_RANGES = [
    (0x0020, 0x024F),  # Basic Latin, Latin-1, Latin Extended-A/B
    (0x0300, 0x036F),  # combining diacritics
    (0x0370, 0x03FF),  # Greek
    (0x2000, 0x206F),  # general punctuation
    (0x2070, 0x209F),  # super/subscripts
    (0x20A0, 0x20CF),  # currency
    (0x2100, 0x21FF),  # letterlike, number forms, arrows
    (0x2200, 0x22FF),  # math operators
    (0x2460, 0x24FF),  # enclosed alphanumerics
    (0x2500, 0x25FF),  # box drawing, blocks, geometric shapes
    (0x2600, 0x26FF),  # misc symbols (stars)
    (0x3000, 0x303F),  # CJK symbols and punctuation
    (0x3040, 0x30FF),  # hiragana, katakana
    (0x31F0, 0x31FF),  # katakana phonetic extensions
    (0xFF00, 0xFFEF),  # half/full-width forms
]


def chars_in_codec(codec: str) -> set[int]:
    """Every BMP code point the legacy encoding can represent."""
    result = set()
    for cp in range(0x80, 0x10000):
        if 0xD800 <= cp <= 0xDFFF:
            continue
        try:
            chr(cp).encode(codec)
        except UnicodeEncodeError:
            continue
        result.add(cp)
    return result


def locale_chars() -> set[int]:
    result = set()
    for path in (ROOT / 'src' / 'i18n' / 'locales').glob('*.ts'):
        result.update(ord(c) for c in path.read_text(encoding='utf-8') if ord(c) > 0x7F)
    return result


def subset_font(src: pathlib.Path, out: pathlib.Path, unicodes: set[int]) -> None:
    options = subset.Options()
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = ['*']
    options.notdef_outline = True
    font = subset.load_font(str(src), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    subset.save_font(font, str(out), options)


def add_missing_glyphs(font: TTFont, donor: TTFont) -> int:
    """Copy into `font` the donor's glyphs for code points `font` does not map.

    Both are TrueType fonts with 1000 units/em; accented letters (composites in
    Ubuntu) are decomposed, so no component references cross the fonts.
    """
    assert font['head'].unitsPerEm == donor['head'].unitsPerEm
    cmap = font.getBestCmap()
    donor_cmap = donor.getBestCmap()
    donor_glyphs = donor.getGlyphSet()
    glyf, hmtx = font['glyf'], font['hmtx']
    added = 0
    for cp in sorted(set(donor_cmap) - set(cmap)):
        name = f'ubuntu.{donor_cmap[cp]}'
        if name not in glyf:
            recording = DecomposingRecordingPen(donor_glyphs)
            donor_glyphs[donor_cmap[cp]].draw(recording)
            pen = TTGlyphPen(None)
            recording.replay(pen)
            glyf[name] = pen.glyph()
            glyf[name].recalcBounds(glyf)
            hmtx[name] = (donor['hmtx'][donor_cmap[cp]][0], glyf[name].xMin if glyf[name].numberOfContours else 0)
        for table in font['cmap'].tables:
            if table.isUnicode() and (cp <= 0xFFFF or table.format == 12):
                table.cmap[cp] = name
        added += 1
    # glyf[name] = ... already appended the new names to the font's glyph order.
    font['maxp'].numGlyphs = len(font.getGlyphOrder())
    if 'post' in font:
        font['post'].formatType = 3.0  # drop glyph names instead of extending the list
    return added


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src_dir = pathlib.Path(sys.argv[1])
    common = {cp for lo, hi in COMMON_RANGES for cp in range(lo, hi + 1)} | locale_chars()
    charsets = {
        'JP': common | chars_in_codec('cp932'),
        'SC': common | chars_in_codec('gb2312'),
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for script, unicodes in charsets.items():
        for weight in ('400Regular', '700Bold'):
            src = next(src_dir.rglob(f'NotoSans{script}_{weight}.ttf'))
            out = OUT_DIR / f'NotoSans{script}-{weight.removeprefix("400").removeprefix("700")}.ttf'
            with tempfile.TemporaryDirectory() as tmp:
                cjk = pathlib.Path(tmp) / 'cjk.ttf'
                subset_font(src, cjk, unicodes)
                font = TTFont(str(cjk))
                ubuntu = TTFont(str(UBUNTU_DIR / f'Ubuntu-{"Bold" if weight == "700Bold" else "Regular"}.ttf'))
                add_missing_glyphs(font, ubuntu)
                font.save(str(out))
            print(f'{out.relative_to(ROOT)}: {out.stat().st_size / 1024:.0f} KiB')


if __name__ == '__main__':
    main()
