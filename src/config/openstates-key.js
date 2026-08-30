import { readFile } from 'node:fs/promises';

const DEFAULT_KEY_FILE = new URL('../../Open States API Key.txt', import.meta.url);

export async function loadOpenStatesApiKey({
  environment = process.env,
  keyFile = DEFAULT_KEY_FILE,
} = {}) {
  const environmentKey = environment.OPENSTATES_API_KEY?.trim();
  if (environmentKey) return environmentKey;

  let contents;
  try {
    contents = await readFile(keyFile, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }

  const assignment = /^\s*(?:OPENSTATES_API_KEY|open_states_api_key)\s*=\s*([^\r\n]+)\s*$/m.exec(contents);
  if (!assignment) return '';
  return assignment[1].trim().replace(/^(?:"([^"]*)"|'([^']*)')$/, '$1$2');
}
