import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeCp1251, decodeTextFile, encodeUtf8WithBom, isValidUtf8 } from '../../src/shared/integrations/encoding';

describe('кодировки файлов', () => {
  it('UTF-8 с BOM и без', () => {
    const text = 'Дата;Дисциплина\n03.11.2026;Экономика — лекция ё №';
    const withBom = encodeUtf8WithBom(text);
    assert.deepEqual(decodeTextFile(withBom), { text, encoding: 'utf-8' });
    assert.deepEqual(decodeTextFile(Buffer.from(text, 'utf8')), { text, encoding: 'utf-8' });
    assert.deepEqual(Buffer.from(withBom.subarray(3)).toString('utf8'), text);
  });

  it('Windows-1251 из Excel', () => {
    // «Дата;Право» в cp1251
    const bytes = Uint8Array.from([0xc4, 0xe0, 0xf2, 0xe0, 0x3b, 0xcf, 0xf0, 0xe0, 0xe2, 0xee, 0x20, 0xa8, 0xb8, 0xb9]);
    assert.equal(isValidUtf8(bytes), false);
    assert.deepEqual(decodeTextFile(bytes), { text: 'Дата;Право Ёё№', encoding: 'windows-1251' });
    assert.equal(decodeCp1251(Uint8Array.from([0xdf, 0xff])), 'Яя');
  });

  it('усечённая последовательность UTF-8 некорректна', () => {
    assert.equal(isValidUtf8(Uint8Array.from([0xd0])), false);
    assert.equal(isValidUtf8(Uint8Array.from([0xd0, 0x94])), true);
  });
});
