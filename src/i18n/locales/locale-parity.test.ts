import { describe, expect, it } from 'vitest';
import { en } from './en';
import { it as itLocale } from './it';
import { de } from './de';
import { es } from './es';
import { ro } from './ro';
import { sl } from './sl';
import { tr } from './tr';
import { ar } from './ar';
import { ja } from './ja';
import { zh } from './zh';

const locales: Record<string, Record<string, string>> = { it: itLocale, de, es, ro, sl, tr, ar, ja, zh };

describe('locale parity', () => {
  it.each(Object.keys(locales))('%s has every English key', (name) => {
    const missing = Object.keys(en).filter((key) => !(key in locales[name]));
    expect(missing).toEqual([]);
  });

  it.each(Object.keys(locales))('%s keeps the English placeholders', (name) => {
    const placeholders = (value: string) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
    const broken = Object.entries(en as Record<string, string>)
      .filter(([key, value]) => key in locales[name] && placeholders(value).some((p) => !placeholders(locales[name][key]).includes(p)))
      .map(([key]) => key);
    expect(broken).toEqual([]);
  });
});
