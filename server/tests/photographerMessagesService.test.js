import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhotographerMessages, ensurePhotographerConversation, sendPhotographerMessage,
  markPhotographerMessagesRead, PhotographerMessageError } from '../src/services/photographerMessagesService.js';
import { getUnreadMessageCount } from '../src/services/unreadMessagesService.js';

const UID = 'user-photographer';
const PID = 'photographer-id';
const CID = '11111111-1111-4111-8111-111111111111';
const CONVID = '22222222-2222-4222-8222-222222222222';
const client = { client_id: CID, user_id: 'client-user', photographer_id: PID };
const conv = { conversation_id: CONVID, client_id: CID, photographer_id: PID, updated_at: '2026-10-11T00:00:00Z' };
const incoming = { message_id: 'm1', conversation_id: CONVID, sender_id: 'client-user', message: 'Hello', is_read: false };
function mock(overrides={}) {
 const calls=[];
 const responses={ profiles: {data:{role:'photographer'},error:null}, photographer_profiles:{data:{photographer_id:PID},error:null},
   clients:{data:[client],error:null}, conversations:{data:[conv],error:null},
   messages:{data:[incoming],error:null}, ...overrides };
 const counts={};
 const response=table=> {let r=responses[table];const n=counts[table]??0;counts[table]=n+1;return Array.isArray(r)?r[Math.min(n,r.length-1)]:r;};
 return {calls,from(table){calls.push(['from',table]);const q={
  select(...a){calls.push(['select',table,...a]);return this;},
  eq(...a){calls.push(['eq',table,...a]);return this;},
  neq(...a){calls.push(['neq',table,...a]);return this;},
  in(...a){calls.push(['in',table,...a]);return this;},
  order(...a){calls.push(['order',table,...a]);return this;},
  range(...a){calls.push(['range',table,...a]);return this;},
  insert(...a){calls.push(['insert',table,...a]);return this;},
  update(...a){calls.push(['update',table,...a]);return this;},
  maybeSingle(){let r=response(table);return Promise.resolve(r?.data && Array.isArray(r.data)?{data:r.data[0]??null,error:r.error}:r);},
  single(){let r=response(table);return Promise.resolve(r?.data && Array.isArray(r.data)?{data:r.data[0]??null,error:r.error}:r);},
  then(ok,bad){return Promise.resolve(response(table)).then(ok,bad);}
 };return q;}};
}
const has=(db,type,table,key,val)=>db.calls.some(c=>c[0]===type&&c[1]===table&&(key===undefined||c[2]===key)&&(val===undefined||c[3]===val));
test('loads only photographer-owned conversations with enriched client and unread messages',async()=>{
 const db=mock({profiles:[{data:{role:'photographer'}},{data:[{user_id:'client-user',first_name:'Jane',last_name:'Doe',email:'j@example.com'}]}]});
 const result=await getPhotographerMessages(db,UID);
 assert.equal(result.currentUserId,UID);assert.equal(result.photographerId,PID);
 assert.equal(result.conversations[0].unreadCount,1);
 assert.equal(result.conversations[0].client.first_name,'Jane');
 assert.ok(has(db,'eq','conversations','photographer_id',PID));
 assert.ok(has(db,'in','messages','conversation_id'));
});
test('empty client and conversation lists return empty response',async()=>{
 const db=mock({clients:{data:[]},conversations:{data:[]}});const r=await getPhotographerMessages(db,UID);
 assert.deepEqual(r.clients,[]);assert.deepEqual(r.conversations,[]);
 assert.ok(!db.calls.some(c=>c[1]==='messages'));
});
test('client role denied before conversations query',async()=>{
 const db=mock({profiles:{data:{role:'client'}}});
 await assert.rejects(()=>getPhotographerMessages(db,UID),e=>e.status===403);
 assert.ok(!db.calls.some(c=>c[1]==='conversations'));
});
test('missing auth rejected before database queries',async()=>{
 const db=mock();await assert.rejects(()=>getPhotographerMessages(db,''),e=>e.status===401);
 assert.equal(db.calls.length,0);
});
test('existing conversation reused, no insert',async()=>{
 const db=mock({clients:{data:client},conversations:{data:conv}});
 assert.equal((await ensurePhotographerConversation(db,UID,{clientId:CID})).conversation_id,CONVID);
 assert.ok(!db.calls.some(c=>c[0]==='insert'));
});
test('new conversation inserts server-owned photographer id',async()=>{
 const db=mock({clients:{data:client},conversations:[{data:null},{data:conv}]});
 await ensurePhotographerConversation(db,UID,{clientId:CID,photographer_id:'spoof'});
 assert.deepEqual(db.calls.find(c=>c[0]==='insert')[2],{photographer_id:PID,client_id:CID});
});
test('duplicate conversation race is recovered',async()=>{
 const db=mock({clients:{data:client},conversations:[{data:null},{data:null,error:{code:'23505'}},{data:conv}]});
 assert.equal((await ensurePhotographerConversation(db,UID,{clientId:CID})).conversation_id,CONVID);
});
test('invalid client id rejected',async()=>{
 const db=mock();await assert.rejects(()=>ensurePhotographerConversation(db,UID,{clientId:'bad'}),e=>e instanceof PhotographerMessageError&&e.status===400);
});
test('cross-owner client denied 404',async()=>{
 const db=mock({clients:{data:null}});await assert.rejects(()=>ensurePhotographerConversation(db,UID,{clientId:CID}),e=>e.status===404);
});
test('send message uses server-derived sender and owned conversation',async()=>{
 const db=mock({conversations:{data:conv},messages:{data:incoming}});
 await sendPhotographerMessage(db,UID,{conversationId:CONVID,message:'  Hello  ',sender_id:'spoof'});
 assert.deepEqual(db.calls.find(c=>c[0]==='insert')[2],{conversation_id:CONVID,sender_id:UID,message:'Hello'});
 assert.ok(has(db,'eq','conversations','photographer_id',PID));
});
test('blank or oversized message rejected without database access',async()=>{
 for(const message of ['', '  ', 'a'.repeat(5001)]) {const db=mock();await assert.rejects(()=>sendPhotographerMessage(db,UID,{conversationId:CONVID,message}),e=>e.status===400);assert.equal(db.calls.length,0);}
});
test('cross-owner conversation rejected for send',async()=>{
 const db=mock({conversations:{data:null}});
 await assert.rejects(()=>sendPhotographerMessage(db,UID,{conversationId:CONVID,message:'Hello'}),e=>e.status===404);
 assert.ok(!db.calls.some(c=>c[0]==='insert'));
});
test('invalid conversation id rejected',async()=>{
 const db=mock();await assert.rejects(()=>sendPhotographerMessage(db,UID,{conversationId:'not-uuid',message:'Hello'}),e=>e.status===400);
});
test('read receipts update only other sender unread messages',async()=>{
 const db=mock({conversations:{data:conv},messages:{data:[{message_id:'m1'}]}});
 const r=await markPhotographerMessagesRead(db,UID,{conversationId:CONVID});
 assert.deepEqual(r.updatedIds,['m1']);assert.deepEqual(db.calls.find(c=>c[0]==='update')[2],{is_read:true});
 assert.ok(has(db,'neq','messages','sender_id',UID));assert.ok(has(db,'eq','messages','is_read',false));
});
test('cross-owner conversation cannot be marked read',async()=>{
 const db=mock({conversations:{data:null}});
 await assert.rejects(()=>markPhotographerMessagesRead(db,UID,{conversationId:CONVID}),e=>e.status===404);
 assert.ok(!db.calls.some(c=>c[0]==='update'));
});
test('database errors are sanitized',async()=>{
 const db=mock({conversations:{data:null,error:{message:'sensitive details'}}});
 await assert.rejects(()=>sendPhotographerMessage(db,UID,{conversationId:CONVID,message:'Hello'}),e=>e.message==='Unable to load conversation.');
});
test('unread count uses RLS-scoped head count, no message bodies',async()=>{
 const db=mock({messages:{count:7,error:null}});const result=await getUnreadMessageCount(db,UID);
 assert.deepEqual(result,{count:7});assert.ok(has(db,'eq','messages','is_read',false));assert.ok(has(db,'neq','messages','sender_id',UID));
 assert.ok(db.calls.some(c=>c[0]==='select'&&c[1]==='messages'&&c[3].head===true));
});
test('unread count defaults zero',async()=>{assert.deepEqual(await getUnreadMessageCount(mock({messages:{count:null}}),UID),{count:0});});
test('unread count fails closed for missing user',async()=>{const db=mock();await assert.rejects(()=>getUnreadMessageCount(db,''),e=>e.status===401);assert.equal(db.calls.length,0);});
test('unread count sanitizes errors',async()=>{await assert.rejects(()=>getUnreadMessageCount(mock({messages:{error:{message:'secret'}}}),UID),e=>e.message==='Unable to load unread message count.');});
