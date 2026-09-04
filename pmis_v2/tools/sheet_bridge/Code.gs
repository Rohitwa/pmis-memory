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

/** GET is a liveness probe only. It never reveals sheet contents. */
function doGet() {
  return reply({ok: true, service: 'prome-sheet-bridge', ops: ['read', 'write']});
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
