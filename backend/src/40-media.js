// Customer files (photos, a video, a song) go to a Google Drive folder. The browser cannot upload to Drive directly through a web app,
// so it sends the file in chunks of about 1.5 MB; this code hands each chunk to a Drive "resumable upload" session, so memory use stays
// small however big the file is. When the last chunk lands the file is shared "anyone with the link" (the link is unguessable) so the
// recipient's browser can show it.

function authDraft_(draftId, tokenValue) {
  const draft = find_('Drafts', 'id', String(draftId || ''));
  if (!draft || !tokenValue || draft.token !== tokenValue) throw new UserError('This session has expired. Please start again.');
  return draft;
}

/** Step 1 of an upload: check the file, open a Drive session for it, and say how big each chunk must be. */
function uploadStart_(p) {
  const draft = authDraft_(p.draftId, p.token);
  const limit = UPLOAD_LIMITS[p.type];
  const bytes = Number(p.bytes);
  const mime = String(p.mime || '');
  if (!limit) throw new UserError('That kind of file is not supported.');
  if (!limit.mime.test(mime)) throw new UserError(`That ${p.type} is in a format we cannot use (${mime || 'unknown'}).`);
  if (!Number.isInteger(bytes) || bytes <= 0) throw new UserError('That file looks empty.');
  if (bytes > limit.maxBytes) throw new UserError(`That ${p.type} is too big. Please keep it under ${Math.round(limit.maxBytes / 1048576)} MB.`);
  if (rows_('Media').filter((m) => m.draftId === draft.id).length >= MAX_FILES_PER_DRAFT) throw new UserError('That is a lot of files already. Please remove some first.');

  const name = `${draft.id}_${token_(6)}`;
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}`, 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(bytes) },
    payload: JSON.stringify({ name, parents: [requireProp_('FOLDER_ID')] }),
  });
  const headers = res.getHeaders();
  const session = headers.Location || headers.location;
  if (res.getResponseCode() !== 200 || !session) {
    log_('', 'upload-init-failed', `${res.getResponseCode()} ${res.getContentText().slice(0, 200)}`);
    throw new Error('Drive refused to open an upload.');
  }
  const uploadId = `u_${token_(12)}`;
  CacheService.getScriptCache().put(uploadId, JSON.stringify({ session, bytes, mime, type: p.type, draftId: draft.id, received: 0 }), 6 * 60 * 60);
  return { uploadId, chunkBytes: CHUNK_BYTES };
}

/** Step 2, repeated: one chunk, base64, at the byte offset where the last one ended. The last chunk finishes the file. */
function uploadChunk_(p) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(String(p.uploadId || ''));
  if (!raw) throw new UserError('That upload expired. Please add the file again.');
  const up = JSON.parse(raw);
  authDraft_(up.draftId, p.token);
  if (Number(p.offset) !== up.received) throw new UserError('That upload got out of step. Please add the file again.');

  const bytes = Utilities.base64Decode(String(p.data || ''));
  const end = up.received + bytes.length;
  if (bytes.length === 0 || bytes.length > CHUNK_BYTES || end > up.bytes) throw new UserError('That upload does not match the file. Please add it again.');
  if (end < up.bytes && bytes.length % (256 * 1024) !== 0) throw new UserError('That upload chunk is the wrong size. Please add the file again.');

  const res = UrlFetchApp.fetch(up.session, {
    method: 'put', contentType: up.mime, muteHttpExceptions: true, payload: bytes,
    headers: { 'Content-Range': `bytes ${up.received}-${end - 1}/${up.bytes}` },
  });
  const code = res.getResponseCode();
  if (code === 308) {
    up.received = end;
    cache.put(p.uploadId, JSON.stringify(up), 6 * 60 * 60);
    return { received: end };
  }
  if (code !== 200 && code !== 201) {
    log_('', 'upload-chunk-failed', `${code} ${res.getContentText().slice(0, 200)}`);
    throw new UserError('The upload did not go through. Please try again.');
  }
  const fileId = JSON.parse(res.getContentText()).id;
  DriveApp.getFileById(fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const media = add_('Media', { id: `m_${token_(10)}`, draftId: up.draftId, type: up.type, driveId: fileId, bytes: up.bytes, mime: up.mime, createdAt: now_() });
  cache.remove(p.uploadId);
  return { done: true, id: media.id };
}

/** The address a browser can load a file from. One place, so moving files to another store later changes one function. */
function mediaUrl_(media) {
  return media.type === 'image'
    ? `https://drive.google.com/thumbnail?id=${media.driveId}&sz=w1600`
    : `https://drive.google.com/uc?export=download&id=${media.driveId}`;
}
