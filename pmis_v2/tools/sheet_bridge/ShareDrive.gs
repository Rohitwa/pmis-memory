/**
 * ProMe Sheet Bridge — optional Drive sharing helper.
 *
 * Run once from the Apps Script editor to put the finance attachments behind a
 * public link, or to take them back private. Nothing here is reachable over the
 * web app; these are editor-run functions only, so the deployed bridge keeps
 * doing exactly what it did before.
 *
 * BEFORE YOU RUN THIS, know what goes public. The bills folder contains the
 * company bank account number and IFSC, the SWIFT code, the GSTIN and PAN,
 * client purchase orders naming their staff, and flight PNRs. ANYONE_WITH_LINK
 * means no Google sign-in is required, and links get forwarded.
 *
 * Adding this file makes the whole script project request Drive access, so the
 * first run prompts for a broader authorization than the sheet-only bridge
 * needed. Delete this file and the extra scope goes away on the next auth.
 *
 * Usage:
 *   1. Apps Script editor > + next to Files > Script, name it ShareDrive.
 *   2. Paste this over the new file's contents.
 *   3. Pick shareBillsPublicly in the function dropdown > Run, then approve.
 *   4. Read the execution log; it lists everything that just went public.
 *
 * To reverse it, run makeBillsPrivateAgain. That is a real revoke: existing
 * links stop working for everyone outside your account.
 */

// BILLS_FOLDER_ID is declared in Code.gs; Apps Script shares globals project-wide.
var TRACKER_SHEET_ID = '1zI_HyfC3xM0tDkleFnAgeDsAp8tamzezi7KTBdlcrzk';  // Finance_Tracker v2

/**
 * Anyone holding a link can VIEW. Not listed in Google Search, and not
 * editable — which is the whole point. A ledger or an invoice that any
 * passer-by can rewrite is worth nothing as evidence.
 *
 * Run this to fix a folder that was shared as Editor by mistake; it downgrades
 * the existing anyone-with-link grant to view-only rather than adding a second
 * one.
 */
function shareBillsPublicly() {
  applySharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW, 'PUBLIC (anyone with link, VIEW ONLY)');
}

/** Back to owner-only. Every previously shared link stops resolving. */
function makeBillsPrivateAgain() {
  applySharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE, 'PRIVATE (owner only)');
}

/**
 * The tracker spreadsheet is not inside the bills folder, so folder-level
 * sharing never touches it. Keep it separate from the attachments: the bills
 * are evidence others may need to read, the sheet is the working ledger.
 */
function makeTrackerPrivateAgain() {
  var f = DriveApp.getFileById(TRACKER_SHEET_ID);
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  Logger.log('Finance_Tracker v2 is now PRIVATE (owner only): %s', f.getUrl());
}

/** Read-only link for the tracker, if you do want to circulate it. */
function shareTrackerReadOnly() {
  var f = DriveApp.getFileById(TRACKER_SHEET_ID);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Finance_Tracker v2 is now VIEW ONLY for anyone with the link: %s', f.getUrl());
}

/**
 * Walks the tree and sets access on the folder and on every item inside it.
 * Children normally inherit a parent's link sharing, but setting each one
 * explicitly means a file reached by its own direct URL behaves the same way
 * whatever else it is filed under. That matters here: the sheet's Proof column
 * links straight to individual files, not to the folder.
 */
function applySharing(access, permission, label) {
  var root = DriveApp.getFolderById(BILLS_FOLDER_ID);
  var folders = 0, files = 0, failed = [];
  var lines = [];

  function visit(folder, depth) {
    try {
      folder.setSharing(access, permission);
      folders++;
    } catch (e) {
      failed.push(folder.getName() + ' (folder): ' + e);
    }
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      try {
        f.setSharing(access, permission);
        files++;
        lines.push(Array(depth + 1).join('  ') + '· ' + f.getName());
      } catch (e) {
        failed.push(f.getName() + ': ' + e);
      }
    }
    var subs = folder.getFolders();
    while (subs.hasNext()) {
      var sub = subs.next();
      lines.push(Array(depth + 1).join('  ') + '[' + sub.getName() + ']');
      visit(sub, depth + 1);
    }
  }

  lines.push('[' + root.getName() + ']');
  visit(root, 1);

  Logger.log('Access is now: ' + label);
  Logger.log('%s folders and %s files updated.', folders, files);
  Logger.log('Folder link: %s', root.getUrl());
  Logger.log('\nWhat this covers:\n' + lines.join('\n'));
  if (failed.length) {
    Logger.log('\nFAILED on %s item(s):\n%s', failed.length, failed.join('\n'));
  }
}
