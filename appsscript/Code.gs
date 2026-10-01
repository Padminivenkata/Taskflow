/**
 * Taskflow <-> Google Sheets bridge.
 *
 * The spreadsheet stays the single source of truth for the active sprint.
 * This script only exposes it over HTTP so the React app can read it; the app
 * never writes through this endpoint.
 *
 * Deployment: Deploy > New deployment > Web app
 *   Execute as:            Me
 *   Who has access:        Anyone
 * Then copy the /exec URL into the app's .env as VITE_SHEET_API_URL.
 *
 * IMPORTANT: this script must be container-bound to the spreadsheet (create it
 * via Extensions > Apps Script from inside the sheet). A standalone script
 * makes getActiveSpreadsheet() return null and every read returns ''.
 */

const SHEET_NAME = 'Dashboard';
const ACTIVE_CELL = 'D2';

/** @return {GoogleAppsScript.SpreadsheetApp.Sheet|null} */
function getDashboardSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log('No active spreadsheet. Is this script bound to the sheet?');
    return null;
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log(
      'Sheet "' + SHEET_NAME + '" not found. Found: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', ')
    );
  }
  return sheet;
}

/**
 * Name of the sprint currently running, exactly as displayed in the sheet.
 * @return {string} '' when unavailable.
 */
function getActiveSprint() {
  var sheet = getDashboardSheet();
  if (!sheet) return '';

  // getDisplayValue() so a formula in D2 resolves to its visible text.
  var value = String(sheet.getRange(ACTIVE_CELL).getDisplayValue()).trim();
  Logger.log('Active sprint (' + SHEET_NAME + '!' + ACTIVE_CELL + '): [' + value + ']');
  return value;
}

/**
 * Writes a new active sprint. Intended for manual use or an onEdit trigger;
 * the web app endpoint below deliberately does not call it.
 * @param {string} startedSprintName
 * @return {boolean} true when the cell was written.
 */
function setActiveSprint(startedSprintName) {
  var sprintName = startedSprintName == null ? '' : String(startedSprintName).trim();
  if (!sprintName) {
    Logger.log('No sprint supplied. Existing value left unchanged.');
    return false;
  }
  var sheet = getDashboardSheet();
  if (!sheet) return false;

  sheet.getRange(ACTIVE_CELL).setValue(sprintName);
  Logger.log('Active sprint saved: ' + sprintName);
  return true;
}

/**
 * Read-only HTTP endpoint for the React app.
 * Apps Script serves this at the deployment's /exec URL.
 */
function doGet(e) {
  var activeSprint = getActiveSprint();
  return ContentService.createTextOutput(
    JSON.stringify({
      ok: activeSprint !== '',
      activeSprint: activeSprint,
      servedAt: new Date().toISOString(),
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/** Manual diagnostic: run this and read the Executions log. */
function testActiveSprint() {
  Logger.log('ACTIVE SPRINT FROM ' + ACTIVE_CELL + ' = [' + getActiveSprint() + ']');
}
