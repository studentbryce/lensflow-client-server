import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClientMessageError, getClientMessages, ensureClientConversation,
  sendClientMessage, markClientMessagesRead, validateMessageBody,
} from '../src/services/clientMessagesService.js';

const UID = 'auth-client';
const client = { client_id: 'client-own', photographer_id: 'photographer-own', user_id: UID };
const conversation = { conversation_id: 'conversation-own', client_id: client.client_id, photographer_id: client.photographer_id };
const message = { message_id: 'message-own', conversation_id: conversation.conversation_id, sender_id: UID, message: 'Hello', is_read: false };
function mockDb(overrides = {}) {
  const calls = [];
  const responses = {
    clients: [{ data: { client_id: client.client_id }, error: null }, { data: client, error: null }],
    photographer_profiles: { data: { photographer_id: client.photographer_id, business_name: 'Studio' }, error: null },
    conversations: { data: conversation, error: null },
    messages: { data: [message], error: null },
    ...overrides,
  };
  const counts = {};
  function response(table) {
    const entry = responses[table]; const n = counts[table] || 0; counts[table] = n + 1;
    return Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
  }
  return { calls, from(table) {
    calls.push(['from', table]);
    const query = {
      select(value) { calls.push(['select', table, value]); return this; },
      eq(key, value) { calls.push(['eq', table, key, value]); return this; },
      neq(key, value) { calls.push(['neq', table, key, value]); return this; },
      order(key, value) { calls.push(['order', table, key, value]); return this; },
      range(start, end) { calls.push(['range', table, start, end]); return this; },
      insert(value) { calls.push(['insert', table, value]); return this; },
      update(value) { calls.push(['update', table, value]); return this; },
      maybeSingle() { return Promise.resolve(response(table)); },
      single() { return Promise.resolve(response(table)); },
      then(resolve, reject) { return Promise.resolve(response(table)).then(resolve, reject); },
    };
    return query;
  } };
}
const has = (db, method, table, field, value) => db.calls.some(c => c[0] === method && c[1] === table && c[2] === field && (value === undefined || c[3] === value));

test('client messages loads only JWT-derived client and matching conversation', async () => {
  const db = mockDb(); const result = await getClientMessages(db, UID);
  assert.equal(result.currentUserId, UID); assert.equal(result.messages.length, 1);
  assert.ok(has(db, 'eq', 'clients', 'user_id', UID));
  assert.ok(has(db, 'eq', 'conversations', 'client_id', client.client_id));
  assert.ok(has(db, 'eq', 'conversations', 'photographer_id', client.photographer_id));
});
test('no conversation returns empty thread without message query', async () => {
  const db = mockDb({ conversations: { data: null, error: null } });
  const result = await getClientMessages(db, UID);
  assert.equal(result.conversation, null); assert.deepEqual(result.messages, []);
  assert.ok(!db.calls.some(c => c[1] === 'messages'));
});
test('missing client returns 403 before messaging queries', async () => {
  const db = mockDb({ clients: { data: null, error: null } });
  await assert.rejects(() => getClientMessages(db, UID), e => e.status === 403);
  assert.ok(!db.calls.some(c => c[1] === 'conversations'));
});
test('missing identity returns 401 without database calls', async () => {
  const db = mockDb(); await assert.rejects(() => getClientMessages(db, ''), e => e.status === 401);
  assert.equal(db.calls.length, 0);
});
test('messages are ordered oldest first and paged', async () => {
  const db = mockDb({ messages: [{ data: Array.from({ length: 250 }, (_, i) => ({ message_id: String(i) })), error: null }, { data: [message], error: null }] });
  assert.equal((await getClientMessages(db, UID)).messages.length, 251);
  assert.deepEqual(db.calls.filter(c => c[0] === 'range').map(c => c.slice(2)), [[0, 249], [250, 499]]);
  assert.ok(db.calls.some(c => c[0] === 'order' && c[2] === 'created_at' && c[3]?.ascending === true));
});
test('get conversation reuses existing record without inserting', async () => {
  const db = mockDb(); assert.equal((await ensureClientConversation(db, UID)).conversation_id, conversation.conversation_id);
  assert.ok(!db.calls.some(c => c[0] === 'insert'));
});
test('new conversation uses server-owned photographer and client IDs', async () => {
  const db = mockDb({ conversations: [{ data: null, error: null }, { data: conversation, error: null }] });
  assert.equal((await ensureClientConversation(db, UID)).conversation_id, conversation.conversation_id);
  const insert = db.calls.find(c => c[0] === 'insert' && c[1] === 'conversations');
  assert.deepEqual(insert[2], { photographer_id: client.photographer_id, client_id: client.client_id });
});
test('unique conflict is recovered by reading the winning conversation', async () => {
  const db = mockDb({ conversations: [{ data: null, error: null }, { data: null, error: { code: '23505' } }, { data: conversation, error: null }] });
  assert.equal((await ensureClientConversation(db, UID)).conversation_id, conversation.conversation_id);
});
test('unrecoverable insert error is safe and not leaked', async () => {
  const db = mockDb({ conversations: [{ data: null, error: null }, { data: null, error: { code: '23505', message: 'sensitive detail' } }, { data: null, error: null }] });
  await assert.rejects(() => ensureClientConversation(db, UID), e => e.message === 'Unable to create conversation.');
});
test('message validation trims and rejects invalid values', () => {
  assert.equal(validateMessageBody('  Hello  '), 'Hello');
  for (const value of ['', '   ', null, 4, 'a'.repeat(5001)]) {
    assert.throws(() => validateMessageBody(value), e => e instanceof ClientMessageError && e.status === 400);
  }
  assert.equal(validateMessageBody('a'.repeat(5000)).length, 5000);
});
test('send message derives sender ID and conversation ID server-side', async () => {
  const db = mockDb({ messages: { data: message, error: null } });
  const result = await sendClientMessage(db, UID, { message: ' Hello ', sender_id: 'spoof', conversation_id: 'spoof' });
  assert.equal(result.message, 'Hello');
  const inserted = db.calls.find(c => c[0] === 'insert' && c[1] === 'messages')[2];
  assert.deepEqual(inserted, { conversation_id: conversation.conversation_id, sender_id: UID, message: 'Hello' });
});
test('send without a conversation fails 409 without inserting', async () => {
  const db = mockDb({ conversations: { data: null, error: null } });
  await assert.rejects(() => sendClientMessage(db, UID, { message: 'Hello' }), e => e.status === 409);
  assert.ok(!db.calls.some(c => c[0] === 'insert'));
});
test('invalid message rejected before database access', async () => {
  const db = mockDb(); await assert.rejects(() => sendClientMessage(db, UID, { message: '' }), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});
test('mark read only changes incoming unread messages for owned conversation', async () => {
  const db = mockDb({ messages: { data: [{ message_id: 'incoming' }], error: null } });
  const result = await markClientMessagesRead(db, UID);
  assert.deepEqual(result.updatedIds, ['incoming']);
  assert.ok(has(db, 'eq', 'messages', 'conversation_id', conversation.conversation_id));
  assert.ok(has(db, 'neq', 'messages', 'sender_id', UID));
  assert.ok(has(db, 'eq', 'messages', 'is_read', false));
  assert.deepEqual(db.calls.find(c => c[0] === 'update')[2], { is_read: true });
});
test('mark read without conversation is a no-op', async () => {
  const db = mockDb({ conversations: { data: null, error: null } });
  assert.deepEqual(await markClientMessagesRead(db, UID), { updatedIds: [] });
  assert.ok(!db.calls.some(c => c[0] === 'update'));
});
test('database errors do not leak raw messages', async () => {
  const db = mockDb({ messages: { data: null, error: { message: 'secret SQL error' } } });
  await assert.rejects(() => getClientMessages(db, UID), e => e.message === 'Unable to load messages.');
});
test('conversation lookup failure stops sending', async () => {
  const db = mockDb({ conversations: { data: null, error: { message: 'private SQL' } } });
  await assert.rejects(() => sendClientMessage(db, UID, { message: 'Hello' }), e => e.message === 'Unable to load conversation.');
  assert.ok(!db.calls.some(c => c[0] === 'insert'));
});
test('photographer RLS or database failure is surfaced safely', async () => {
  const db = mockDb({ photographer_profiles: { data: null, error: { message: 'private SQL' } } });
  await assert.rejects(() => getClientMessages(db, UID), e => e.message === 'Unable to load photographer details.');
});
