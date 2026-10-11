import test from 'node:test';
import assert from 'node:assert/strict';
import { listClientGalleries, getClientGallery, getClientGalleryDownload, ClientGalleryError } from '../src/services/clientGalleriesService.js';
const G = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const gallery = { gallery_id: G, booking_id: 'booking1', client_id: 'client1', is_published: true, allow_downloads: true };
const item = { media_id: M, gallery_id: G, storage_path: 'private/asset.jpg', thumbnail_path: 'private/thumb.jpg', media_type: 'image', file_name: 'asset.jpg', is_downloadable: true };
function mockDb(overrides={}) {
  const calls = [];
  const values = {
    clients: { data: { client_id: 'client1' }, error: null },
    galleries: { data: gallery, error: null },
    bookings: { data: [{ booking_id: 'booking1' }], error: null },
    media: { data: [item], error: null },
    ...overrides,
  };
  const counts = {};
  function result(table) {
    const entry = values[table];
    if (typeof entry === 'function') return entry();
    if (Array.isArray(entry)) { const i=counts[table]??0; counts[table]=i+1; return entry[Math.min(i,entry.length-1)]; }
    return entry;
  }
  const storage = { from(bucket) { calls.push(['bucket', bucket]); return { createSignedUrl(path, ttl) {
    calls.push(['sign', path, ttl]);
    if (overrides.signError) return Promise.resolve({ data: null, error: new Error('storage denied') });
    return Promise.resolve({ data: { signedUrl: 'https://example.invalid/signed' }, error: null });
  } }; } };
  return { calls, storage, from(table) {
    calls.push(['from', table]);
    const q = {
      select(fields) { calls.push(['select', table, fields]); return this; },
      eq(field, value) { calls.push(['eq', table, field, value]); return this; },
      in(field, value) { calls.push(['in', table, field, value]); return this; },
      order(field, options) { calls.push(['order', table, field, options]); return this; },
      range(start, end) { calls.push(['range', table, start, end]); return this; },
      maybeSingle() { return Promise.resolve(result(table)); },
      then(resolve, reject) { return Promise.resolve(result(table)).then(resolve, reject); },
    };
    return q;
  } };
}
const has = (db, type, table, field, value) => db.calls.some(c=>c[0]===type && c[1]===table && c[2]===field && (value===undefined || c[3]===value));
test('list uses JWT identity and client-scoped published gallery filters', async()=>{
  const db=mockDb({ galleries: { data: [gallery], error:null } });
  const data=await listClientGalleries(db,'user1');
  assert.equal(data.galleries.length,1);
  assert.ok(has(db,'eq','clients','user_id','user1'));
  assert.ok(has(db,'eq','galleries','client_id','client1'));
  assert.ok(has(db,'eq','galleries','is_published',true));
  assert.ok(has(db,'in','media','gallery_id'));
  assert.equal(data.media[0].storage_path,undefined);
  assert.equal(data.galleries[0].thumbnail.url,'https://example.invalid/signed');
});
test('list with no galleries never reads media or signs storage URLs',async()=>{
  const db=mockDb({ galleries:{data:[],error:null} });
  assert.deepEqual(await listClientGalleries(db,'user1'),{galleries:[],media:[]});
  assert.ok(!db.calls.some(c=>c[1]==='media' || c[0]==='sign'));
});
test('list tolerates thumbnail signing failures',async()=>{
  const db=mockDb({ galleries:{data:[gallery],error:null},signError:true });
  assert.equal((await listClientGalleries(db,'user1')).galleries[0].thumbnail,null);
});
test('list paginates galleries and media, preventing default 1000-row truncation',async()=>{
  const galleries=Array.from({length:250},(_,i)=>({...gallery,gallery_id:`id-${i}`,booking_id:null}));
  const db=mockDb({ galleries:[{data:galleries,error:null},{data:[],error:null}],media:{data:[],error:null} });
  assert.equal((await listClientGalleries(db,'user1')).galleries.length,250);
  assert.equal(db.calls.filter(c=>c[0]==='range'&&c[1]==='galleries').length,2);
});
test('invalid gallery ID is rejected before database lookup',async()=>{
  const db=mockDb();
  await assert.rejects(()=>getClientGallery(db,'user1','../../x'),e=>e.status===400);
  assert.ok(!db.calls.some(c=>c[1]==='galleries'));
});
test('detail only queries owned published gallery and returns signed previews',async()=>{
  const db=mockDb(); const data=await getClientGallery(db,'user1',G);
  assert.equal(data.gallery.gallery_id,G);
  assert.equal(data.media[0].previewUrl,'https://example.invalid/signed');
  assert.equal(data.media[0].storage_path,undefined);
  assert.ok(has(db,'eq','galleries','client_id','client1'));
  assert.ok(has(db,'eq','galleries','is_published',true));
  assert.ok(has(db,'eq','media','gallery_id',G));
  assert.ok(db.calls.some(c=>c[0]==='sign'&&c[1]==='private/thumb.jpg'&&c[2]===3600));
});
test('foreign, unpaid or unpublished gallery is hidden with 404',async()=>{
  const db=mockDb({ galleries:{data:null,error:null} });
  await assert.rejects(()=>getClientGallery(db,'user1',G),e=>e.status===404);
  assert.ok(!db.calls.some(c=>c[1]==='media'||c[0]==='sign'));
});
test('photographer without client account gets 403',async()=>{
  const db=mockDb({ clients:{data:null,error:null} });
  await assert.rejects(()=>listClientGalleries(db,'photographer'),e=>e.status===403);
  assert.ok(!db.calls.some(c=>c[1]==='galleries'));
});
test('missing user is rejected before DB queries',async()=>{
  const db=mockDb();
  await assert.rejects(()=>listClientGalleries(db,null),e=>e.status===401);
  assert.equal(db.calls.length,0);
});
test('download signs server-read storage path for owned media with short TTL',async()=>{
  const db=mockDb({media:{data:item,error:null}});
  const data=await getClientGalleryDownload(db,'user1',G,M);
  assert.equal(data.fileName,'asset.jpg');
  assert.equal(data.url,'https://example.invalid/signed');
  assert.ok(has(db,'eq','media','media_id',M));
  assert.ok(has(db,'eq','media','gallery_id',G));
  assert.ok(db.calls.some(c=>c[0]==='sign'&&c[1]==='private/asset.jpg'&&c[2]===60));
});
test('download blocked when gallery disallows downloads before media lookup',async()=>{
  const db=mockDb({galleries:{data:{...gallery,allow_downloads:false},error:null}});
  await assert.rejects(()=>getClientGalleryDownload(db,'user1',G,M),e=>e.status===403&&e.code==='DOWNLOADS_DISABLED');
  assert.ok(!db.calls.some(c=>c[1]==='media'||c[0]==='sign'));
});
test('download blocked when individual media disallows downloads',async()=>{
  const db=mockDb({media:{data:{...item,is_downloadable:false},error:null}});
  await assert.rejects(()=>getClientGalleryDownload(db,'user1',G,M),e=>e.status===403);
  assert.ok(!db.calls.some(c=>c[0]==='sign'));
});
test('download 404 for missing or foreign media',async()=>{
  const db=mockDb({media:{data:null,error:null}});
  await assert.rejects(()=>getClientGalleryDownload(db,'user1',G,M),e=>e.status===404);
  assert.ok(!db.calls.some(c=>c[0]==='sign'));
});
test('download 404 for hidden or unpaid gallery',async()=>{
  const db=mockDb({galleries:{data:null,error:null}});
  await assert.rejects(()=>getClientGalleryDownload(db,'user1',G,M),e=>e.status===404);
  assert.ok(!db.calls.some(c=>c[0]==='sign'));
});
test('invalid media ID is rejected before database access',async()=>{
  const db=mockDb();
  await assert.rejects(()=>getClientGalleryDownload(db,'user1',G,'bad-id'),e=>e.status===400);
  assert.equal(db.calls.length,0);
});
test('storage signing failure does not leak private details',async()=>{
  const db=mockDb({media:{data:item,error:null},signError:true});
  await assert.rejects(()=>getClientGalleryDownload(db,'user1',G,M),e=>e.message==='Unable to load download link.');
});
test('database failure does not leak internal error message',async()=>{
  const db=mockDb({galleries:{data:null,error:{message:'secret SQL'}}});
  await assert.rejects(()=>getClientGallery(db,'user1',G),e=>e.message==='Unable to load gallery.');
});
