import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { listPhotographerServices, getPhotographerServicesContext, getPhotographerService, createPhotographerService, updatePhotographerService } from '../services/photographerServicesService.js';

// Generic error response handler for photographer service operations
function errorResponse(error, res, next) {
  if (error instanceof BookingRequestError) return res.status(error.status).set('Cache-Control','no-store').json({ success:false, error:{ code:error.code, message:error.message } });
  return next(error);
}

// Generic handler function to process requests for photographer service operations
const handler = (action, status = 200) => async (req,res,next) => {
  try {
    const db = createUserSupabaseClient(req.accessToken);
    const data = await action(db, req.user.id, req.params.id, req.body);
    return res.status(status).set('Cache-Control','no-store').json({ success:true, data });
  } catch (error) { return errorResponse(error,res,next); }
};

// Controller functions for photographer service operations
export const getServices = handler(listPhotographerServices);
export const getServicesContext = handler(getPhotographerServicesContext);
export const getService = handler(getPhotographerService);
export const postService = handler((db, userId, _id, body) => createPhotographerService(db, userId, body), 201);
export const patchService = handler(updatePhotographerService);
