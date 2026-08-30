import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadOpenStatesApiKey } from '../src/config/openstates-key.js';

test('startup prefers the key-file assignment and falls back to the environment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'officials-config-'));
  const keyFile = join(directory, 'Open States API Key.txt');
  try {
    await writeFile(keyFile, 'open_states_api_key=file-secret\n', { mode: 0o600 });

    assert.equal(await loadOpenStatesApiKey({ environment: {}, keyFile }), 'file-secret');
    assert.equal(await loadOpenStatesApiKey({
      environment: { OPENSTATES_API_KEY: 'environment-secret' },
      keyFile,
    }), 'file-secret');

    await rm(keyFile);
    assert.equal(await loadOpenStatesApiKey({
      environment: { OPENSTATES_API_KEY: 'environment-secret' },
      keyFile,
    }), 'environment-secret');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
