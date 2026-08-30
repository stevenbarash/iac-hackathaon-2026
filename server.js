import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  DomainError,
} from './src/domain/officials.js';
import { HttpError, readJsonBody, sendError, sendJson } from './src/http/respond.js';
import { createOfficialResolver } from './src/services/official-resolver.js';
import { createAddressSuggestionService } from './src/services/address-suggestions.js';
import openApiDocument from './openapi.json' with { type: 'json' };

const METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED';
const STATIC_FILES = new Map([
  ['/', { file: new URL('./public/index.html', import.meta.url), contentType: 'text/html; charset=utf-8' }],
  ['/index.html', { file: new URL('./public/index.html', import.meta.url), contentType: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: new URL('./public/styles.css', import.meta.url), contentType: 'text/css; charset=utf-8' }],
  ['/app.js', { file: new URL('./public/app.js', import.meta.url), contentType: 'text/javascript; charset=utf-8' }],
]);

function sendMethodNotAllowed(response, allow) {
  sendJson(
    response,
    405,
    { error: { code: METHOD_NOT_ALLOWED, message: 'This method is not allowed for the requested resource.' } },
    { Allow: allow },
  );
}

function safelyDecodeOfficialId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new DomainError('INVALID_OFFICIAL_ID', 'Official identifier is not valid URL encoding.', 400);
  }
}

function handleError(response, error) {
  if (error instanceof DomainError) {
    sendError(response, error.status, error.code, error.message, error.suggestions);
    return;
  }

  if (error instanceof HttpError) {
    sendError(response, error.status, error.code, error.message);
    return;
  }

  sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
}

function openStatesContext(request) {
  return {
    openStatesApiKey: String(request.headers['x-openstates-api-key'] || '').trim(),
  };
}

async function route(request, response, { lookup, getOfficial, suggestAddresses }) {
  const rawPathname = request.url.split('?', 1)[0];
  if (/(?:^|\/)(?:(?:\.|%2e){1,2})(?:\/|$)/i.test(rawPathname)) {
    sendError(response, 404, 'ROUTE_NOT_FOUND', 'No route matches this request.');
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  const { pathname } = url;

  if (pathname === '/api/health') {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, 'GET');
      return;
    }
    sendJson(response, 200, { status: 'ok', apiVersion: 'v1' });
    return;
  }

  if (pathname === '/api/openapi.json') {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, 'GET');
      return;
    }
    sendJson(response, 200, openApiDocument);
    return;
  }

  if (pathname === '/api/v1/addresses/suggest') {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, 'GET');
      return;
    }
    sendJson(response, 200, await suggestAddresses(url.searchParams.get('q') || ''));
    return;
  }

  if (pathname === '/api/v1/officials/lookup') {
    if (request.method !== 'POST') {
      sendMethodNotAllowed(response, 'POST');
      return;
    }
    const body = await readJsonBody(request);
    sendJson(response, 200, await lookup(body, openStatesContext(request)));
    return;
  }

  const officialMatch = /^\/api\/v1\/officials\/([^/]+)$/.exec(pathname);
  if (officialMatch) {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, 'GET');
      return;
    }
    const officialId = safelyDecodeOfficialId(officialMatch[1]);
    sendJson(response, 200, await getOfficial(officialId, openStatesContext(request)));
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendError(response, 404, 'ROUTE_NOT_FOUND', 'No API route matches this request.');
    return;
  }

  const staticFile = STATIC_FILES.get(pathname);
  if (staticFile) {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, 'GET');
      return;
    }
    const body = await readFile(staticFile.file);
    response.writeHead(200, {
      'Content-Type': staticFile.contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
    return;
  }

  sendError(response, 404, 'ROUTE_NOT_FOUND', 'No route matches this request.');
}

export function createAppServer(options = {}) {
  const resolver = options.resolver || createOfficialResolver();
  const lookup = options.lookup || resolver.lookup;
  const getOfficial = options.getOfficial || resolver.getOfficial;
  const suggestAddresses = options.suggestAddresses || createAddressSuggestionService();
  return createServer((request, response) => {
    route(request, response, { lookup, getOfficial, suggestAddresses }).catch((error) => handleError(response, error));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createAppServer().listen(port, () => {
    console.log(`Know Your Officials API listening at http://localhost:${port}`);
  });
}
