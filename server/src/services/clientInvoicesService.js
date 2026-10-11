/** Milestone 11B: read-only client invoices. Verified JWT + per-user RLS client. */
import { findAuthenticatedClient } from './clientBookingService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 250;
const INVOICE_FIELDS = `invoice_id,photographer_id,booking_id,invoice_number,issue_date,due_date,subtotal,tax_amount,tax_rate,tax_included,tax_number,total_amount,status,notes,bank_account_name,bank_name,bank_account_number,bank_payment_instructions,created_at,bookings(booking_id,booking_date,start_time,end_time,location,services(service_id,name))`;
const LIST_FIELDS = `invoice_id,booking_id,invoice_number,issue_date,due_date,subtotal,total_amount,status,notes,created_at,bookings(booking_id,booking_date,start_time,end_time,location,services(service_id,name))`;
const ITEM_FIELDS = 'invoice_item_id,description,quantity,unit_price,subtotal';

export class ClientInvoiceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function failure(label, cause) {
  const err = new Error(`Unable to load ${label}.`);
  err.cause = cause;
  return err;
}
async function read(query, label) {
  const { data, error } = await query;
  if (error) throw failure(label, error);
  return data;
}
export function validateClientInvoiceId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw new ClientInvoiceError(400, 'INVALID_INVOICE_ID', 'A valid invoice ID is required.');
  }
  return id;
}
async function context(db, userId) {
  const clientId = await findAuthenticatedClient(db, userId);
  const client = await read(db.from('clients')
    .select('client_id,photographer_id').eq('client_id', clientId).maybeSingle(), 'client details');
  if (!client) throw new ClientInvoiceError(403, 'CLIENT_REQUIRED', 'A client profile is required.');
  const profile = await read(db.from('profiles')
    .select('first_name,last_name,email,phone').eq('user_id', userId).maybeSingle(), 'client profile');
  if (!profile) throw new ClientInvoiceError(404, 'PROFILE_NOT_FOUND', 'Client profile not found.');
  const photographerProfile = client.photographer_id
    ? await read(db.from('photographer_profiles')
      .select('photographer_id,business_name').eq('photographer_id', client.photographer_id)
      .maybeSingle(), 'photographer profile')
    : null;
  return { clientId, clientProfile: profile, photographerProfile };
}

export async function listClientInvoices(db, userId) {
  const { clientId, clientProfile, photographerProfile } = await context(db, userId);
  const invoices = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await read(db.from('invoices')
      .select(LIST_FIELDS).eq('client_id', clientId).neq('status', 'draft')
      .order('issue_date', { ascending: false }).order('created_at', { ascending: false })
      .order('invoice_id', { ascending: false })
      .range(offset, offset + PAGE - 1), 'invoices') ?? [];
    invoices.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { invoices, clientProfile, photographerProfile };
}

export async function getClientInvoice(db, userId, invoiceId) {
  validateClientInvoiceId(invoiceId);
  const { clientId, clientProfile, photographerProfile } = await context(db, userId);
  const invoice = await read(db.from('invoices')
    .select(INVOICE_FIELDS).eq('invoice_id', invoiceId).eq('client_id', clientId)
    .neq('status', 'draft').maybeSingle(), 'invoice');
  if (!invoice) throw new ClientInvoiceError(404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
  const items = await read(db.from('invoice_items')
    .select(ITEM_FIELDS).eq('invoice_id', invoiceId)
    .order('invoice_item_id', { ascending: true }), 'invoice items');
  return { invoice: { ...invoice, invoice_items: items ?? [] }, clientProfile, photographerProfile };
}
