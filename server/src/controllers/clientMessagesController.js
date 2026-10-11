import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { ClientBookingError } from '../services/clientBookingService.js';
import {
  ClientMessageError, getClientMessages, ensureClientConversation,
  sendClientMessage, markClientMessagesRead,
} from '../services/clientMessagesService.js';

function handle(error, res, next) {
  if (error instanceof ClientMessageError || error instanceof ClientBookingError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}
const handler = action => async (req, res, next) => {
  try {
    const data = await action(createUserSupabaseClient(req.accessToken), req.user.id, req.body);
    return res.json({ success: true, data });
  } catch (error) { return handle(error, res, next); }
};
export const listMessages = handler(getClientMessages);
export const createConversation = handler(ensureClientConversation);
export const sendMessage = handler(sendClientMessage);
export const markRead = handler(markClientMessagesRead);
