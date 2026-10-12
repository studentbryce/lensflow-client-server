/** Public photographer site: published content only, queried under Supabase anon RLS. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROFILE = 'photographer_id,business_name,description,email,phone';
const SETTINGS = 'primary_colour,secondary_colour,heading_font,body_font,navigation_font,hero_title,hero_description,hero_image_url,show_about,show_services,show_portfolio,show_reviews,show_contact';
const CONTENT = 'content_id,title,content,image_url';
const PORTFOLIO = 'portfolio_id,title,description,media_url,thumbnail_url';
const SERVICES = 'service_id,name,description,price,duration_minutes,image_url';

export class PublicWebsiteError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function failure(label, cause) { const error = new Error(`Unable to load ${label}.`); error.cause = cause; return error; }
async function get(query, label) {
  const { data, error } = await query;
  if (error) throw failure(label, error);
  return data;
}
export function validateSlug(slug) {
  if (typeof slug !== 'string' || slug.length > 100 || !SLUG.test(slug)) {
    throw new PublicWebsiteError(400, 'INVALID_SLUG', 'A valid photographer slug is required.');
  }
  return slug;
}
export async function listPublicPhotographers(db) {
  const rows = await get(db.from('photographer_profiles')
    .select('photographer_id,business_name').eq('published', true)
    .order('business_name', { ascending: true }).limit(500), 'photographers');
  return rows ?? [];
}
export async function loadPublicWebsite(db, slug) {
  validateSlug(slug);
  const profile = await get(db.from('photographer_profiles').select(PROFILE)
    .eq('slug', slug).eq('published', true).maybeSingle(), 'photographer');
  if (!profile) throw new PublicWebsiteError(404, 'WEBSITE_NOT_FOUND', 'Photographer website not found.');
  const photographerId = profile.photographer_id;
  const queries = [
    db.from('website_settings').select(SETTINGS).eq('photographer_id', photographerId).maybeSingle(),
    db.from('website_content').select(CONTENT).eq('photographer_id', photographerId)
      .eq('section', 'about').eq('published', true)
      .order('display_order', { ascending: true }).order('created_at', { ascending: true }).limit(100),
    db.from('portfolio_items').select(PORTFOLIO).eq('photographer_id', photographerId)
      .eq('published', true).order('display_order', { ascending: true }).limit(250),
    db.rpc('get_featured_reviews', { p_photographer_id: photographerId }),
    db.rpc('get_public_reviews', { p_photographer_id: photographerId }),
    db.from('services').select(SERVICES).eq('photographer_id', photographerId)
      .eq('is_active', true).order('name', { ascending: true }).limit(250),
  ];
  const results = await Promise.all(queries);
  const labels = ['website settings', 'about content', 'portfolio', 'featured reviews', 'reviews', 'services'];
  results.forEach((result, i) => { if (result.error) throw failure(labels[i], result.error); });
  return {
    profile, settings: results[0].data ?? {}, about: results[1].data ?? [],
    portfolio: results[2].data ?? [], reviews: results[3].data ?? [],
    allReviews: results[4].data ?? [], services: results[5].data ?? [],
  };
}
