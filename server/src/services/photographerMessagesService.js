/** Milestone 12A — photographer messaging. All reads and writes use caller JWT + RLS. */
import { resolvePhotographer } from './photographerBookingFormService.js';
import { validateMessageBody } from './clientMessagesService.js';

const PAGE = 250;
const CHUNK = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONVERSATION_FIELDS = 'conversation_id,photographer_id,client_id,created_at,updated_at';
const MESSAGE_FIELDS = 'message_id,conversation_id,sender_id,message,is_read,created_at';
export class PhotographerMessageError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function invalid(code, message) { throw new PhotographerMessageError(400, code, message); }
function failure(label, cause) { const error = new Error(`Unable to ${label}.`); error.cause = cause; return error; }
async function read(query, label) {
  const { data, error } = await query;
  if (error) throw failure(label, error);
  return data;
}
async function readAll(buildQuery, label) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await read(buildQuery().range(offset, offset + PAGE - 1), label) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}
async function context(db, userId) {
  const photographer = await resolvePhotographer(db, userId);
  return photographer.photographer_id;
}
async function ownedClient(db, photographerId, clientId) {
  if (typeof clientId !== 'string' || !UUID.test(clientId)) invalid('INVALID_CLIENT_ID', 'A valid client ID is required.');
  const client = await read(db.from('clients').select('client_id,user_id,photographer_id')
    .eq('client_id', clientId).eq('photographer_id', photographerId).maybeSingle(), 'load client');
  if (!client) throw new PhotographerMessageError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  return client;
}
async function ownedConversation(db, photographerId, conversationId) {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) invalid('INVALID_CONVERSATION_ID', 'A valid conversation ID is required.');
  const conversation = await read(db.from('conversations').select(CONVERSATION_FIELDS)
    .eq('conversation_id', conversationId).eq('photographer_id', photographerId).maybeSingle(), 'load conversation');
  if (!conversation) throw new PhotographerMessageError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  return conversation;
}
export async function getPhotographerMessages(db, userId) {
  const photographerId = await context(db, userId);
  const clients = await readAll(() => db.from('clients').select('client_id,user_id')
    .eq('photographer_id', photographerId).order('client_id', { ascending: true }), 'load clients');
  const ids = [...new Set(clients.map(c => c.user_id).filter(Boolean))];
  const profileMap = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const profiles = await read(db.from('profiles').select('user_id,first_name,last_name,email')
      .in('user_id', ids.slice(i, i + CHUNK)), 'load client profiles') ?? [];
    for (const p of profiles) profileMap.set(p.user_id, p);
  }
  const enrichedClients = clients.map(c => ({ ...c, first_name: profileMap.get(c.user_id)?.first_name || '',
    last_name: profileMap.get(c.user_id)?.last_name || '', email: profileMap.get(c.user_id)?.email || '' }));
  enrichedClients.sort((a,b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  const clientMap = new Map(enrichedClients.map(c => [c.client_id, c]));
  const conversations = await readAll(() => db.from('conversations').select(CONVERSATION_FIELDS)
    .eq('photographer_id', photographerId).order('updated_at', { ascending: false })
    .order('conversation_id', { ascending: false }), 'load conversations');
  const messageMap = new Map(conversations.map(c => [c.conversation_id, []]));
  // Chunk IN filters, paginate within each chunk to avoid PostgREST row caps.
  for (let i = 0; i < conversations.length; i += CHUNK) {
    const chunk = conversations.slice(i, i + CHUNK).map(c => c.conversation_id);
    const messages = await readAll(() => db.from('messages').select(MESSAGE_FIELDS)
      .in('conversation_id', chunk).order('created_at', { ascending: true })
      .order('message_id', { ascending: true }), 'load messages');
    for (const m of messages) if (messageMap.has(m.conversation_id)) messageMap.get(m.conversation_id).push(m);
  }
  const built = conversations.map(c => {
    const messages = messageMap.get(c.conversation_id) ?? [];
    return { ...c, client: clientMap.get(c.client_id) ?? null, messages,
      lastMessage: messages.at(-1) ?? null,
      unreadCount: messages.filter(m => !m.is_read && m.sender_id !== userId).length };
  });
  return { currentUserId: userId, photographerId, clients: enrichedClients, conversations: built };
}
export async function ensurePhotographerConversation(db, userId, body) {
  const photographerId = await context(db, userId);
  const client = await ownedClient(db, photographerId, body?.clientId);
  const find = () => read(db.from('conversations').select(CONVERSATION_FIELDS)
    .eq('photographer_id', photographerId).eq('client_id', client.client_id).maybeSingle(), 'load conversation');
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await db.from('conversations')
    .insert({ photographer_id: photographerId, client_id: client.client_id })
    .select(CONVERSATION_FIELDS).single();
  if (error?.code === '23505') {
    const concurrent = await find();
    if (concurrent) return concurrent;
  }
  if (error) throw failure('create conversation', error);
  return data;
}
export async function sendPhotographerMessage(db, userId, body) {
  const message = validateMessageBody(body?.message);
  const photographerId = await context(db, userId);
  const conversation = await ownedConversation(db, photographerId, body?.conversationId);
  return await read(db.from('messages').insert({ conversation_id: conversation.conversation_id, sender_id: userId, message })
    .select(MESSAGE_FIELDS).single(), 'send message');
}
export async function markPhotographerMessagesRead(db, userId, body) {
  const photographerId = await context(db, userId);
  const conversation = await ownedConversation(db, photographerId, body?.conversationId);
  // RLS and protect_message_update_trigger enforce recipient-only is_read changes.
  const updated = await read(db.from('messages').update({ is_read: true })
    .eq('conversation_id', conversation.conversation_id).neq('sender_id', userId)
    .eq('is_read', false).select('message_id'), 'mark messages read');
  return { updatedIds: (updated ?? []).map(row => row.message_id) };
}
