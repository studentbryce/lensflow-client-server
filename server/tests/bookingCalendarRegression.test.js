/** Milestone 9F: booking/calendar cross-flow regression guardrails.
 * No live Supabase credentials required. These are code-contract and pure-logic tests,
 * not substitutes for browser or live RLS/constraint verification.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { slotIsAvailable } from '../src/services/bookingCreateService.js';
import { STATUS_TRANSITIONS } from '../src/services/bookingStatusService.js';
import { validateCalendarRange, validateRule, validateException } from '../src/services/calendarService.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');
const pageBindings = [
  ['src/pages/photographer/Bookings.jsx', 'bookingApi'],
  ['src/pages/photographer/BookingDetails.jsx', 'bookingApi'],
  ['src/pages/photographer/NewBooking.jsx', 'bookingApi'],
  ['src/pages/photographer/Calendar.jsx', 'calendarApi'],
  ['src/pages/client/Bookings.jsx', 'clientBookingApi'],
  ['src/pages/client/BookingsDetails.jsx', 'clientBookingApi'],
  ['src/pages/client/NewBooking.jsx', 'clientBookingApi'],
];

test('all seven booking/calendar React pages use the Express API service layer', () => {
  for (const [file, api] of pageBindings) {
    const content = source(file);
    assert.match(content, new RegExp(`services/${api}`), `${file} should import ${api}`);
    assert.doesNotMatch(content, /\bsupabase\s*\.\s*(?:from|rpc)\s*\(/, `${file} must not query Supabase directly`);
    assert.doesNotMatch(content, /\.from\s*\(\s*['"](?:bookings|availability_rules|availability_exceptions)['"]/, `${file} must not directly query booking tables`);
  }
});

test('all three booking/calendar API service files call the shared authenticated API client', () => {
  for (const file of ['bookingApi', 'clientBookingApi', 'calendarApi']) {
    const content = source(`src/services/${file}.js`);
    assert.match(content, /apiFetch/);
    assert.doesNotMatch(content, /\bsupabase\s*\.\s*(?:from|rpc)\s*\(/);
  }
});

test('shared React API client sends Supabase access token as Bearer header', () => {
  const content = source('src/services/apiClient.js');
  assert.match(content, /auth\.getSession\s*\(/);
  assert.match(content, /headers\.set\(['"]Authorization['"],\s*`Bearer/);
  assert.match(content, /response\.ok/);
});

test('Express registers all three booking/calendar route families', () => {
  const content = source('server/src/app.js');
  for (const route of ['/api/bookings', '/api/client/bookings', '/api/calendar']) {
    assert.ok(content.includes(`'${route}'`), `Missing ${route}`);
  }
});

test('all booking and calendar endpoint handlers require JWT middleware', () => {
  for (const file of ['bookingRoutes', 'clientBookingRoutes', 'calendarRoutes']) {
    const content = source(`server/src/routes/${file}.js`);
    assert.match(content, /requireAuth/);
    if (file === 'bookingRoutes') {
      const lines = content.split('\n').filter(line => /router\.(?:get|post|patch|delete)\(/.test(line));
      assert.ok(lines.length >= 8);
      for (const line of lines) assert.match(line, /requireAuth/, `Unprotected route: ${line}`);
    } else {
      assert.match(content, /router\.use\(requireAuth\)/);
    }
  }
});

test('server database client uses caller token, not a service-role key', () => {
  const content = source('server/src/config/supabaseUser.js');
  assert.match(content, /accessToken:\s*async\s*\(\)\s*=>\s*accessToken/);
  assert.match(content, /SUPABASE_ANON_KEY/);
  assert.doesNotMatch(content, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test('overlapping confirmed and pending booking intervals block new booking slots', () => {
  const rules = [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true }];
  const base = { date: '2026-10-12', rules, exceptions: [] };
  assert.equal(slotIsAvailable({ ...base, start: 600, end: 660, bookings: [] }), true);
  assert.equal(slotIsAvailable({ ...base, start: 600, end: 660, bookings: [{ start_time: '10:30:00', end_time: '11:30:00', status: 'confirmed' }] }), false);
  assert.equal(slotIsAvailable({ ...base, start: 600, end: 660, bookings: [{ start_time: '10:30:00', end_time: '11:30:00', status: 'pending' }] }), false);
});

test('cancelled and declined booking intervals do not block a slot', () => {
  const rules = [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true }];
  for (const status of ['cancelled', 'declined']) {
    assert.equal(slotIsAvailable({ date: '2026-10-12', start: 600, end: 660, rules, exceptions: [], bookings: [{ start_time: '10:00', end_time: '11:00', status }] }), true);
  }
});

test('adjacent non-overlapping bookings are permitted', () => {
  const rules = [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true }];
  const bookings = [{ start_time: '10:00', end_time: '11:00', status: 'confirmed' }];
  assert.equal(slotIsAvailable({ date: '2026-10-12', start: 660, end: 720, rules, exceptions: [], bookings }), true);
  assert.equal(slotIsAvailable({ date: '2026-10-12', start: 540, end: 600, rules, exceptions: [], bookings }), true);
});

test('full-day unavailable exception blocks all slots', () => {
  const rules = [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true }];
  assert.equal(slotIsAvailable({ date: '2026-10-12', start: 600, end: 660, rules, bookings: [], exceptions: [{ is_available: false, start_time: null, end_time: null }] }), false);
});

test('partial-day unavailable exception blocks only intersecting slots', () => {
  const rules = [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true }];
  const exceptions = [{ is_available: false, start_time: '12:00', end_time: '13:00' }];
  assert.equal(slotIsAvailable({ date: '2026-10-12', start: 690, end: 750, rules, bookings: [], exceptions }), false);
  assert.equal(slotIsAvailable({ date: '2026-10-12', start: 780, end: 840, rules, bookings: [], exceptions }), true);
});

test('bookings cannot be placed outside weekly available intervals', () => {
  const rules = [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true }];
  assert.equal(slotIsAvailable({ date: '2026-10-12', start: 480, end: 540, rules, exceptions: [], bookings: [] }), false);
  assert.equal(slotIsAvailable({ date: '2026-10-12', start: 990, end: 1050, rules, exceptions: [], bookings: [] }), false);
});

test('status transitions cannot reopen finalised bookings', () => {
  assert.deepEqual(STATUS_TRANSITIONS.pending, ['confirmed', 'declined']);
  assert.deepEqual(STATUS_TRANSITIONS.confirmed, ['completed', 'cancelled']);
  for (const status of ['completed', 'cancelled', 'declined']) assert.deepEqual(STATUS_TRANSITIONS[status], []);
});

test('calendar rule and exception input validation rejects injected ownership', () => {
  assert.throws(() => validateRule({ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true, photographer_id: 'other' }), { status: 400 });
  assert.throws(() => validateException({ exception_date: '2026-10-12', is_available: false, photographer_id: 'other' }), { status: 400 });
});

test('calendar month query rejects reversed or excessive ranges', () => {
  assert.deepEqual(validateCalendarRange('2026-10-01', '2026-11-08'), { start: '2026-10-01', end: '2026-11-08' });
  assert.throws(() => validateCalendarRange('2026-11-08', '2026-10-01'), { status: 400 });
  assert.throws(() => validateCalendarRange('2026-10-01', '2026-12-01'), { status: 400 });
});
