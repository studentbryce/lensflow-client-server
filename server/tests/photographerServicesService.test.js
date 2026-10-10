import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateServiceId, validateServiceBody, resolveServiceImageUrl,
  listPhotographerServices, getPhotographerServicesContext, getPhotographerService,
  createPhotographerService, updatePhotographerService,
} from '../src/services/photographerServicesService.js';

const user = 'af6d3925-8364-4c0c-83a8-8f7b6dd4b8a1';
const photographer = 'a0121c34-3456-4e21-83ac-994e9d1f08a7';
const otherPhotographer = 'b0121c34-3456-4e21-83ac-994e9d1f08a7';
const serviceId = '1e09876b-1ad2-4fd5-9143-b71cb99b7d23';
const imageId = '5ac43c41-338a-4e5e-9f91-1747d19325f3';
const imagePath = `${photographer}/services/${imageId}.jpg`;
const original = { service_id:serviceId, photographer_id:photographer, name:'Portrait', description:null, price:200, duration_minutes:60, deposit_amount:50, image_url:null, is_active:true, created_at:'2026-10-01', updated_at:'2026-10-01' };
const body = { name:' Portrait Session ', description:' Hello ', price:200.01, duration_minutes:60, deposit_amount:50.01, is_active:true, image_path:null };

function mockDb({ role='photographer', photographerId=photographer, services=[original], errors={} }={}) {
  const data = { services:structuredClone(services) };
  const calls = [];
  const db = {
    calls, data,
    storage: { from(bucket) { calls.push({table:'storage',bucket}); return { getPublicUrl(path) { return {data:{publicUrl:`https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`}}; } }; } },
    from(table) {
      const filters = []; let order = []; let page = null; let mutation = null; let insert = null;
      const q = {
        select(fields) { calls.push({table, op:'select', fields}); return this; },
        eq(key,value) { calls.push({table,op:'eq',key,value}); filters.push(row=>row[key]===value); return this; },
        order(key,{ascending=true}={}) { order.push({key,ascending}); return this; },
        range(start,end) { page=[start,end]; return this; },
        insert(values) { calls.push({table,op:'insert',values}); insert=values; return this; },
        update(values) { calls.push({table,op:'update',values}); mutation=values; return this; },
        maybeSingle() {
          if (table==='profiles') return Promise.resolve({data:{role},error:errors[table]??null});
          if (table==='photographer_profiles') return Promise.resolve({data:photographerId ? {photographer_id:photographerId} : null,error:errors[table]??null});
          return this.then(x=>({data:x.data[0]??null,error:x.error}));
        },
        single() { return this.then(x=>({data:x.data[0]??null,error:x.error})); },
        then(resolve,reject) {
          let rows = (data[table]??[]).filter(row=>filters.every(fn=>fn(row)));
          if (insert) { const row = {service_id:serviceId,...insert}; data[table].push(row); rows=[row]; }
          if (mutation) for (const row of rows) Object.assign(row,mutation);
          for (const {key,ascending} of order.reverse()) rows.sort((a,b)=>ascending ? String(a[key]??'').localeCompare(String(b[key]??'')) : String(b[key]??'').localeCompare(String(a[key]??'')));
          if (page) rows=rows.slice(page[0],page[1]+1);
          return Promise.resolve({data:rows,error:errors[table]??null}).then(resolve,reject);
        },
      };
      return q;
    },
  };
  return db;
}
const bad = (fn,code=400)=>assert.throws(fn,e=>e.status===code);

test('UUID validation rejects malformed service IDs',()=>{
  assert.equal(validateServiceId(serviceId),serviceId);
  for(const value of [null,'','not-a-uuid','../../../etc']) bad(()=>validateServiceId(value));
});
test('service body trims text and accepts valid monetary amounts',()=>{
  assert.deepEqual(validateServiceBody(body,{create:true}),{name:'Portrait Session',description:'Hello',price:200.01,duration_minutes:60,deposit_amount:50.01,is_active:true,image_path:null});
});
test('service body rejects owner injection, role changes and unknown fields',()=>{
  for(const value of [{...body,photographer_id:otherPhotographer},{...body,service_id:serviceId},{...body,user_id:user},{...body,role:'photographer'}, {}, null, []]) bad(()=>validateServiceBody(value,{create:true}));
});
test('service body requires mandatory create fields',()=>bad(()=>validateServiceBody({name:'Test'},{create:true})));
test('service name, price and duration are validated',()=>{
  for(const value of [{...body,name:' '},{...body,name:'x'.repeat(151)},{...body,price:-1},{...body,price:'200'},{...body,price:0.001},{...body,duration_minutes:0},{...body,duration_minutes:1.5},{...body,duration_minutes:2000},{...body,is_active:'true'},{...body,deposit_amount:250}]) bad(()=>validateServiceBody(value,{create:true}));
});
test('image paths must be scoped to photographer and service-media',()=>{
  const db=mockDb();
  assert.match(resolveServiceImageUrl(db,photographer,imagePath),/service-media/);
  assert.equal(resolveServiceImageUrl(db,photographer,null),null);
  for(const path of [`${otherPhotographer}/services/${imageId}.jpg`, `${photographer}/../${imageId}.jpg`,`${photographer}/services/a.svg`, `${photographer}/services/${imageId}xjpg`, 'https://evil.example/test.jpg']) bad(()=>resolveServiceImageUrl(db,photographer,path));
});
test('client-role account cannot list services',async()=>{
  const db=mockDb({role:'client'});
  await assert.rejects(()=>listPhotographerServices(db,user),e=>e.status===403);
  assert.equal(db.calls.some(c=>c.table==='services'),false);
});
test('client-role account cannot create services',async()=>{
  const db=mockDb({role:'client'});
  await assert.rejects(()=>createPhotographerService(db,user,body),e=>e.status===403);
  assert.equal(db.calls.some(c=>c.op==='insert'),false);
});
test('client-role account cannot update services',async()=>{
  const db=mockDb({role:'client'});
  await assert.rejects(()=>updatePhotographerService(db,user,serviceId,{name:'Changed'}),e=>e.status===403);
  assert.equal(db.calls.some(c=>c.op==='update'),false);
});
test('services list is scoped to photographer and retains inactive services',async()=>{
  const db=mockDb({services:[original,{...original,service_id:'a0121c34-3456-4e21-83ac-994e9d1f08a7',is_active:false},{...original,service_id:'b0121c34-3456-4e21-83ac-994e9d1f08a7',photographer_id:otherPhotographer}]});
  const result=await listPhotographerServices(db,user);
  assert.equal(result.length,2);
  assert.ok(result.some(x=>x.is_active===false));
});
test('services list pages beyond 500 rows',async()=>{
  const services=Array.from({length:502},(_,i)=>({...original,service_id:`${String(i).padStart(8,'0')}-3456-4e21-83ac-994e9d1f08a7`,created_at:'2026-10-01'}));
  assert.equal((await listPhotographerServices(mockDb({services}),user)).length,502);
});
test('photographer context returns authenticated owner',async()=>{
  assert.deepEqual(await getPhotographerServicesContext(mockDb(),user),{photographer_id:photographer});
});
test('service detail returns owned record and hides others',async()=>{
  assert.equal((await getPhotographerService(mockDb(),user,serviceId)).name,'Portrait');
  await assert.rejects(()=>getPhotographerService(mockDb({services:[{...original,photographer_id:otherPhotographer}]}),user,serviceId),e=>e.status===404);
});
test('create uses authenticated owner, not caller owner',async()=>{
  const db=mockDb(); const row=await createPhotographerService(db,user,body);
  assert.equal(row.photographer_id,photographer);
  assert.equal(row.image_url,null);
  assert.equal(db.calls.find(c=>c.op==='insert').values.photographer_id,photographer);
});
test('create links a valid uploaded image path',async()=>{
  const row=await createPhotographerService(mockDb(),user,{...body,image_path:imagePath});
  assert.match(row.image_url,/service-media/);
});
test('update retains old image if image_path omitted',async()=>{
  const db=mockDb({services:[{...original,image_url:'https://example.com/existing.jpg'}]});
  const row=await updatePhotographerService(db,user,serviceId,{name:'Updated'});
  assert.equal(row.image_url,'https://example.com/existing.jpg');
  assert.equal(row.name,'Updated');
  assert.ok(!('image_url' in db.calls.find(c=>c.op==='update').values));
});
test('update can remove image explicitly',async()=>{
  const db=mockDb({services:[{...original,image_url:'https://example.com/existing.jpg'}]});
  assert.equal((await updatePhotographerService(db,user,serviceId,{image_path:null})).image_url,null);
});
test('update validates deposit against persisted price',async()=>{
  await assert.rejects(()=>updatePhotographerService(mockDb(),user,serviceId,{deposit_amount:201}),e=>e.status===400);
});
test('update rejects non-owned service without mutation',async()=>{
  const db=mockDb({services:[{...original,photographer_id:otherPhotographer}]});
  await assert.rejects(()=>updatePhotographerService(db,user,serviceId,{name:'Changed'}),e=>e.status===404);
  assert.equal(db.calls.some(c=>c.op==='update'),false);
});
test('service database failures are propagated',async()=>{
  await assert.rejects(()=>listPhotographerServices(mockDb({errors:{services:{code:'FAIL'}}}),user),/Unable to load services/);
});
