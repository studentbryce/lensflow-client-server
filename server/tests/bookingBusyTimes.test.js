import assert from 'node:assert/strict';
import test from 'node:test';
import { getBusyTimes, validateBusyTimesQuery } from '../src/services/bookingBusyTimesService.js';

const photographer = '07475e7a-e35b-4811-8390-38ba6c0f0bd6';
const query = { photographer_id: photographer, date: '2026-10-21' };

test('validates query parameters', () => {
  assert.deepEqual(validateBusyTimesQuery(query), { photographerId: photographer, date: query.date });
  for (const bad of [{...query, date:'2026-02-30'}, {...query, date:'bad'}, {...query, photographer_id:'bad'}]) {
    assert.throws(() => validateBusyTimesQuery(bad));
  }
});

test('passes only trusted parameter values to RPC and returns busy intervals', async () => {
  let captured;
  const db = { rpc: async (name, args) => {
    captured = {name,args};
    return {data:[{start_time:'10:00:00',end_time:'11:00:00'}],error:null};
  }};
  assert.deepEqual(await getBusyTimes(db, query), [{start_time:'10:00:00',end_time:'11:00:00'}]);
  assert.equal(captured.name, 'get_booking_busy_times');
  assert.deepEqual(captured.args, {p_photographer_id:photographer,p_date:query.date});
});

test('forbidden RPC access is mapped to 403', async () => {
  const db = {rpc:async () => ({data:null,error:{code:'42501'}})};
  await assert.rejects(() => getBusyTimes(db, query), e => e.status===403);
});

test('unexpected RPC failures do not expose database internals', async () => {
  const db = {rpc:async () => ({data:null,error:{code:'XX000',message:'secret'}})};
  await assert.rejects(() => getBusyTimes(db, query), e => e.message==='Unable to load booking availability.');
});
