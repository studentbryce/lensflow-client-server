import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';

const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEBSITE_KEYS = ['primary_colour', 'secondary_colour', 'heading_font', 'body_font', 'navigation_font', 'hero_title', 'hero_description', 'hero_image_url', 'show_about', 'show_services', 'show_portfolio', 'show_reviews', 'show_contact'];
const FONTS = ['system', 'georgia', 'times', 'trebuchet', 'verdana'];
const RESERVED = ['client', 'photographer', 'login', 'signup', 'assets', 'api', 'admin'];
const PORTFOLIO = 'portfolio_id,photographer_id,title,description,media_url,thumbnail_url,category,display_order,published,source_media_id,created_at,updated_at';
const GALLERY = 'gallery_id,name,description,is_published,created_at';
const MEDIA = 'media_id,gallery_id,photographer_id,file_name,storage_path,media_type,mime_type,file_size,uploaded_at';
const PAGE = 400;

// Helper functions for validating request data, reading from the database, and handling errors
async function read(query, message) { const { data, error } = await query; if (error) { const e = new Error(message); e.cause = error; throw e; } return data; }
async function all(make, message) { let rows = []; for (let i = 0; ; i += PAGE) { const batch = await read(make().range(i, i + PAGE - 1), message) || []; rows.push(...batch); if (batch.length < PAGE) return rows; } }
function obj(v, keys) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail(400, 'INVALID_FIELDS', 'Unexpected request fields.'); }
function id(v) { if (typeof v !== 'string' || !UUID.test(v)) fail(400, 'INVALID_ID', 'Invalid identifier.'); return v; }
function str(v, max, required = false) { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(400, 'INVALID_TEXT', `Invalid text value (maximum ${max} characters).`); return v.trim(); }
function url(v) { if (v == null || v === '') return null; if (typeof v !== 'string' || v.length > 2048) fail(400, 'INVALID_URL', 'Invalid image URL.'); try { const u = new URL(v); if (u.protocol !== 'https:') throw Error(); return u.href; } catch { fail(400, 'INVALID_URL', 'Image URL must use HTTPS.'); } }
function slug(v) { if (typeof v !== 'string' || v.length > 100 || !(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).test(v) || RESERVED.includes(v)) fail(400, 'INVALID_SLUG', 'Use a valid non-reserved website slug.'); return v; }

// Helper function to validate the photographer's website settings, ensuring required fields are present and valid
function validateWebsite(body) {
    obj(body, ['slug', 'published', 'settings', 'about', 'about_id', 'featured_review_ids']); slug(body.slug); if (typeof body.published !== 'boolean') fail(400, 'INVALID_PUBLISHED', 'Invalid publication setting.'); obj(body.settings, WEBSITE_KEYS); const settings = {}; for (const [k, v] of Object.entries(body.settings)) { if (k.startsWith('show_')) { if (typeof v !== 'boolean') fail(400, 'INVALID_SETTING', `Invalid ${k}.`); } else if (k.endsWith('_colour')) { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) fail(400, 'INVALID_COLOUR', `Invalid ${k}.`); } else if (k.endsWith('_font')) { if (!FONTS.includes(v)) fail(400, 'INVALID_FONT', `Invalid ${k}.`); } else if (k === 'hero_image_url') { settings[k] = url(v); continue; } else str(v, k === 'hero_title' ? 150 : 2000); settings[k] = v; }
    obj(body.about, ['title', 'content', 'image_url']); const about = { title: str(body.about.title, 150) || 'About me', content: str(body.about.content, 10000), image_url: url(body.about.image_url) };
    if (body.about_id != null) id(body.about_id);
    if (!Array.isArray(body.featured_review_ids) || body.featured_review_ids.length > 3 || new Set(body.featured_review_ids).size !== body.featured_review_ids.length) fail(400, 'INVALID_REVIEWS', 'Choose up to three distinct reviews.'); body.featured_review_ids.forEach(id);
    return { slug: body.slug, published: body.published, settings, about, about_id: body.about_id || null, featured: body.featured_review_ids };
}

// Helper function to get the photographer's website settings, including profile, settings, about section, approved reviews, and featured review IDs
export async function getWebsite(db, userId) {
    const p = await resolvePhotographer(db, userId), pid = p.photographer_id;
    const [profile, settings, about, reviews, featured] = await Promise.all([
        read(db.from('photographer_profiles').select('photographer_id,business_name,slug,published').eq('photographer_id', pid).single(), 'Unable to load website profile.'),
        read(db.from('website_settings').select('*').eq('photographer_id', pid).maybeSingle(), 'Unable to load website settings.'),
        read(db.from('website_content').select('content_id,title,content,image_url').eq('photographer_id', pid).eq('section', 'about').order('display_order', { ascending: true }).order('created_at', { ascending: true }).limit(1).maybeSingle(), 'Unable to load about section.'),
        read(db.rpc('get_public_reviews', { p_photographer_id: pid }), 'Unable to load reviews.'),
        read(db.from('website_featured_reviews').select('review_id,display_order').eq('photographer_id', pid).order('display_order', { ascending: true }), 'Unable to load featured reviews.')]);
    return { profile, settings, about, approved_reviews: reviews || [], featured_review_ids: (featured || []).map(x => x.review_id) };
}

// Helper function to save the photographer's website settings, including profile, settings, about section, and featured review IDs
export async function saveWebsite(db, userId, body) {
    const b = validateWebsite(body), p = await resolvePhotographer(db, userId), pid = p.photographer_id;
    // Validate review IDs against the approved public-review result, not client-supplied claims.
    if (b.featured.length) { const reviews = await read(db.from('reviews').select('review_id').eq('photographer_id', pid).eq('status', 'approved').in('review_id', b.featured), 'Unable to verify reviews.'); const allowed = new Set((reviews || []).map(x => x.review_id)); if (b.featured.some(x => !allowed.has(x))) fail(400, 'INVALID_REVIEWS', 'Only approved reviews can be featured.'); }
    if (b.about_id) { const owned = await read(db.from('website_content').select('content_id').eq('content_id', b.about_id).eq('photographer_id', pid).eq('section', 'about').maybeSingle(), 'Unable to verify about section.'); if (!owned) fail(404, 'ABOUT_NOT_FOUND', 'About section not found.'); }
    // Slug preflight reduces partial saves caused by a conflicting slug. Unique DB constraint is authoritative.
    const conflict = await read(db.from('photographer_profiles').select('photographer_id').eq('slug', b.slug).neq('photographer_id', pid).maybeSingle(), 'Unable to verify website slug.'); if (conflict) fail(409, 'SLUG_TAKEN', 'That website slug is already taken.');
    await read(db.from('website_settings').upsert({ ...b.settings, photographer_id: pid }, { onConflict: 'photographer_id' }), 'Unable to save website settings.');
    await read(db.from('website_featured_reviews').delete().eq('photographer_id', pid), 'Unable to update featured reviews.');
    if (b.featured.length) await read(db.from('website_featured_reviews').insert(b.featured.map((review_id, i) => ({ photographer_id: pid, review_id, display_order: i + 1 }))), 'Unable to save featured reviews.');
    const content = { ...b.about, photographer_id: pid, section: 'about', published: true };
    const savedAbout = b.about_id ? await read(db.from('website_content').update(content).eq('content_id', b.about_id).eq('photographer_id', pid).select('content_id').single(), 'Unable to save about section.') : await read(db.from('website_content').insert(content).select('content_id').single(), 'Unable to create about section.');
    const profile = await read(db.from('photographer_profiles').update({ slug: b.slug, published: b.published }).eq('photographer_id', pid).eq('user_id', userId).select('photographer_id,business_name,slug,published').single(), 'Unable to publish website.'); return { profile, about_id: savedAbout.content_id };
}

// Helper function to list the photographer's portfolio items, including their IDs, titles, descriptions, media URLs, thumbnail URLs, categories, display orders, publication statuses, source media IDs, and timestamps
export async function listPortfolio(db, userId) { const p = await resolvePhotographer(db, userId); return { photographer_id: p.photographer_id, items: await all(() => db.from('portfolio_items').select(PORTFOLIO).eq('photographer_id', p.photographer_id).order('display_order', { ascending: true }).order('created_at', { ascending: false }), 'Unable to load portfolio.') }; }

// Helper function to get a specific portfolio item owned by the photographer, including its ID, title, description, media URL, thumbnail URL, category, display order, publication status, source media ID, and timestamps
export async function portfolioOptions(db, userId) {
    const p = await resolvePhotographer(db, userId), pid = p.photographer_id;
    const [galleries, media] = await Promise.all([all(() => db.from('galleries').select(GALLERY).eq('photographer_id', pid).order('created_at', { ascending: false }), 'Unable to load galleries.'), all(() => db.from('media').select(MEDIA).eq('photographer_id', pid).eq('media_type', 'image').order('uploaded_at', { ascending: false }), 'Unable to load media.')]); const ids = new Set(galleries.map(x => x.gallery_id)); return { photographer_id: pid, galleries, media: media.filter(x => ids.has(x.gallery_id)) };
}

// Helper function to validate the photographer's portfolio item, ensuring required fields are present and valid
function validatePortfolio(body) { obj(body, ['title', 'description', 'category', 'published', 'media_url', 'thumbnail_url', 'source_media_id']); const data = { title: str(body.title, 150, true), description: body.description == null ? null : str(body.description, 5000), category: body.category == null ? null : str(body.category, 100), published: body.published, media_url: url(body.media_url), thumbnail_url: url(body.thumbnail_url), source_media_id: id(body.source_media_id) }; if (typeof data.published !== 'boolean' || !data.media_url) fail(400, 'INVALID_PORTFOLIO', 'Portfolio image and publication setting are required.'); return data; }

// Helper function to create a new portfolio item for the photographer, validating the input and ensuring the source media belongs to the photographer
export async function createPortfolio(db, userId, body) {
    const p = await resolvePhotographer(db, userId), pid = p.photographer_id, v = validatePortfolio(body);
    const media = await read(db.from('media').select('media_id,gallery_id').eq('media_id', v.source_media_id).eq('photographer_id', pid).eq('media_type', 'image').maybeSingle(), 'Unable to verify source image.'); if (!media) fail(400, 'INVALID_SOURCE', 'Source image does not belong to this photographer.');
    const prefix = `/storage/v1/object/public/portfolio-media/${pid}/`; for (const value of [v.media_url, v.thumbnail_url]) if (value && !new URL(value).pathname.startsWith(prefix)) fail(400, 'INVALID_IMAGE_PATH', 'Portfolio image must be in your own portfolio-media folder.');
    const last = await read(db.from('portfolio_items').select('display_order').eq('photographer_id', pid).order('display_order', { ascending: false }).limit(1).maybeSingle(), 'Unable to find portfolio order.'); return read(db.from('portfolio_items').insert({ ...v, photographer_id: pid, display_order: last?.display_order != null ? Number(last.display_order) + 1 : 0 }).select(PORTFOLIO).single(), 'Unable to create portfolio item.');
}

// Helper function to get a specific portfolio item owned by the photographer, including its ID, title, description, media URL, thumbnail URL, category, display order, publication status, source media ID, and timestamps
async function ownedPortfolio(db, pid, itemId) { id(itemId); const item = await read(db.from('portfolio_items').select(PORTFOLIO).eq('portfolio_id', itemId).eq('photographer_id', pid).maybeSingle(), 'Unable to load portfolio item.'); if (!item) fail(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio item not found.'); return item; }

// Helper function to update an existing portfolio item for the photographer, validating the input and ensuring the photographer owns the item
export async function updatePortfolio(db, userId, itemId, body) { obj(body, ['published']); if (typeof body.published !== 'boolean') fail(400, 'INVALID_PUBLISHED', 'Invalid publication setting.'); const p = await resolvePhotographer(db, userId); await ownedPortfolio(db, p.photographer_id, itemId); return read(db.from('portfolio_items').update({ published: body.published }).eq('portfolio_id', itemId).eq('photographer_id', p.photographer_id).select(PORTFOLIO).single(), 'Unable to update portfolio item.'); }

// Helper function to delete a portfolio item owned by the photographer, ensuring the photographer owns the item before deletion
export async function deletePortfolio(db, userId, itemId) { const p = await resolvePhotographer(db, userId); await ownedPortfolio(db, p.photographer_id, itemId); await read(db.from('portfolio_items').delete().eq('portfolio_id', itemId).eq('photographer_id', p.photographer_id), 'Unable to delete portfolio item.'); return { deleted: true, portfolio_id: itemId }; }

// Helper function to reorder the photographer's portfolio items, validating the input and ensuring the authenticated user owns the items
export async function reorderPortfolio(db, userId, body) {
    obj(body, ['ids']); if (!Array.isArray(body.ids) || body.ids.length > 1000 || new Set(body.ids).size !== body.ids.length) fail(400, 'INVALID_ORDER', 'Invalid portfolio order.'); body.ids.forEach(id); const p = await resolvePhotographer(db, userId), pid = p.photographer_id; const existing = await all(() => db.from('portfolio_items').select('portfolio_id').eq('photographer_id', pid).order('portfolio_id', { ascending: true }), 'Unable to load portfolio order.'); if (existing.length !== body.ids.length || existing.some(x => !body.ids.includes(x.portfolio_id))) fail(409, 'STALE_ORDER', 'Portfolio items changed; reload before reordering.');
    // Existing UI uses a two-phase reorder to avoid a temporary uniqueness collision.
    for (let i = 0; i < body.ids.length; i++)await read(db.from('portfolio_items').update({ display_order: -(i + 1) }).eq('portfolio_id', body.ids[i]).eq('photographer_id', pid), 'Unable to prepare portfolio order.');
    for (let i = 0; i < body.ids.length; i++)await read(db.from('portfolio_items').update({ display_order: i }).eq('portfolio_id', body.ids[i]).eq('photographer_id', pid), 'Unable to save portfolio order.'); return { saved: true };
}
