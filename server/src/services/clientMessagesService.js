/** Milestone 11D — client messaging via verified user JWT and RLS. */
import { findAuthenticatedClient } from './clientBookingService.js';

const PAGE = 250;
const MAX_MESSAGE_LENGTH = 5000;
const CONVERSATION_FIELDS = 'conversation_id,photographer_id,client_id,created_at,updated_at';
const MESSAGE_FIELDS = 'message_id,conversation_id,sender_id,message,is_read,created_at';

export class ClientMessageError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function failure(label, cause) {
  const error = new Error(`Unable to ${label}.`);
  error.cause = cause;
  return error;
}
async function queryResult(query, label) {
  const { data, error } = await query;
  if (error) throw failure(label, error);
  return data;
}
async function getContext(db, userId) {
  const clientId = await findAuthenticatedClient(db, userId);
  const client = await queryResult(db.from('clients')
    .select('client_id,photographer_id,user_id').eq('client_id', clientId).eq('user_id', userId)
    .maybeSingle(), 'load client details');
  if (!client) throw new ClientMessageError(403, 'CLIENT_REQUIRED', 'A client profile is required.');
  const photographer = await queryResult(db.from('photographer_profiles')
    .select('photographer_id,user_id,business_name').eq('photographer_id', client.photographer_id)
    .maybeSingle(), 'load photographer details');
  return { client, photographer: photographer || { photographer_id: client.photographer_id, business_name: 'Your photographer' } };
}
async function findConversation(db, client) {
  return await queryResult(db.from('conversations').select(CONVERSATION_FIELDS)
    .eq('photographer_id', client.photographer_id).eq('client_id', client.client_id)
    .maybeSingle(), 'load conversation');
}
async function loadMessages(db, conversationId) {
  const messages = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await queryResult(db.from('messages').select(MESSAGE_FIELDS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .order('message_id', { ascending: true })
      .range(offset, offset + PAGE - 1), 'load messages') ?? [];
    messages.push(...batch);
    if (batch.length < PAGE) break;
  }
  return messages;
}
export async function getClientMessages(db, userId) {
  const { client, photographer } = await getContext(db, userId);
  const conversation = await findConversation(db, client);
  return { currentUserId: userId, client, photographer, conversation, messages: conversation ? await loadMessages(db, conversation.conversation_id) : [] };
}
export async function ensureClientConversation(db, userId) {
  const { client } = await getContext(db, userId);
  const existing = await findConversation(db, client);
  if (existing) return existing;
  const { data, error } = await db.from('conversations')
    .insert({ photographer_id: client.photographer_id, client_id: client.client_id })
    .select(CONVERSATION_FIELDS).single();
  if (error?.code === '23505') {
    const concurrent = await findConversation(db, client);
    if (concurrent) return concurrent;
  }
  if (error) throw failure('create conversation', error);
  return data;
}
export function validateMessageBody(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_MESSAGE_LENGTH) {
    throw new ClientMessageError(400, 'INVALID_MESSAGE', `Message must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return value.trim();
}
export async function sendClientMessage(db, userId, body) {
  const message = validateMessageBody(body?.message);
  const { client } = await getContext(db, userId);
  const conversation = await findConversation(db, client);
  if (!conversation) throw new ClientMessageError(409, 'CONVERSATION_REQUIRED', 'Start the conversation before sending a message.');
  const result = await queryResult(db.from('messages')
    .insert({ conversation_id: conversation.conversation_id, sender_id: userId, message })
    .select(MESSAGE_FIELDS).single(), 'send message');
  return result;
}
export async function markClientMessagesRead(db, userId) {
  const { client } = await getContext(db, userId);
  const conversation = await findConversation(db, client);
  if (!conversation) return { updatedIds: [] };
  // UPDATE is limited to unread messages from the other participant. RLS and
  // the database trigger must also enforce recipient-only, is_read-only changes.
  const updated = await queryResult(db.from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversation.conversation_id)
    .neq('sender_id', userId).eq('is_read', false)
    .select('message_id'), 'mark messages read');
  return { updatedIds: (updated ?? []).map(row => row.message_id) };
}
