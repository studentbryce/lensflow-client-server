import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { ClientMessageError } from '../services/clientMessagesService.js';
import { PhotographerMessageError, getPhotographerMessages, ensurePhotographerConversation,
  sendPhotographerMessage, markPhotographerMessagesRead } from '../services/photographerMessagesService.js';
import { getUnreadMessageCount } from '../services/unreadMessagesService.js';

// Generic wrapper function to handle responses and errors for photographer message operations
function wrap(action, successStatus = 200) {
  return async (req, res, next) => {
    try {
      const data = await action(createUserSupabaseClient(req.accessToken), req.user.id, req.body);
      return res.status(successStatus).json({ success: true, data });
    } catch (error) {
      if (error instanceof PhotographerMessageError || error instanceof BookingRequestError || error instanceof ClientMessageError) {
        return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
      }
      return next(error);
    }
  };
}

// Controller functions for photographer message operations
export const listPhotographerMessages = wrap(getPhotographerMessages);
export const startPhotographerConversation = wrap(ensurePhotographerConversation);
export const sendPhotographerMessageHandler = wrap(sendPhotographerMessage, 201);
export const readPhotographerMessages = wrap(markPhotographerMessagesRead);
export const unreadMessageCount = wrap(getUnreadMessageCount);
