const JSON_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
});

export class HttpError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = status;
  }
}

export function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { ...JSON_HEADERS, ...headers });
  response.end(JSON.stringify(body));
}

export function sendError(response, status, code, message, suggestions) {
  const error = { code, message };
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    error.suggestions = suggestions;
  }
  sendJson(response, status, { error });
}

export async function readJsonBody(request, limit = 32 * 1024) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    request.resume();
    throw new HttpError('PAYLOAD_TOO_LARGE', 'Request payload exceeds the 32 KiB limit.', 413);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw new HttpError('PAYLOAD_TOO_LARGE', 'Request payload exceeds the 32 KiB limit.', 413);
    }
    chunks.push(chunk);
  }

  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body === null || Array.isArray(body) || typeof body !== 'object') {
      throw new HttpError('INVALID_REQUEST_BODY', 'Request body must be a JSON object.', 400);
    }
    return body;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
}
