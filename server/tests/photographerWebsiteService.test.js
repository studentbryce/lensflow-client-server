import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingRequestError } from '../src/services/bookingCreateService.js';
import { getWebsite,saveWebsite,listPortfolio,portfolioOptions,createPortfolio,updatePortfolio,deletePortfolio,reorderPortfolio } from '../src/services/photographerWebsiteService.js';
const P='11111111-1111-4111-8111-111111111111',U='22222222-2222-4222-8222-222222222222',I='33333333-3333-4333-8333-333333333333',M='44444444-4444-4444-8444-444444444444';
const good={slug:'my-studio',published:true,settings:{primary_colour:'#abcdef',show_about:true,heading_font:'georgia'},about:{title:'About',content:'Hello',image_url:''},about_id:null,featured_review_ids:[]};
function mock({role='photographer',items=[],media=[],galleries=[],profile=null,conflict=null}={}){
 const calls=[];
 const db={from(table){return new Query(table);},rpc(name){calls.push({table:name,op:'rpc'});return Promise.resolve({data:[],error:null});}};
 class Query{
  constructor(table){this.table=table;this.op='select';this.filters=[];this.payload=null;this.limitValue=null;}
  select(){return this;}eq(k,v){this.filters.push([k,v]);return this;}neq(k,v){this.filters.push(['neq_'+k,v]);return this;}order(){return this;}limit(n){this.limitValue=n;return this;}range(){return this;}
  upsert(v){this.op='upsert';this.payload=v;return this;}insert(v){this.op='insert';this.payload=v;return this;}update(v){this.op='update';this.payload=v;return this;}delete(){this.op='delete';return this;}
  single(){return this.then(x=>({data:Array.isArray(x.data)?x.data[0]??null:x.data,error:x.error}));}
  maybeSingle(){return this.single();}
  then(resolve,reject){calls.push({table:this.table,op:this.op,filters:this.filters,payload:this.payload});let data;
   if(this.table==='profiles')data={role};
   else if(this.table==='photographer_profiles')data=this.filters.some(([k])=>k.startsWith('neq_'))?conflict:(profile??{photographer_id:P,user_id:U,business_name:'Studio',slug:'my-studio',published:true});
   else if(this.table==='portfolio_items')data=this.op==='select'?items:(this.op==='update'?{portfolio_id:I,photographer_id:P,...this.payload}:this.op==='insert'?{portfolio_id:I,...this.payload}:null);
   else if(this.table==='media')data=media;
   else if(this.table==='galleries')data=galleries;
   else if(this.table==='website_content')data=this.op==='select'?null:{content_id:I};
   else if(this.table==='website_settings')data=this.op==='select'?null:{...this.payload};
   else if(this.table==='website_featured_reviews')data=[];
   else data=[];
   if(this.table==='portfolio_items'&&this.op==='select'&&this.limitValue===1)data=items[0]??null;
   return Promise.resolve({data,error:null}).then(resolve,reject);
  }
 }
 return {db,calls};
}
const code=(expected)=>e=>e instanceof BookingRequestError&&e.code===expected;
test('website rejects invalid slug',async()=>{const {db}=mock();await assert.rejects(saveWebsite(db,U,{...good,slug:'api'}),code('INVALID_SLUG'));});
test('website rejects cross-owner fields',async()=>{const {db}=mock();await assert.rejects(saveWebsite(db,U,{...good,photographer_id:P}),code('INVALID_FIELDS'));});
test('website rejects invalid colours',async()=>{const {db}=mock();await assert.rejects(saveWebsite(db,U,{...good,settings:{primary_colour:'red'}}),code('INVALID_COLOUR'));});
test('website rejects invalid fonts',async()=>{const {db}=mock();await assert.rejects(saveWebsite(db,U,{...good,settings:{body_font:'javascript'}}),code('INVALID_FONT'));});
test('website rejects insecure image URLs',async()=>{const {db}=mock();await assert.rejects(saveWebsite(db,U,{...good,about:{...good.about,image_url:'http://example.com'}}),code('INVALID_URL'));});
test('website rejects duplicate featured reviews',async()=>{const {db}=mock();await assert.rejects(saveWebsite(db,U,{...good,featured_review_ids:[I,I]}),code('INVALID_REVIEWS'));});
test('website rejects a conflicting slug before writes',async()=>{const {db,calls}=mock({conflict:{photographer_id:I}});await assert.rejects(saveWebsite(db,U,good),code('SLUG_TAKEN'));assert(!calls.some(c=>c.op==='insert'||c.op==='update'||c.op==='delete'));});
test('client cannot retrieve website management data',async()=>{const {db}=mock({role:'client'});await assert.rejects(getWebsite(db,U),code('PHOTOGRAPHER_REQUIRED'));});
test('portfolio list is filtered to authenticated photographer',async()=>{const {db,calls}=mock({items:[{portfolio_id:I}]});const result=await listPortfolio(db,U);assert.equal(result.items.length,1);assert(calls.some(c=>c.table==='portfolio_items'&&c.filters.some(([k,v])=>k==='photographer_id'&&v===P)));});
test('portfolio options return owned gallery media',async()=>{const {db}=mock({galleries:[{gallery_id:I}],media:[{gallery_id:I,media_id:M}]});const result=await portfolioOptions(db,U);assert.equal(result.media.length,1);});
test('portfolio creation rejects an unowned source image',async()=>{const {db}=mock();await assert.rejects(createPortfolio(db,U,{title:'A',description:null,category:null,published:true,media_url:`https://x.test/storage/v1/object/public/portfolio-media/${P}/portfolio/a.jpg`,thumbnail_url:null,source_media_id:M}),code('INVALID_SOURCE'));});
test('portfolio creation rejects unexpected owner field',async()=>{const {db}=mock();await assert.rejects(createPortfolio(db,U,{photographer_id:P}),code('INVALID_FIELDS'));});
test('portfolio update accepts only published flag',async()=>{const {db}=mock({items:[{portfolio_id:I}]});await assert.rejects(updatePortfolio(db,U,I,{title:'Hacked'}),code('INVALID_FIELDS'));});
test('portfolio delete refuses missing item',async()=>{const {db}=mock();await assert.rejects(deletePortfolio(db,U,I),code('PORTFOLIO_NOT_FOUND'));});
test('reorder rejects repeated identifiers',async()=>{const {db}=mock();await assert.rejects(reorderPortfolio(db,U,{ids:[I,I]}),code('INVALID_ORDER'));});
test('reorder refuses stale item list',async()=>{const {db}=mock({items:[{portfolio_id:I}]});await assert.rejects(reorderPortfolio(db,U,{ids:[]}),code('STALE_ORDER'));});
test('website management loads profile and settings using authenticated owner',async()=>{const {db,calls}=mock();const result=await getWebsite(db,U);assert.equal(result.profile.photographer_id,P);assert(calls.some(c=>c.table==='website_settings'&&c.filters.some(([k,v])=>k==='photographer_id'&&v===P)));});
test('website save writes owner-scoped settings and about content',async()=>{const {db,calls}=mock();const result=await saveWebsite(db,U,good);assert.equal(result.about_id,I);assert(calls.some(c=>c.table==='website_settings'&&c.op==='upsert'&&c.payload.photographer_id===P));assert(calls.some(c=>c.table==='photographer_profiles'&&c.op==='update'&&c.filters.some(([k,v])=>k==='user_id'&&v===U)));});
test('portfolio create accepts owned source image and appends display order',async()=>{const {db,calls}=mock({media:[{media_id:M,gallery_id:I}],items:[{portfolio_id:I,display_order:2}]});const result=await createPortfolio(db,U,{title:'Portrait',description:'',category:'',published:true,media_url:`https://example.test/storage/v1/object/public/portfolio-media/${P}/portfolio/a.jpg`,thumbnail_url:null,source_media_id:M});assert.equal(result.display_order,3);assert(calls.some(c=>c.table==='portfolio_items'&&c.op==='insert'&&c.payload.photographer_id===P));});
