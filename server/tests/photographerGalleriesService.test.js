import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingRequestError } from '../src/services/bookingCreateService.js';
import { galleryChanges, validateMedia, listPhotographerGalleries, getPhotographerGalleryOptions, getPhotographerGallery, createPhotographerGallery, updatePhotographerGallery, createPhotographerGalleryMedia, deletePhotographerGalleryMedia, deletePhotographerGallery } from '../src/services/photographerGalleriesService.js';
const P='11111111-1111-4111-8111-111111111111';
const G='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const B='44444444-4444-4444-8444-444444444444';
const M='55555555-5555-4555-8555-555555555555';
const U='66666666-6666-4666-8666-666666666666';
const good={client_id:C,booking_id:B,name:' Wedding ',description:' Hi ',is_published:false,allow_downloads:true};
const file={file_name:'a.jpg',storage_path:`${P}/${G}/file.jpg`,media_type:'image',mime_type:'image/jpeg',file_size:2000,is_downloadable:true};
function rejects(fn,code){assert.throws(fn,e=>e instanceof BookingRequestError && e.code===code);}
function dbMock(tables={}) {
  const calls=[];
  const db={from(name){return new Query(name);}};
  class Query {
    constructor(name){this.name=name;this.operation='select';this.filters=[];this.data=undefined;}
    select(){return this;}
    eq(k,v){this.filters.push([k,v]);return this;}
    in(k,v){this.filters.push([k,v]);return this;}
    order(){return this;}
    range(){return this;}
    maybeSingle(){return this;}
    single(){return this;}
    insert(data){this.operation='insert';this.data=data;return this;}
    update(data){this.operation='update';this.data=data;return this;}
    delete(){this.operation='delete';return this;}
    then(ok,bad){
      calls.push({table:this.name,op:this.operation,filters:this.filters,data:this.data});
      const source=tables[this.name];
      let result=typeof source==='function'?source(this):source;
      if (result===undefined)result=[];
      const promise=Promise.resolve({data:result,error:null});
      return promise.then(ok,bad);
    }
  }
  return {db,calls};
}
function context(overrides={}){
  return dbMock({profiles:{role:'photographer'},photographer_profiles:{photographer_id:P,user_id:U},galleries:[],clients:[],bookings:[],media:[],...overrides});
}
test('valid gallery input is trimmed',()=>assert.deepEqual(galleryChanges(good,true),{name:'Wedding',description:'Hi',is_published:false,allow_downloads:true}));
test('gallery name required',()=>rejects(()=>galleryChanges({...good,name:' '},true),'INVALID_NAME'));
test('gallery name length enforced',()=>rejects(()=>galleryChanges({...good,name:'x'.repeat(151)},true),'INVALID_NAME'));
test('description length enforced',()=>rejects(()=>galleryChanges({...good,description:'x'.repeat(2001)},true),'INVALID_DESCRIPTION'));
test('unexpected ownership field rejected',()=>rejects(()=>galleryChanges({...good,photographer_id:P},true),'INVALID_FIELDS'));
test('invalid client ID rejected',()=>rejects(()=>galleryChanges({...good,client_id:'no'},true),'INVALID_CLIENT'));
test('gallery booking relationship cannot be edited',()=>rejects(()=>galleryChanges({booking_id:B}), 'IMMUTABLE_RELATION'));
test('invalid publication flag rejected',()=>rejects(()=>galleryChanges({is_published:'true'}),'INVALID_SETTING'));
test('empty gallery update rejected',()=>rejects(()=>galleryChanges({}),'EMPTY_UPDATE'));
test('valid media metadata is accepted',()=>assert.equal(validateMedia(file,P,G).storage_path,file.storage_path));
test('cross-photographer media path rejected',()=>rejects(()=>validateMedia({...file,storage_path:`${U}/${G}/file.jpg`},P,G),'INVALID_PATH'));
test('path traversal rejected',()=>rejects(()=>validateMedia({...file,storage_path:`${P}/${G}/../file.jpg`},P,G),'INVALID_PATH'));
test('unsupported mime rejected',()=>rejects(()=>validateMedia({...file,mime_type:'application/pdf'},P,G),'INVALID_TYPE'));
test('oversize image rejected',()=>rejects(()=>validateMedia({...file,file_size:26*1024*1024},P,G),'INVALID_SIZE'));
test('untrusted ownership field on media rejected',()=>rejects(()=>validateMedia({...file,photographer_id:P},P,G),'INVALID_FIELDS'));
test('client account cannot list galleries',async()=>{const {db}=context({profiles:{role:'client'}});await assert.rejects(listPhotographerGalleries(db,U),e=>e.code==='PHOTOGRAPHER_REQUIRED');});
test('list returns owned gallery data and profile lookup',async()=>{const {db,calls}=context({galleries:[{gallery_id:G}],clients:[{client_id:C,user_id:U}],bookings:[{booking_id:B}],media:[{gallery_id:G,media_id:M}],profiles:q=>q.filters.some(([k])=>k==='user_id'&&q.filters.some(([,v])=>Array.isArray(v)))?[{user_id:U,first_name:'A'}]:{role:'photographer'}});const data=await listPhotographerGalleries(db,U);assert.equal(data.galleries.length,1);assert.equal(data.profiles.length,1);assert(calls.filter(c=>['galleries','clients','bookings','media'].includes(c.table)).every(c=>c.filters.some(([k,v])=>k==='photographer_id'&&v===P)));});
test('gallery options contain existing booking links',async()=>{const {db}=context({galleries:[{gallery_id:G,booking_id:B,client_id:C,name:'G'}]});const data=await getPhotographerGalleryOptions(db,U);assert.equal(data.existing_galleries[0].booking_id,B);});
test('missing gallery returns 404',async()=>{const {db}=context({galleries:null});await assert.rejects(getPhotographerGallery(db,U,G),e=>e.code==='GALLERY_NOT_FOUND');});
test('create verifies booking belongs to client',async()=>{const {db}=context({clients:{client_id:C},bookings:{booking_id:B,client_id:U}});await assert.rejects(createPhotographerGallery(db,U,good),e=>e.code==='INVALID_BOOKING');});
test('create rejects duplicate booking gallery',async()=>{const {db}=context({clients:{client_id:C},bookings:{booking_id:B,client_id:C},galleries:{gallery_id:G}});await assert.rejects(createPhotographerGallery(db,U,good),e=>e.code==='GALLERY_EXISTS');});
test('update applies only permitted gallery changes',async()=>{const {db,calls}=context({galleries:{gallery_id:G}});await updatePhotographerGallery(db,U,G,{is_published:true});const c=calls.find(x=>x.op==='update');assert.deepEqual(c.data,{is_published:true});assert(c.filters.some(([k,v])=>k==='photographer_id'&&v===P));});
test('media creation checks gallery ownership first',async()=>{const {db}=context({galleries:null});await assert.rejects(createPhotographerGalleryMedia(db,U,G,file),e=>e.code==='GALLERY_NOT_FOUND');});
test('media creation rejects duplicate storage path',async()=>{const {db}=context({galleries:{gallery_id:G},media:{media_id:M}});await assert.rejects(createPhotographerGalleryMedia(db,U,G,file),e=>e.code==='MEDIA_EXISTS');});
test('media deletion verifies gallery and media ownership',async()=>{const {db,calls}=context({galleries:{gallery_id:G},media:{media_id:M}});await deletePhotographerGalleryMedia(db,U,G,M);assert(calls.some(c=>c.table==='media'&&c.op==='delete'&&c.filters.some(([k,v])=>k==='photographer_id'&&v===P)));});
test('gallery deletion verifies ownership and deletes media before gallery',async()=>{const {db,calls}=context({galleries:{gallery_id:G}});await deletePhotographerGallery(db,U,G);const deletes=calls.filter(c=>c.op==='delete');assert.deepEqual(deletes.map(c=>c.table),['media','galleries']);});
