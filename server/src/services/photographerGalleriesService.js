import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';
import { registeredGalleryMediaPaths, removeRegisteredGalleryFiles } from './galleryMediaDeletion.js';

// constants for validation and pagination
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 400;
const GALLERY = 'gallery_id,photographer_id,client_id,booking_id,name,description,is_published,allow_downloads,created_at,updated_at';
const MEDIA = 'media_id,gallery_id,photographer_id,file_name,storage_path,media_type,mime_type,file_size,thumbnail_path,is_downloadable,uploaded_at';
const BOOKING = 'booking_id,client_id,service_id,booking_date,start_time,end_time,location,status,total_amount';
const CLIENT = 'client_id,user_id';
const PROFILE = 'user_id,first_name,last_name,email,phone';
const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };
// Helper function to validate a UUID string, throwing a BookingRequestError if invalid
async function read(query, message) {
  const { data, error } = await query;
  if (error) { const err = new Error(message); err.cause = error; throw err; }
  return data;
}
// Helper function to read all rows from a query builder in batches, handling pagination
async function all(build, message) {
  const rows = [];
  for (let offset=0;;offset+=PAGE) {
    const batch = await read(build().range(offset,offset+PAGE-1),message) ?? [];
    rows.push(...batch);
    if (batch.length<PAGE) return rows;
  }
}
// Helper function to validate a UUID string, throwing a BookingRequestError if invalid
function uuid(value, code='INVALID_ID') {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400,code,'A valid identifier is required.');
  return value;
}
// Helper function to validate the request body for gallery creation or update, ensuring required fields are present and valid
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k)))
    fail(400,'INVALID_FIELDS','Unexpected or missing request fields.');
}
// Helper function to validate the request body for gallery creation or update, ensuring required fields are present and valid
export function galleryChanges(body, create=false) {
  fields(body, ['client_id','booking_id','name','description','is_published','allow_downloads']);
  if (create) { uuid(body.client_id,'INVALID_CLIENT'); uuid(body.booking_id,'INVALID_BOOKING'); }
  else if ('client_id' in body || 'booking_id' in body) fail(400,'IMMUTABLE_RELATION','Gallery client and booking cannot be changed.');
  const changes = {};
  if (create || 'name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length>150) fail(400,'INVALID_NAME','Gallery name must be 1–150 characters.');
    changes.name=body.name.trim();
  }
  if (create || 'description' in body) {
    if (body.description!=null && (typeof body.description!=='string' || body.description.length>2000)) fail(400,'INVALID_DESCRIPTION','Description must be 2000 characters or fewer.');
    changes.description=body.description?.trim()||null;
  }
  for (const key of ['is_published','allow_downloads']) if (create || key in body) {
    if (typeof body[key]!=='boolean') fail(400,'INVALID_SETTING',`${key} must be true or false.`);
    changes[key]=body[key];
  }
  if (!create && !Object.keys(changes).length) fail(400,'EMPTY_UPDATE','No gallery changes supplied.');
  return changes;
}

// Helper function to get a photographer by user ID, throwing a BookingRequestError if not found
async function ownedGallery(db, photographerId, id) {
  uuid(id,'INVALID_GALLERY');
  const gallery=await read(db.from('galleries').select(GALLERY).eq('gallery_id',id).eq('photographer_id',photographerId).maybeSingle(),'Unable to load gallery.');
  if (!gallery) fail(404,'GALLERY_NOT_FOUND','Gallery could not be found.');
  return gallery;
}

// Helper function to get a client and booking for a photographer, ensuring the booking belongs to the client and photographer
async function clientAndBooking(db, photographerId, clientId, bookingId) {
  const [client,booking]=await Promise.all([
    read(db.from('clients').select(CLIENT).eq('client_id',clientId).eq('photographer_id',photographerId).maybeSingle(),'Unable to verify client.'),
    read(db.from('bookings').select(BOOKING).eq('booking_id',bookingId).eq('photographer_id',photographerId).maybeSingle(),'Unable to verify booking.'),
  ]);
  if (!client || !booking || booking.client_id!==clientId) fail(400,'INVALID_BOOKING','Selected booking must belong to the selected client and photographer.');
  return {client,booking};
}

// Helper function to get the related client and booking for a gallery, ensuring they belong to the photographer
async function related(db, photographerId, gallery) {
  const [client,booking] = await Promise.all([
    read(db.from('clients').select(CLIENT).eq('client_id',gallery.client_id).eq('photographer_id',photographerId).maybeSingle(),'Unable to load gallery client.'),
    read(db.from('bookings').select(BOOKING).eq('booking_id',gallery.booking_id).eq('photographer_id',photographerId).maybeSingle(),'Unable to load gallery booking.'),
  ]);
  const profile=client?.user_id ? await read(db.from('profiles').select(PROFILE).eq('user_id',client.user_id).maybeSingle(),'Unable to load client profile.') : null;
  return {client:client?{...client,profile:profile??null}:null,booking:booking??null};
}

// Main function to list the photographer's galleries, clients, profiles, bookings, and media, including associated details
export async function listPhotographerGalleries(db,userId) {
  const p=await resolvePhotographer(db,userId), id=p.photographer_id;
  const [galleries,clients,bookings,media]=await Promise.all([
    all(()=>db.from('galleries').select(GALLERY).eq('photographer_id',id).order('updated_at',{ascending:false}).order('gallery_id',{ascending:false}),'Unable to load galleries.'),
    all(()=>db.from('clients').select(CLIENT).eq('photographer_id',id).order('client_id',{ascending:true}),'Unable to load clients.'),
    all(()=>db.from('bookings').select(BOOKING).eq('photographer_id',id).order('booking_date',{ascending:false}),'Unable to load bookings.'),
    all(()=>db.from('media').select(MEDIA).eq('photographer_id',id).order('uploaded_at',{ascending:true}),'Unable to load gallery media.'),
  ]);
  const ids=[...new Set(clients.map(c=>c.user_id).filter(Boolean))];
  const profiles=[];
  for(let i=0;i<ids.length;i+=150) profiles.push(...(await read(db.from('profiles').select(PROFILE).in('user_id',ids.slice(i,i+150)),'Unable to load client profiles.')??[]));
  const galleryIds=new Set(galleries.map(g=>g.gallery_id));
  return {photographer_id:id,galleries,clients,profiles,bookings,media:media.filter(m=>galleryIds.has(m.gallery_id))};
}

// Helper function to get the photographer's gallery options, including clients, profiles, bookings, and existing galleries
export async function getPhotographerGalleryOptions(db,userId) {
  const {photographer_id,clients,profiles,bookings,galleries}=await listPhotographerGalleries(db,userId);
  return {photographer_id,clients,profiles,bookings,existing_galleries:galleries.map(g=>({gallery_id:g.gallery_id,booking_id:g.booking_id,client_id:g.client_id,name:g.name}))};
}

// Helper function to get a specific gallery for a photographer, including the related client and booking
export async function getPhotographerGallery(db,userId,id) {
  const p=await resolvePhotographer(db,userId);
  const gallery=await ownedGallery(db,p.photographer_id,id);
  const [{client,booking},media]=await Promise.all([
    related(db,p.photographer_id,gallery),
    all(()=>db.from('media').select(MEDIA).eq('gallery_id',id).eq('photographer_id',p.photographer_id).order('uploaded_at',{ascending:false}),'Unable to load gallery media.'),
  ]);
  return {photographer_id:p.photographer_id,gallery,client,booking,media};
}

// Helper function to validate a client ID, throwing a BookingRequestError if invalid
export async function createPhotographerGallery(db,userId,body) {
  const changes=galleryChanges(body,true), p=await resolvePhotographer(db,userId);
  await clientAndBooking(db,p.photographer_id,body.client_id,body.booking_id);
  const duplicate=await read(db.from('galleries').select('gallery_id').eq('photographer_id',p.photographer_id).eq('booking_id',body.booking_id).maybeSingle(),'Unable to verify booking gallery.');
  if (duplicate) fail(409,'GALLERY_EXISTS','This booking already has a gallery.');
  return read(db.from('galleries').insert({...changes,photographer_id:p.photographer_id,client_id:body.client_id,booking_id:body.booking_id}).select(GALLERY).single(),'Unable to create gallery.');
}

// Main function to update a specific gallery for a photographer, including its name, description, and settings
export async function updatePhotographerGallery(db,userId,id,body) {
  uuid(id,'INVALID_GALLERY');
  const changes=galleryChanges(body), p=await resolvePhotographer(db,userId);
  await ownedGallery(db,p.photographer_id,id);
  const updated=await read(db.from('galleries').update(changes).eq('gallery_id',id).eq('photographer_id',p.photographer_id).select(GALLERY).maybeSingle(),'Unable to update gallery.');
  if(!updated)fail(404,'GALLERY_NOT_FOUND','Gallery could not be found.');
  return updated;
}

// Main function to delete a specific gallery for a photographer, including its media and database references
export function validateMedia(body, photographerId, galleryId) {
  fields(body,['file_name','storage_path','media_type','mime_type','file_size','is_downloadable']);
  if (typeof body.file_name!=='string'||!body.file_name.trim()||body.file_name.length>255) fail(400,'INVALID_FILE','Invalid file name.');
  if (typeof body.storage_path!=='string'||body.storage_path.length>1024||!body.storage_path.startsWith(`${photographerId}/${galleryId}/`)||body.storage_path.includes('..')||body.storage_path.includes('\\')) fail(400,'INVALID_PATH','Media path must be inside the current photographer gallery.');
  if (!['image','video'].includes(body.media_type)) fail(400,'INVALID_TYPE','Invalid media type.');
  const mime = body.mime_type;
  const image=['image/jpeg','image/jpg','image/png','image/webp'];
  const video=['video/mp4','video/webm','video/quicktime'];
  if (typeof mime!=='string'||!(body.media_type==='image'?image:video).includes(mime)) fail(400,'INVALID_TYPE','Unsupported media type.');
  if (!Number.isSafeInteger(body.file_size)||body.file_size<=0||body.file_size>(body.media_type==='image'?25:250)*1024*1024) fail(400,'INVALID_SIZE','Media file exceeds the permitted size.');
  if (body.is_downloadable!==undefined && typeof body.is_downloadable!=='boolean') fail(400,'INVALID_SETTING','Invalid download setting.');
  return {file_name:body.file_name,storage_path:body.storage_path,media_type:body.media_type,mime_type:mime,file_size:body.file_size,is_downloadable:body.is_downloadable??true};
}

// Main function to create a new media entry for a specific gallery, ensuring the media is valid and not already registered
export async function createPhotographerGalleryMedia(db,userId,id,body) {
  const p=await resolvePhotographer(db,userId);
  await ownedGallery(db,p.photographer_id,id);
  const changes=validateMedia(body,p.photographer_id,id);
  const existing=await read(db.from('media').select('media_id').eq('gallery_id',id).eq('storage_path',changes.storage_path).maybeSingle(),'Unable to verify media.');
  if(existing)fail(409,'MEDIA_EXISTS','This file has already been registered.');
  return read(db.from('media').insert({...changes,photographer_id:p.photographer_id,gallery_id:id}).select(MEDIA).single(),'Unable to register media.');
}
// Deletion is intentionally Storage-first. If Storage fails, the database
// references are retained so the photographer can retry safely.
// Main function to delete a specific media entry for a gallery, ensuring the media is valid and belongs to the photographer
export async function deletePhotographerGalleryMedia(db,userId,id,mediaId) {
  uuid(mediaId,'INVALID_MEDIA');
  const p=await resolvePhotographer(db,userId);
  await ownedGallery(db,p.photographer_id,id);
  const media=await read(db.from('media').select(MEDIA).eq('media_id',mediaId).eq('gallery_id',id).eq('photographer_id',p.photographer_id).maybeSingle(),'Unable to load media.');
  if(!media)fail(404,'MEDIA_NOT_FOUND','Media could not be found.');
  const paths=registeredGalleryMediaPaths([media],p.photographer_id,id);
  await removeRegisteredGalleryFiles(db,paths);
  const deleted=await read(db.from('media').delete().eq('media_id',mediaId).eq('gallery_id',id).eq('photographer_id',p.photographer_id).select('media_id').maybeSingle(),'Unable to delete media.');
  if(!deleted)fail(409,'MEDIA_DELETE_INCOMPLETE','Media could not be deleted. Refresh and try again.');
  return {deleted:true,media_id:mediaId};
}
// Main function to delete a specific gallery for a photographer, including its media and database references
export async function deletePhotographerGallery(db,userId,id) {
  const p=await resolvePhotographer(db,userId);
  await ownedGallery(db,p.photographer_id,id);
  const media=await all(()=>db.from('media').select(MEDIA).eq('gallery_id',id).eq('photographer_id',p.photographer_id).order('media_id',{ascending:true}),'Unable to load gallery media.');
  // Validate EVERY registered path before performing any Storage deletion.
  const paths=registeredGalleryMediaPaths(media,p.photographer_id,id);
  await removeRegisteredGalleryFiles(db,paths);
  // Remove rows only after all Storage batches returned success.
  await read(db.from('media').delete().eq('gallery_id',id).eq('photographer_id',p.photographer_id),'Unable to delete gallery media.');
  const deleted=await read(db.from('galleries').delete().eq('gallery_id',id).eq('photographer_id',p.photographer_id).select('gallery_id').maybeSingle(),'Unable to delete gallery.');
  if(!deleted)fail(409,'GALLERY_DELETE_INCOMPLETE','Gallery could not be deleted. Refresh and try again.');
  return {deleted:true,gallery_id:id};
}
