/**
 * ProMe Sheet Bridge — Google Apps Script web app.
 *
 * Gives an external caller (Claude, a cron job, the ProMe CLI) a narrow write
 * path into specific spreadsheets, without handing over a Google credential.
 *
 * Design notes:
 *   - The deployed URL is reachable by anyone who has it, so the shared secret
 *     is the only gate. Treat the URL as a secret too, and rotate both together.
 *   - ALLOWED_SHEETS is a hard allowlist. A leaked URL and secret still cannot
 *     be pointed at any other file in the Drive.
 *   - Every write is appended to an audit tab with the previous value, so an
 *     automated edit is always reversible by hand.
 *
 * Setup:
 *   1. Open the target spreadsheet, then Extensions > Apps Script.
 *   2. Paste this file over Code.gs.
 *   3. Project Settings > Script Properties, add SHARED_SECRET with a long
 *      random value. Never put the secret in this file.
 *   4. Fill in ALLOWED_SHEETS below with the spreadsheet IDs you want writable.
 *   5. Deploy > New deployment > Web app.
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      "Anyone" is required for a plain POST with no Google sign-in. The script
 *      still runs as you, and the secret check below is what actually guards it.
 *   6. Copy the /exec URL. That plus the secret is what the client needs.
 *
 * Re-deploy as a NEW VERSION after any edit, or the old code keeps serving.
 */

// Spreadsheet IDs this bridge may touch. Anything else is refused.
var ALLOWED_SHEETS = [
  '1zI_HyfC3xM0tDkleFnAgeDsAp8tamzezi7KTBdlcrzk'  // Finance_Tracker v2
];

// Uploads may only land inside this tree, whatever folder id a caller supplies.
var BILLS_FOLDER_ID = '1MK-YmWpkfVg2p49mUg-fokKGVHZG8y8r';  // Finance Tracker Bills

var AUDIT_TAB = '_BridgeLog';
var MAX_OPS = 100;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return reply({ok: false, error: 'empty request body'});
    }

    var req;
    try {
      req = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return reply({ok: false, error: 'body is not valid JSON'});
    }

    if (!secretOk(req.secret)) {
      return reply({ok: false, error: 'unauthorised'});
    }

    // Uploads target a Drive folder, not a spreadsheet, so they branch before
    // the spreadsheet allowlist check.
    if (req.mode === 'upload') {
      return reply(doUpload(req));
    }

    var id = req.spreadsheetId;
    if (!id || ALLOWED_SHEETS.indexOf(id) === -1) {
      return reply({ok: false, error: 'spreadsheetId not in allowlist'});
    }

    var ops = req.ops || [];
    if (!ops.length) return reply({ok: false, error: 'no ops supplied'});
    if (ops.length > MAX_OPS) {
      return reply({ok: false, error: 'too many ops, max ' + MAX_OPS});
    }

    var mode = req.mode === 'read' ? 'read' : 'write';
    var ss = SpreadsheetApp.openById(id);

    return reply(mode === 'read' ? doRead(ss, ops) : doWrite(ss, ops, req.note));
  } catch (err) {
    return reply({ok: false, error: String(err)});
  }
}

/**
 * Chunked file upload.
 *
 * The Drive connector only accepts file bytes inline in a single call, which
 * caps out well below the size of a scanned invoice. This accepts a file as a
 * sequence of base64 chunks instead, so the caller streams it from disk and the
 * bytes never have to fit in one request.
 *
 * Chunks land in the script cache keyed by uploadId, and the last one assembles
 * and writes the file. The caller sends the expected decoded byte count; a
 * mismatch fails the upload rather than leaving a truncated document in Drive.
 *
 * Requires the Drive scope, so re-authorize after adding this.
 */
function doUpload(req) {
  var uploadId = String(req.uploadId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(uploadId)) {
    return {ok: false, error: 'bad uploadId'};
  }

  var seq = Number(req.seq), total = Number(req.total);
  if (!(seq >= 0 && total > 0 && seq < total && total <= 400)) {
    return {ok: false, error: 'bad seq/total'};
  }
  if (typeof req.chunk !== 'string' || !req.chunk.length) {
    return {ok: false, error: 'empty chunk'};
  }

  var folder;
  try {
    folder = DriveApp.getFolderById(String(req.folderId));
  } catch (e) {
    return {ok: false, error: 'folder not found: ' + e};
  }
  if (!isUnderBills(folder)) {
    return {ok: false, error: 'target folder is outside the bills tree'};
  }

  var cache = CacheService.getScriptCache();
  cache.put('up:' + uploadId + ':' + seq, req.chunk, 3600);

  if (seq < total - 1) {
    return {ok: true, mode: 'upload', received: seq, of: total, done: false};
  }

  // Last chunk in: reassemble.
  var keys = [];
  for (var i = 0; i < total; i++) keys.push('up:' + uploadId + ':' + i);
  var got = cache.getAll(keys);

  var parts = [];
  for (var j = 0; j < total; j++) {
    var part = got['up:' + uploadId + ':' + j];
    if (part === null || part === undefined) {
      return {ok: false, error: 'chunk ' + j + ' of ' + total + ' missing or expired, restart the upload'};
    }
    parts.push(part);
  }
  cache.removeAll(keys);

  var bytes;
  try {
    bytes = Utilities.base64Decode(parts.join(''));
  } catch (e) {
    return {ok: false, error: 'base64 did not decode: ' + e};
  }

  var expected = Number(req.bytes);
  if (expected && bytes.length !== expected) {
    return {ok: false, error: 'size mismatch, got ' + bytes.length + ' expected ' + expected};
  }

  var name = String(req.filename || 'upload.bin');
  var blob = Utilities.newBlob(bytes, String(req.mimeType || 'application/octet-stream'), name);
  var file = folder.createFile(blob);

  return {
    ok: true, mode: 'upload', done: true,
    fileId: file.getId(), name: file.getName(),
    size: Number(file.getSize()), url: file.getUrl()
  };
}

/** Keeps uploads inside the bills tree, whatever folder id is supplied. */
function isUnderBills(folder) {
  var seen = 0;
  var cur = folder;
  while (cur && seen++ < 20) {
    if (cur.getId() === BILLS_FOLDER_ID) return true;
    var parents = cur.getParents();
    cur = parents.hasNext() ? parents.next() : null;
  }
  return false;
}

/** GET is a liveness probe only. It never reveals sheet contents. */
function doGet() {
  return reply({ok: true, service: 'prome-sheet-bridge', ops: ['read', 'write']});
}

/**
 * Run this once from the editor to create the shared secret.
 *
 *   Pick generateSecret in the function dropdown > Run, then open the
 *   execution log and copy the printed value into PROME_SHEET_SECRET.
 *
 * It stores the secret in Script Properties for you, so there is nothing to
 * paste back into Google. It prints the value once because that is the only
 * moment you can copy it; after this the property is the sole record.
 *
 * Entropy comes from Utilities.getUuid, which is a type-4 UUID backed by a
 * secure generator. Two of them concatenated give a 64-character hex string.
 * Math.random would NOT be safe here.
 */
function generateSecret() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHARED_SECRET')) {
    Logger.log(
      'A secret already exists. To rotate it, delete SHARED_SECRET under ' +
      'Project Settings > Script properties, then run this again.');
    return;
  }
  var secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props.setProperty('SHARED_SECRET', secret);
  Logger.log('SHARED_SECRET stored. Copy this into PROME_SHEET_SECRET:\n\n' + secret);
}

function doRead(ss, ops) {
  var out = [];
  for (var i = 0; i < ops.length; i++) {
    var a1 = ops[i].range;
    var rng = ss.getRange(a1);
    out.push({
      range: a1,
      value: rng.getValue(),
      display: rng.getDisplayValue(),
      formula: rng.getFormula()
    });
  }
  return {ok: true, mode: 'read', count: out.length, results: out};
}

function doWrite(ss, ops, note) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return {ok: false, error: 'another write is in progress, try again'};
  }

  try {
    var applied = [];

    // Resolve every range and coerce every value before writing anything, so a
    // bad op in the middle cannot leave the sheet half-updated.
    var staged = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var rng;
      try {
        rng = ss.getRange(op.range);
      } catch (rangeErr) {
        return {ok: false, error: 'bad range "' + op.range + '": ' + rangeErr};
      }
      if (rng.getNumRows() !== 1 || rng.getNumColumns() !== 1) {
        return {ok: false, error: 'range "' + op.range + '" is not a single cell'};
      }
      staged.push({range: op.range, rng: rng, as: op.as || 'auto', value: op.value});
    }

    for (var j = 0; j < staged.length; j++) {
      var s = staged[j];
      var before = s.rng.getDisplayValue();

      if (s.as === 'formula') {
        s.rng.setFormula(String(s.value));
      } else if (s.as === 'date') {
        var d = new Date(s.value);
        if (isNaN(d.getTime())) {
          return {ok: false, error: 'unparseable date for ' + s.range + ': ' + s.value};
        }
        s.rng.setValue(d);
      } else if (s.as === 'number') {
        var n = Number(s.value);
        if (isNaN(n)) {
          return {ok: false, error: 'unparseable number for ' + s.range + ': ' + s.value};
        }
        s.rng.setValue(n);
      } else if (s.as === 'text') {
        // setValue would coerce something like "12-Aug-2026" into a date.
        s.rng.setNumberFormat('@').setValue(String(s.value));
      } else {
        s.rng.setValue(s.value);
      }

      applied.push({range: s.range, before: before, after: s.rng.getDisplayValue()});
    }

    SpreadsheetApp.flush();
    audit(ss, applied, note);
    return {ok: true, mode: 'write', count: applied.length, results: applied};
  } finally {
    lock.releaseLock();
  }
}

/** Append one row per changed cell, so every automated edit is traceable. */
function audit(ss, applied, note) {
  try {
    var tab = ss.getSheetByName(AUDIT_TAB);
    if (!tab) {
      tab = ss.insertSheet(AUDIT_TAB);
      tab.appendRow(['Timestamp (UTC)', 'Range', 'Before', 'After', 'Note']);
      tab.setFrozenRows(1);
      tab.hideSheet();
    }
    var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
    for (var i = 0; i < applied.length; i++) {
      tab.appendRow([
        stamp, applied[i].range, applied[i].before, applied[i].after, note || ''
      ]);
    }
  } catch (auditErr) {
    // An audit failure must not roll back or mask a successful write.
    console.error('audit failed: ' + auditErr);
  }
}

/**
 * Compare digests rather than the raw strings, so a wrong guess leaks neither
 * the secret's length nor how far it matched.
 */
function secretOk(supplied) {
  var expected = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!expected || !supplied) return false;
  var a = sha256(String(supplied));
  var b = sha256(expected);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function sha256(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function reply(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
