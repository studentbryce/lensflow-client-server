import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { ClientBookingError } from '../services/clientBookingService.js';
import { ClientInvoiceError, listClientInvoices, getClientInvoice } from '../services/clientInvoicesService.js';

function handleError(error, res, next) {
  if (error instanceof ClientInvoiceError || error instanceof ClientBookingError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}
export async function listInvoices(req, res, next) {
  try {
    const data = await listClientInvoices(createUserSupabaseClient(req.accessToken), req.user.id);
    return res.json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}
export async function getInvoice(req, res, next) {
  try {
    const data = await getClientInvoice(createUserSupabaseClient(req.accessToken), req.user.id, req.params.id);
    return res.json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}
