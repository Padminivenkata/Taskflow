/*******************************************************
 * APPX TASK TRACKER — SPRINT MANAGEMENT (FIXED)
 *
 * FIX 1: Active Sprint cell was read one column too far right.
 *        On the Dashboard tab the value sits DIRECTLY BELOW the
 *        "Active Sprint" header (D1 header -> D2 value), but the old
 *        code read E2, which is empty. An empty result made the
 *        front-end fall back to its hardcoded default
 *        (Sprint 2 / 21-25 Sep) on every load.
 *
 * FIX 2: findSprint_ / getSprintOptions / getHolidays_ read the
 *        Dashboard tab, but the Sprint Calendar (A:D) and Holiday
 *        Calendar (F:H) live on the "Sprint Settings" tab.
 *
 * FIX 3: getSprintContext now throws a clear error instead of
 *        silently returning an empty object.
 *
 * FIX 4: Working-day loop had a timezone off-by-one that could
 *        drop the final day of the sprint.
 *******************************************************/

const APPX_CONFIG = {
  DASHBOARD_SHEET: 'Dashboard',
  SETTINGS_SHEET: 'Sprint Settings',
  TASKS_SHEET: 'Tasks',
  DAILY_HOURS: 6
};

/* Canonical states. The Sheet has been seen using both
   "TO DO" and "TODO" - normalise so comparisons never miss. */
const APPX_STATES = {
  TODO: 'TO DO',
  IN_PROGRESS: 'IN PROGRESS',
  DONE: 'DONE'
};

/**
 * Map any user-entered variant onto the canonical state.
 */
function normalizeState_(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (raw === 'TODO' || raw === 'TO DO' || raw === 'BACKLOG') return APPX_STATES.TODO;
  if (raw === 'IN PROGRESS' || raw === 'INPROGRESS' || raw === 'STARTED') return APPX_STATES.IN_PROGRESS;
  if (raw === 'DONE' || raw === 'COMPLETED' || raw === 'COMPLETE') return APPX_STATES.DONE;
  return raw;
}

/**
 * The Tasks tab.
 */
function getTasksSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(APPX_CONFIG.TASKS_SHEET);
  if (!sheet) {
    throw new Error('Sheet "' + APPX_CONFIG.TASKS_SHEET + '" was not found.');
  }
  return sheet;
}


/**
 * The Dashboard tab — holds the "Active Sprint" selector.
 */
function getAppxSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(APPX_CONFIG.DASHBOARD_SHEET);

  if (!sheet) {
    throw new Error(
      'Sheet "' + APPX_CONFIG.DASHBOARD_SHEET + '" was not found.'
    );
  }

  return sheet;
}


/**
 * The Sprint Settings tab — holds the Sprint Calendar (A:D)
 * and the Holiday Calendar (F:H).
 */
function getSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(APPX_CONFIG.SETTINGS_SHEET);

  if (!sheet) {
    throw new Error(
      'Sheet "' + APPX_CONFIG.SETTINGS_SHEET + '" was not found. ' +
      'The sprint and holiday calendars must live on this tab.'
    );
  }

  return sheet;
}


/**
 * Read the whole sheet as a 2D array, anchored at A1 so that
 * array indices always line up with real cell addresses.
 */
function readSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (!lastRow || !lastCol) {
    return [];
  }

  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}


/**
 * Find the header row of a sheet and return a
 * lowercase header -> column index map.
 */
function headerMap_(values) {
  if (!values.length) {
    return {};
  }

  const map = {};

  values[0].forEach(function (header, index) {
    const key = String(header || '').trim().toLowerCase();
    if (key && !(key in map)) {
      map[key] = index;
    }
  });

  return map;
}


/**
 * Find the cell that holds the currently selected sprint.
 *
 * Supports BOTH layouts, because the two tabs differ:
 *   - Dashboard      : "Active Sprint" in D1, value in D2 (BELOW)
 *   - Sprint Settings: "Active Sprint" in J1, value in K1 (RIGHT)
 *
 * The old code only handled "right of header" and then read one
 * column too far, which is why it always came back empty.
 */
function getActiveSprintCell_() {
  const sheet = getAppxSheet_();
  const values = sheet
    .getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
    .getDisplayValues();

  let headerRow = -1;
  let headerCol = -1;

  for (let r = 0; r < values.length && headerRow === -1; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (
        String(values[r][c] || '')
          .trim()
          .toLowerCase() === 'active sprint'
      ) {
        headerRow = r;
        headerCol = c;
        break;
      }
    }
  }

  if (headerRow === -1) {
    throw new Error(
      'Active Sprint header was not found on the "' +
      APPX_CONFIG.DASHBOARD_SHEET + '" tab.'
    );
  }

  // Layout A — value in the cell immediately to the right of the header.
  const rightCell = sheet.getRange(headerRow + 1, headerCol + 2);
  if (String(rightCell.getDisplayValue() || '').trim()) {
    return rightCell;
  }

  // Layout B — value directly below the header.
  const belowCell = sheet.getRange(headerRow + 2, headerCol + 1);
  if (String(belowCell.getDisplayValue() || '').trim()) {
    return belowCell;
  }

  // Nothing set yet — return the cell below so it can be written to.
  return belowCell;
}


/**
 * READ the currently selected Active Sprint.
 */
function getActiveSprint() {
  const cell = getActiveSprintCell_();
  return String(cell.getDisplayValue() || '').trim();
}


/**
 * SAVE the selected Active Sprint.
 */
function setActiveSprint(sprintName) {

  const name = String(sprintName || '').trim();

  if (!name) {
    throw new Error('Sprint name cannot be empty.');
  }

  const sprint = findSprint_(name);

  if (!sprint) {
    throw new Error(
      'Sprint "' + name + '" does not exist in the Sprint Calendar.'
    );
  }

  const problems = validateSprintCalendar_();
  const blocking = problems.filter(function (p) {
    return p.severity === 'ERROR';
  });

  if (blocking.length) {
    throw new Error(
      'Sprint Calendar has blocking problems:\n' +
      blocking.map(function (p) { return '- ' + p.message; }).join('\n') +
      '\n\nFix them on the "' + APPX_CONFIG.SETTINGS_SHEET + '" tab, then try again.'
    );
  }

  const cell = getActiveSprintCell_();

  cell.setValue(sprint.name);

  // Keep the Sprint Settings Status column in lockstep so it can
  // never drift out of sync with the Dashboard selector again.
  syncSprintStatus_(sprint.name);

  SpreadsheetApp.flush();

  return {
    success: true,
    activeSprint: sprint.name,
    startDate: formatDate_(sprint.startDate),
    endDate: formatDate_(sprint.endDate),
    warnings: problems.map(function (p) { return p.message; })
  };
}


/**
 * Force exactly one sprint to be "Active".
 * The chosen sprint becomes Active; any other sprint that was
 * Active is marked Completed.
 *
 * This is what stopped Sprint 2 still reading "Active".
 */
function syncSprintStatus_(activeName) {

  const sheet = getSettingsSheet_();
  const values = readSheet_(sheet);

  if (values.length < 2) {
    return;
  }

  const headers = headerMap_(values);
  const nameCol = headers['sprint name'];
  const statusCol = headers['status'];

  if (nameCol === undefined || statusCol === undefined) {
    return;
  }

  const target = String(activeName || '').trim().toLowerCase();

  for (let r = 1; r < values.length; r++) {

    const name = String(values[r][nameCol] || '').trim();

    if (!name) {
      continue;
    }

    const cell = sheet.getRange(r + 1, statusCol + 1);
    const current = String(cell.getDisplayValue() || '').trim();

    if (name.toLowerCase() === target) {
      if (current.toLowerCase() !== 'active') {
        cell.setValue('Active');
      }
    } else if (current.toLowerCase() === 'active') {
      cell.setValue('Completed');
    }
  }
}


/**
 * Audit the Sprint Calendar.
 *
 * Catches the class of data problems that make boards lie:
 *   - duplicate date ranges (e.g. Sprint 9 copying Sprint 5)
 *   - overlapping / out-of-order sprints
 *   - more than one sprint marked Active
 *   - start date after end date
 *
 * ERROR severity blocks setActiveSprint. WARNING does not.
 */
function validateSprintCalendar_() {

  const values = readSheet_(getSettingsSheet_());

  if (values.length < 2) {
    return [];
  }

  const headers = headerMap_(values);
  const nameCol = headers['sprint name'];
  const startCol = headers['start date'];
  const endCol = headers['end date'];
  const statusCol = headers['status'];

  if (nameCol === undefined || startCol === undefined || endCol === undefined) {
    return [{
      severity: 'ERROR',
      message: 'Sprint Name / Start Date / End Date columns are missing.'
    }];
  }

  const problems = [];
  const seen = [];
  const activeCount = { n: 0 };
  const activeNames = [];

  for (let r = 1; r < values.length; r++) {

    const name = String(values[r][nameCol] || '').trim();

    if (!name) {
      continue;
    }

    const start = normalizeDate_(values[r][startCol]);
    const end = normalizeDate_(values[r][endCol]);
    const status = statusCol !== undefined
      ? String(values[r][statusCol] || '').trim()
      : '';

    if (status.toLowerCase() === 'active') {
      activeCount.n++;
      activeNames.push(name);
    }

    if (!start || !end) {
      problems.push({
        severity: 'ERROR',
        message: name + ' has a missing or unreadable start/end date.'
      });
      continue;
    }

    if (start.getTime() > end.getTime()) {
      problems.push({
        severity: 'ERROR',
        message: name + ' starts (' + formatDate_(start) + ') after it ends (' + formatDate_(end) + ').'
      });
      continue;
    }

    // duplicate date range
    const key = formatDate_(start) + '|' + formatDate_(end);

    seen.forEach(function (other) {
      if (other.key === key) {
        problems.push({
          severity: 'ERROR',
          message: name + ' has the exact same dates as ' + other.name +
                   ' (' + key.split('|').join(' to ') + '). Give it unique dates.'
        });
      }
      if (
        start.getTime() <= other.end.getTime() &&
        other.start.getTime() <= end.getTime()
      ) {
        problems.push({
          severity: 'WARNING',
          message: name + ' (' + formatDate_(start) + ' to ' + formatDate_(end) +
                   ') overlaps ' + other.name + '.'
        });
      }
    });

    seen.push({ name: name, key: key, start: start, end: end });
  }

  if (activeCount.n > 1) {
    problems.push({
      severity: 'ERROR',
      message: 'More than one sprint is marked Active: ' + activeNames.join(', ') +
               '. Exactly one must be Active.'
    });
  }

  return problems;
}


/**
 * Run the audit on demand and log the result.
 */
function testSprintCalendar() {
  const problems = validateSprintCalendar_();

  if (!problems.length) {
    Logger.log('Sprint Calendar OK - no problems found.');
  } else {
    Logger.log(JSON.stringify(problems, null, 2));
  }

  return problems;
}


/**
 * Front-end friendly alias.
 */
function changeActiveSprint(sprintName) {
  return setActiveSprint(sprintName);
}


/**
 * Find a sprint by name from the Sprint Calendar on "Sprint Settings".
 *
 * FIX 2: this used to read the Dashboard tab, which has no
 * sprint columns at all.
 */
function findSprint_(sprintName) {

  const values = readSheet_(getSettingsSheet_());

  if (values.length < 2) {
    return null;
  }

  const headers = headerMap_(values);

  const sprintCol = headers['sprint name'];
  const startCol = headers['start date'];
  const endCol = headers['end date'];
  const statusCol = headers['status'];

  if (sprintCol === undefined) {
    throw new Error(
      '"Sprint Name" column not found on the "' +
      APPX_CONFIG.SETTINGS_SHEET + '" tab.'
    );
  }

  if (startCol === undefined || endCol === undefined) {
    throw new Error(
      '"Start Date" / "End Date" columns not found on the "' +
      APPX_CONFIG.SETTINGS_SHEET + '" tab.'
    );
  }

  const target = String(sprintName || '')
    .trim()
    .toLowerCase();

  for (let r = 1; r < values.length; r++) {

    const name = String(values[r][sprintCol] || '').trim();

    if (!name) {
      continue;
    }

    if (name.toLowerCase() === target) {
      return {
        name: name,
        startDate: normalizeDate_(values[r][startCol]),
        endDate: normalizeDate_(values[r][endCol]),
        status:
          statusCol !== undefined
            ? String(values[r][statusCol] || '').trim()
            : ''
      };
    }
  }

  return null;
}


/**
 * All available sprints, straight from the Sprint Calendar.
 */
function getSprintOptions() {

  const values = readSheet_(getSettingsSheet_());

  if (values.length < 2) {
    return [];
  }

  const headers = headerMap_(values);
  const sprintCol = headers['sprint name'];

  if (sprintCol === undefined) {
    throw new Error(
      '"Sprint Name" column not found on the "' +
      APPX_CONFIG.SETTINGS_SHEET + '" tab.'
    );
  }

  const result = [];
  const seen = {};

  for (let r = 1; r < values.length; r++) {

    const name = String(values[r][sprintCol] || '').trim();

    if (!name) {
      continue;
    }

    const key = name.toLowerCase();

    if (seen[key]) {
      continue;
    }

    seen[key] = true;

    const sprint = findSprint_(name);

    result.push({
      name: name,
      startDate: sprint ? formatDate_(sprint.startDate) : '',
      endDate: sprint ? formatDate_(sprint.endDate) : '',
      status: sprint ? sprint.status : ''
    });
  }

  return result;
}


/**
 * Holidays falling inside the given sprint, from the Holiday
 * Calendar (F:H) on the "Sprint Settings" tab.
 */
function getHolidays_(startDate, endDate) {

  if (!startDate || !endDate) {
    return [];
  }

  const values = readSheet_(getSettingsSheet_());

  if (values.length < 2) {
    return [];
  }

  const headers = headerMap_(values);

  const holidayNameCol = headers['holiday name'];
  const holidayDateCol = headers['date'];
  const categoryCol = headers['type / category'];

  if (holidayNameCol === undefined || holidayDateCol === undefined) {
    return [];
  }

  const start = stripTime_(startDate).getTime();
  const end = stripTime_(endDate).getTime();

  const holidays = [];

  for (let r = 1; r < values.length; r++) {

    const holidayDate = normalizeDate_(values[r][holidayDateCol]);

    if (!holidayDate) {
      continue;
    }

    const day = stripTime_(holidayDate).getTime();

    if (day >= start && day <= end) {
      holidays.push({
        name: String(values[r][holidayNameCol] || '').trim(),
        date: formatDate_(holidayDate),
        category:
          categoryCol !== undefined
            ? String(values[r][categoryCol] || '').trim()
            : ''
      });
    }
  }

  return holidays;
}


/**
 * Full context for the currently selected sprint.
 *
 * FIX 3: previously returned a silent all-empty object, which is
 * exactly what let the front-end fall back to Sprint 2 / 21-25 Sep.
 * It now fails loudly so the real problem is visible.
 */
function getSprintContext() {

  const activeSprint = getActiveSprint();

  if (!activeSprint) {
    throw new Error(
      'The Active Sprint cell on the "' +
      APPX_CONFIG.DASHBOARD_SHEET +
      '" tab is empty. Pick a sprint before loading the board.'
    );
  }

  const sprint = findSprint_(activeSprint);

  if (!sprint) {
    throw new Error(
      'The saved Active Sprint "' +
      activeSprint +
      '" no longer exists in the Sprint Calendar on "' +
      APPX_CONFIG.SETTINGS_SHEET +
      '".'
    );
  }

  const holidays = getHolidays_(sprint.startDate, sprint.endDate);

  const holidayKeys = {};

  holidays.forEach(function (holiday) {
    holidayKeys[holiday.date] = true;
  });

  const endKey = formatDate_(sprint.endDate);
  const cursor = stripTime_(sprint.startDate);

  let workingDays = 0;
  let totalDays = 0;

  // yyyy-MM-dd sorts correctly as a string, so this avoids the
  // UTC-vs-local off-by-one the old Date comparison could hit.
  while (formatDate_(cursor) <= endKey) {
    const key = formatDate_(cursor);
    const dayOfWeek = cursor.getDay();
    const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

    totalDays++;

    if (isWeekday && !holidayKeys[key]) {
      workingDays++;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    activeSprint: sprint.name,
    startDate: formatDate_(sprint.startDate),
    endDate: formatDate_(sprint.endDate),
    status: sprint.status,
    totalCalendarDays: totalDays,
    workingDays: workingDays,
    holidayCount: holidays.length,
    holidays: holidays,
    hoursPerDay: APPX_CONFIG.DAILY_HOURS,
    capacityPerResource: workingDays * APPX_CONFIG.DAILY_HOURS
  };
}


/**
 * Utility: Sheet value -> local-midnight Date.
 */
function normalizeDate_(value) {

  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) {
      return null;
    }
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const parsed = new Date(value);

  if (isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}


/**
 * Utility: strip the time component.
 */
function stripTime_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}


/**
 * Utility: format as yyyy-MM-dd.
 */
function formatDate_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


/**
 * Diagnostic: where is the Active Sprint cell, and what does it hold?
 */
function debugActiveSprint() {

  const cell = getActiveSprintCell_();

  return {
    cellAddress: cell.getA1Notation(),
    cellValue: String(cell.getDisplayValue() || '').trim(),
    activeSprint: getActiveSprint()
  };
}


/**
 * Test the current Active Sprint.
 */
function testActiveSprint() {
  const sprint = getActiveSprint();
  Logger.log('CURRENT ACTIVE SPRINT = ' + sprint);
  return sprint;
}


/**
 * Test the complete sprint context.
 */
function testSprintContext() {
  const context = getSprintContext();
  Logger.log(JSON.stringify(context, null, 2));
  return context;
}


/*******************************************************
 * TASK BOARD FUNCTIONS
 * These two were being called by index.html but did not
 * exist, so the board could never load or move a task.
 *******************************************************/

/**
 * Read every task from the Tasks tab.
 *
 * Tasks tab columns:
 *   A Task_ID   B Title    C Assignee   D Est_Hours   E State
 *   F Sprint    G Lifetime_Hours          H Current_Sprint_Hours
 *   I Carryover_Hours                     J Department
 *   K ToDo_Timestamp  L InProgress_Timestamp  M Done_Timestamp
 *
 * State is returned as "TODO" | "IN PROGRESS" | "DONE" because
 * that is what index.html compares against.
 */
function getSheetTasks() {

  const sheet = getTasksSheet_();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (!lastRow || !lastCol) {
    return [];
  }

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = headerMap_(values);

  const col = {
    taskId: headers['task_id'],
    title: headers['title'],
    assignee: headers['assignee'],
    estHours: headers['est_hours'],
    state: headers['state'],
    sprint: headers['sprint'],
    department: headers['department']
  };

  if (col.state === undefined) {
    throw new Error('"State" column not found on the "' + APPX_CONFIG.TASKS_SHEET + '" tab.');
  }

  const result = [];

  for (let r = 1; r < values.length; r++) {

    const row = values[r];
    const id = col.taskId !== undefined ? String(row[col.taskId] || '').trim() : '';

    if (!id) {
      continue;
    }

    const canonical = normalizeState_(row[col.state]);

    // Front-end expects "TODO", not "TO DO".
    const uiState =
      canonical === APPX_STATES.TODO ? 'TODO' : canonical;

    result.push({
      rowIndex: r + 1,
      taskId: id,
      title: col.title !== undefined ? String(row[col.title] || '').trim() : '',
      assignee: col.assignee !== undefined ? String(row[col.assignee] || '').trim() : '',
      estHours: col.estHours !== undefined ? row[col.estHours] : '',
      state: uiState,
      sprint: col.sprint !== undefined ? String(row[col.sprint] || '').trim() : '',
      department: col.department !== undefined ? String(row[col.department] || '').trim() : ''
    });
  }

  return result;
}

/**
 * Move a task to a new state and stamp the matching timestamp.
 *
 * @param {number} rowIndex 1-based row on the Tasks tab
 * @param {string} newState TODO | IN PROGRESS | DONE
 */
function updateTaskStateInSheet(rowIndex, newState) {

  const sheet = getTasksSheet_();
  const row = Number(rowIndex);

  if (!row || row < 2) {
    throw new Error('Invalid row index: ' + rowIndex);
  }

  const state = normalizeState_(newState);

  if ([APPX_STATES.TODO, APPX_STATES.IN_PROGRESS, APPX_STATES.DONE].indexOf(state) === -1) {
    throw new Error(
      'Invalid state "' + newState + '". Use TODO, IN PROGRESS or DONE.'
    );
  }

  const lastCol = sheet.getLastColumn();
  const headers = headerMap_(sheet.getRange(1, 1, 1, lastCol).getValues()[0]);

  const stateCol = headers['state'];

  if (stateCol === undefined) {
    throw new Error('"State" column not found on the "' + APPX_CONFIG.TASKS_SHEET + '" tab.');
  }

  const stampCol = {};
  if (headers['todotsimestamp'] !== undefined) stampCol.TODO = headers['todotsimestamp'];
  if (headers['inprogresstimestamp'] !== undefined) stampCol.PR = headers['inprogresstimestamp'];
  if (headers['donetimestamp'] !== undefined) stampCol.DONE = headers['donetimestamp'];

  // 1) write the state
  sheet.getRange(row, stateCol + 1).setValue(state);

  // 2) stamp the transition, but never overwrite an earlier stamp
  const stampKey =
    state === APPX_STATES.TODO ? 'TODO' :
    state === APPX_STATES.IN_PROGRESS ? 'PR' : 'DONE';

  if (stampCol[stampKey] !== undefined) {
    const cell = sheet.getRange(row, stampCol[stampKey] + 1);
    if (!String(cell.getValue() || '').trim()) {
      cell.setValue(new Date());
    }
  }

  SpreadsheetApp.flush();

  return {
    success: true,
    taskId: String(sheet.getRange(row, (headers['task_id'] || 0) + 1).getValue() || '').trim(),
    rowIndex: row,
    state: state
  };
}


/**
 * Optional: read-only web-app entry point for debugging.
 * Deploy as Web app > Execute as "Me", Access "Anyone".
 */
function doGet() {
  try {
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        context: getSprintContext()
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: false,
        error: String(err)
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
