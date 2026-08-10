import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registryUrls, servesVersion } from './verify-published.ts';

describe('servesVersion', () => {
  it('accepts a version present in the registry body', () => {
    assert.equal(
      servesVersion({ versions: { '3.1.0': {}, '3.0.2': {} } }, '3.1.0'),
      true
    );
  });

  it('rejects a version the registry does not carry', () => {
    assert.equal(servesVersion({ versions: { '3.0.2': {} } }, '3.1.0'), false);
  });

  it('rejects a body with no versions map', () => {
    assert.equal(servesVersion({ error: 'not found' }, '3.1.0'), false);
  });

  it('rejects non-object bodies rather than throwing', () => {
    for (const body of [null, undefined, 'gone', 42, ['3.1.0']]) {
      assert.equal(servesVersion(body, '3.1.0'), false);
    }
  });

  it('does not treat inherited properties as published versions', () => {
    // A naive `in` check would call toString a published version.
    assert.equal(servesVersion({ versions: {} }, 'toString'), false);
  });

  it('matches the version exactly, not by prefix', () => {
    assert.equal(
      servesVersion({ versions: { '3.1.0-beta.2': {} } }, '3.1.0'),
      false
    );
  });
});

describe('registryUrls', () => {
  it('points at both registries for a scoped package', () => {
    assert.deepEqual(registryUrls('@icazemier/gibbons-mongodb'), [
      {
        label: 'npm',
        url: 'https://registry.npmjs.org/@icazemier/gibbons-mongodb',
      },
      {
        label: 'JSR',
        url: 'https://jsr.io/@icazemier/gibbons-mongodb/meta.json',
      },
    ]);
  });
});
