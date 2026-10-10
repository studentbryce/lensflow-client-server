import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import {
  listPhotographerClients, getPhotographerClient, updatePhotographerClient,
} from '../services/photographerClientsService.js';

function respondError(error, res, next) {
  if (error instanceof BookingRequestError) {
    return res.status(error.status).set('Cache-Control', 'no-store').json({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }
  return next(error);
}

export async function getClients(req, res, next) {
  try {
    const data = await listPhotographerClients(createUserSupabaseClient(req.accessToken), req.user.id);
    return res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) { return respondError(error, res, next); }
}

export async function getClient(req, res, next) {
  try {
    const data = await getPhotographerClient(createUserSupabaseClient(req.accessToken), req.user.id, req.params.id);
    return res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) { return respondError(error, res, next); }
}

export async function patchClient(req, res, next) {
  try {
    const data = await updatePhotographerClient(createUserSupabaseClient(req.accessToken), req.user.id, req.params.id, req.body);
    return res.status(200).set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) { return respondError(error, res, next); }
}
