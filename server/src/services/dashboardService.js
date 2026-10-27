/** Read-only photographer dashboard summary. All queries use the caller's JWT and RLS. */
import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INVOICE_PAGE_SIZE = 500;

// Throw a BookingRequestError for invalid date input, indicating the expected format
function invalidDate() {
  throw new BookingRequestError(400, 'INVALID_DATE', 'A real date in YYYY-MM-DD format is required.');
}
// Helper function to query the database and throw a BookingRequestError on failure
export function validateDashboardDate(today) {
  if (typeof today !== 'string' || !DATE.test(today)) invalidDate();
  const parsed = new Date(`${today}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== today) invalidDate();
  return today;
}
// Helper function to query the database and return data or throw an error with a message and cause
async function read(query, message) {
  const { data, error, count } = await query;
  if (error) {
    const failure = new Error(message);
    failure.cause = error;
    throw failure;
  }
  return { data, count };
}

/**
 * Iterate outstanding invoices rather than silently truncating the amount at
 * the default PostgREST maximum row limit. Return only the three earliest due.
 */
// Main function to get the outstanding invoices for a photographer, including total amount and the three earliest due invoices
export async function getOutstandingInvoices(db, photographerId) {
  let outstanding = 0;
  const candidates = [];
  let offset = 0;
  for (;;) {
    const { data } = await read(db.from('invoices')
      .select('invoice_id,invoice_number,due_date,total_amount,status,created_at')
      .eq('photographer_id', photographerId).in('status', ['draft', 'sent', 'overdue'])
      .order('created_at', { ascending: false }).order('invoice_id', { ascending: false })
      .range(offset, offset + INVOICE_PAGE_SIZE - 1), 'Unable to load outstanding invoices.');
    const page = data ?? [];
    for (const invoice of page) {
      outstanding += Number(invoice.total_amount || 0);
      candidates.push(invoice);
    }
    if (page.length < INVOICE_PAGE_SIZE) break;
    offset += page.length;
  }
  const invoices = candidates.sort((a, b) =>
    (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')
    || (b.created_at || '').localeCompare(a.created_at || '')
    || (b.invoice_id || '').localeCompare(a.invoice_id || '')
  ).slice(0, 3);
  return { outstanding, invoices };
}

// Main function to get the photographer's dashboard summary, including upcoming bookings, client count, recent galleries, and outstanding invoices
export async function getPhotographerDashboard(db, userId, today) {
  const date = validateDashboardDate(today);
  const photographer = await resolvePhotographer(db, userId);
  const id = photographer.photographer_id;
  const [bookings, clients, galleries, galleryCount, invoiceSummary] = await Promise.all([
    read(db.from('bookings').select(`
      booking_id,booking_date,start_time,end_time,status,total_amount,
      clients(client_id,user_id,profiles(first_name,last_name)),
      services(service_id,name)
    `).eq('photographer_id', id).gte('booking_date', date)
      .in('status', ['pending', 'confirmed'])
      .order('booking_date', { ascending: true }).order('start_time', { ascending: true })
      .limit(5), 'Unable to load upcoming bookings.'),
    read(db.from('clients').select('client_id', { count: 'exact', head: true })
      .eq('photographer_id', id), 'Unable to count clients.'),
    read(db.from('galleries').select('gallery_id,name,description,is_published,created_at')
      .eq('photographer_id', id).order('created_at', { ascending: false }).limit(4), 'Unable to load galleries.'),
    read(db.from('galleries').select('gallery_id', { count: 'exact', head: true })
      .eq('photographer_id', id).eq('is_published', true), 'Unable to count published galleries.'),
    getOutstandingInvoices(db, id),
  ]);
  return {
    profile: {
      photographer_id: id,
      business_name: photographer.business_name,
      // These are used only if present; do not expose unrelated profile fields.
    },
    stats: {
      // Matches existing dashboard: count of the FIVE displayed bookings, not all future bookings.
      bookings: (bookings.data ?? []).length,
      clients: clients.count ?? 0,
      outstanding: invoiceSummary.outstanding,
      galleries: galleryCount.count ?? 0,
    },
    upcoming_bookings: bookings.data ?? [],
    recent_galleries: galleries.data ?? [],
    outstanding_invoices: invoiceSummary.invoices,
  };
}
