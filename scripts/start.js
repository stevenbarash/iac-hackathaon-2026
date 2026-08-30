import { loadOpenStatesApiKey } from '../src/config/openstates-key.js';

const apiKey = await loadOpenStatesApiKey();
if (apiKey && !process.env.OPENSTATES_API_KEY) process.env.OPENSTATES_API_KEY = apiKey;

const { createAppServer } = await import('../server.js');
const port = Number(process.env.PORT) || 3000;
createAppServer().listen(port, () => {
  console.log(`Know Your Officials API listening at http://localhost:${port}`);
});
