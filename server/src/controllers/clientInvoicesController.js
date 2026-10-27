import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { ClientBookingError } from '../services/clientBookingService.js';
import { ClientInvoiceError, listClientInvoices, getClientInvoice } from '../services/clientInvoicesService.js';

// Error handling middleware for client invoices routes
function handleError(error, res, next) {
  if (error instanceof ClientInvoiceError || error instanceof ClientBookingError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  return next(error);
}

// Controller function to list all invoices for a client
export async function listInvoices(req, res, next) {
  try {
    const data = await listClientInvoices(createUserSupabaseClient(req.accessToken), req.user.id);
    return res.json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}

// Controller function to get a specific invoice for a client by ID
export async function getInvoice(req, res, next) {
  try {
    const data = await getClientInvoice(createUserSupabaseClient(req.accessToken), req.user.id, req.params.id);
    return res.json({ success: true, data });
  } catch (error) { return handleError(error, res, next); }
}
