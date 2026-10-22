// The studio talks to its server through this file. Every write carries the X-Studio header the server insists on.

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'X-Studio': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `The studio could not do that (${res.status}).`); e.status = res.status; e.report = data.report; throw e; }
  return data;
}

export const api = {
  get: (path) => call('GET', path),
  post: (path, body = {}) => call('POST', path, body),
  put: (path, body) => call('PUT', path, body),
  del: (path) => call('DELETE', path),

  /** Upload one file as the raw request body, with progress. Resolves with the server's answer. */
  upload(gift, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/gifts/${gift}/media/${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('X-Studio', '1');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded, e.total); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else { const e = new Error(data.error || `Could not add ${file.name}.`); e.status = xhr.status; reject(e); }
      };
      xhr.onerror = () => reject(new Error(`Could not add ${file.name}. Is the studio still running?`));
      xhr.send(file);
    });
  },
};
