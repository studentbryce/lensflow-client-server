/** Photographer service CRUD, using caller JWT + RLS (never service role). */
import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 500;
const FIELDS = 'service_id,photographer_id,name,description,price,duration_minutes,deposit_amount,image_url,is_active,created_at,updated_at';
const EDITABLE = ['name', 'description', 'price', 'duration_minutes', 'deposit_amount', 'is_active', 'image_path'];
const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };

async function read(query, message) {
  const { data, error } = await query;
  if (error) { const err = new Error(message); err.cause = error; throw err; }
  return data;
}

export function validateServiceId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) fail(400, 'INVALID_SERVICE_ID', 'A valid service ID is required.');
  return id;
}

export function validateServiceBody(body, { create = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_BODY', 'A JSON service object is required.');
  const keys = Object.keys(body);
  if (!keys.length || keys.some(k => !EDITABLE.includes(k))) fail(400, 'INVALID_FIELDS', 'Unexpected or missing service fields.');
  const required = ['name', 'description', 'price', 'duration_minutes', 'deposit_amount', 'is_active'];
  if (create && required.some(k => !(k in body))) fail(400, 'INVALID_FIELDS', 'Required service fields are missing.');
  const out = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 150) fail(400, 'INVALID_NAME', 'Service name must be 1–150 characters.');
    out.name = body.name.trim();
  }
  if ('description' in body) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 5000)) fail(400, 'INVALID_DESCRIPTION', 'Description must be text of at most 5000 characters.');
    out.description = body.description?.trim() || null;
  }
  for (const k of ['price', 'deposit_amount']) {
    if (k in body) {
      if (typeof body[k] !== 'number' || !Number.isFinite(body[k]) || body[k] < 0 || Math.abs(Math.round(body[k] * 100) - body[k] * 100) > 1e-6 || body[k] > 9999999) fail(400, 'INVALID_AMOUNT', `${k} must be a nonnegative monetary amount with at most two decimals.`);
      out[k] = body[k];
    }
  }
  if ('duration_minutes' in body) {
    if (!Number.isInteger(body.duration_minutes) || body.duration_minutes < 1 || body.duration_minutes > 1440) fail(400, 'INVALID_DURATION', 'Duration must be a whole number between 1 and 1440 minutes.');
    out.duration_minutes = body.duration_minutes;
  }
  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') fail(400, 'INVALID_STATUS', 'is_active must be true or false.');
    out.is_active = body.is_active;
  }
  if ('image_path' in body) {
    if (body.image_path !== null && (typeof body.image_path !== 'string' || body.image_path.length > 300)) fail(400, 'INVALID_IMAGE', 'Invalid service image path.');
    out.image_path = body.image_path;
  }
  if ('price' in out && 'deposit_amount' in out && out.deposit_amount > out.price) fail(400, 'INVALID_DEPOSIT', 'Deposit cannot exceed the service price.');
  return out;
}

export function resolveServiceImageUrl(db, photographerId, imagePath) {
  if (imagePath === null) return null;
  // Only paths in the current photographer's service-media folder can be linked.
  const pattern = new RegExp(`^${photographerId}/services/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)$`, 'i');
  if (!pattern.test(imagePath)) fail(400, 'INVALID_IMAGE', 'Service image must belong to the authenticated photographer.');
  const { data } = db.storage.from('service-media').getPublicUrl(imagePath);
  if (!data?.publicUrl) fail(500, 'STORAGE_URL_FAILED', 'Unable to resolve service image URL.');
  return data.publicUrl;
}

export async function listPhotographerServices(db, userId) {
  const photographer = await resolvePhotographer(db, userId);
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await read(db.from('services').select(FIELDS)
      .eq('photographer_id', photographer.photographer_id)
      .order('created_at', { ascending: false }).order('service_id', { ascending: false })
      .range(offset, offset + PAGE - 1), 'Unable to load services.');
    all.push(...(rows ?? []));
    if ((rows ?? []).length < PAGE) return all;
  }
}

export async function getPhotographerServicesContext(db, userId) {
  const photographer = await resolvePhotographer(db, userId);
  return { photographer_id: photographer.photographer_id };
}

async function ownedService(db, photographerId, serviceId) {
  const service = await read(db.from('services').select(FIELDS)
    .eq('service_id', serviceId).eq('photographer_id', photographerId).maybeSingle(), 'Unable to load service.');
  if (!service) fail(404, 'SERVICE_NOT_FOUND', 'Service could not be found.');
  return service;
}

export async function getPhotographerService(db, userId, serviceId) {
  validateServiceId(serviceId);
  const photographer = await resolvePhotographer(db, userId);
  return ownedService(db, photographer.photographer_id, serviceId);
}

export async function createPhotographerService(db, userId, body) {
  const changes = validateServiceBody(body, { create: true });
  const photographer = await resolvePhotographer(db, userId);
  const { image_path, ...values } = changes;
  values.photographer_id = photographer.photographer_id;
  values.image_url = image_path === undefined ? null : resolveServiceImageUrl(db, photographer.photographer_id, image_path);
  const row = await read(db.from('services').insert(values).select(FIELDS).single(), 'Unable to create service.');
  if (!row) fail(500, 'CREATE_FAILED', 'Service could not be created.');
  return row;
}

export async function updatePhotographerService(db, userId, serviceId, body) {
  validateServiceId(serviceId);
  const changes = validateServiceBody(body);
  const photographer = await resolvePhotographer(db, userId);
  const current = await ownedService(db, photographer.photographer_id, serviceId);
  const { image_path, ...values } = changes;
  const price = values.price ?? Number(current.price);
  const deposit = values.deposit_amount ?? Number(current.deposit_amount ?? 0);
  if (deposit > price) fail(400, 'INVALID_DEPOSIT', 'Deposit cannot exceed the service price.');
  if (image_path !== undefined) values.image_url = resolveServiceImageUrl(db, photographer.photographer_id, image_path);
  const row = await read(db.from('services').update(values)
    .eq('service_id', serviceId).eq('photographer_id', photographer.photographer_id)
    .select(FIELDS).maybeSingle(), 'Unable to update service.');
  if (!row) fail(404, 'SERVICE_NOT_FOUND', 'Service could not be found.');
  return row;
}
