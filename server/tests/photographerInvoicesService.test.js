import test from 'node:test';
import assert from 'node:assert/strict';
import {
 validateInvoiceId, validateInvoicePayload, listPhotographerInvoices, getPhotographerInvoiceOptions,
 getPhotographerInvoice, createPhotographerInvoice, updatePhotographerInvoice,
 setPhotographerInvoiceStatus, deletePhotographerInvoice,
} from '../src/services/photographerInvoicesService.js';

const uid='bb55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const owner='cc55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const other='dd55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const clientId='aa55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const bookingId='ee55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const invoiceId='ff55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const serviceId='ab55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const itemId='bc55d9d2-5b43-41d3-a0f8-190178d0dbd4';
const body={client_id:clientId,booking_id:bookingId,invoice_number:' INV-2026-001 ',issue_date:'2026-10-11',due_date:'2026-10-20',status:'draft',tax_rate:15,tax_included:false,notes:'Thanks',items:[{service_id:serviceId,description:'Portrait',quantity:2,unit_price:125}]};
const client={client_id:clientId,photographer_id:owner,user_id:uid};
const booking={booking_id:bookingId,client_id:clientId,photographer_id:owner,service_id:serviceId};
const invoice={invoice_id:invoiceId,photographer_id:owner,client_id:clientId,booking_id:bookingId,status:'draft',invoice_number:'INV-2026-001'};
function mock({role='photographer',ownerId=owner,initialInvoices=[invoice],payments=[],failTable=null,failOp=null}={}){
 const data={clients:[client],bookings:[booking],invoices:structuredClone(initialInvoices),services:[{service_id:serviceId,photographer_id:owner,name:'Portrait',is_active:true}],invoice_items:[{invoice_item_id:itemId,invoice_id:invoiceId,photographer_id:owner,service_id:serviceId,description:'Portrait',quantity:2,unit_price:125,subtotal:250}],payments,profiles:[{user_id:uid,first_name:'A',role}],photographer_payment_settings:[{photographer_id:owner,default_tax_rate:15,gst_tax_number:'NZ123'}]};
 const calls=[];
 const db={data,calls,from(table){
  const filters=[];let operation='select',payload=null,offset=null,max=null;
  const q={
   select(){return this;},
   eq(k,v){filters.push(r=>r[k]===v);calls.push({table,op:'eq',k,v});return this;},
   in(k,vs){filters.push(r=>vs.includes(r[k]));return this;},
   order(){return this;},range(a,b){offset=a;max=b;return this;},limit(n){offset=0;max=n-1;return this;},
   insert(value){operation='insert';payload=value;calls.push({table,op:'insert',value});return this;},
   update(value){operation='update';payload=value;calls.push({table,op:'update',value});return this;},
   delete(){operation='delete';calls.push({table,op:'delete'});return this;},
   maybeSingle(){if(table==='photographer_profiles')return Promise.resolve({data:ownerId?{photographer_id:ownerId,business_name:'Test Studio'}:null,error:null});return this.then(x=>({data:x.data[0]??null,error:x.error}));},
   single(){return this.then(x=>({data:x.data[0]??null,error:x.error}));},
   then(resolve,reject){
    if(table==='profiles'&&filters.some(f=>f({user_id:uid}))){};
    if(table==='profiles'&&filters.length===1&&calls.at(-1)?.table==='profiles'&&calls.at(-1)?.k==='user_id'){
      // role/profile lookup is fulfilled from data rows below
    }
    const rows=(data[table]??[]).filter(r=>filters.every(f=>f(r)));
    const result={data:rows,error:table===failTable&&operation===failOp?{code:'MOCK_ERROR',message:'mock failure'}:null};
    if(!result.error){
      if(operation==='insert'){
        const added=(Array.isArray(payload)?payload:[payload]).map((v,i)=>({...v,...(table==='invoices'?{invoice_id:invoiceId}:{})}));
        data[table].push(...added);result.data=added;
      }
      if(operation==='update'){rows.forEach(r=>Object.assign(r,payload));}
      if(operation==='delete'){data[table]=data[table].filter(r=>!rows.includes(r));}
    }
    if(offset!==null)result.data=result.data.slice(offset,max+1);
    return Promise.resolve(result).then(resolve,reject);
   }
  };return q;
 }};
 // Separate role profile and photographer profile lookups from other data.
 const old=db.from;
 db.from=function(table){
  const q=old.call(db,table);
  if(table==='profiles'){
   const single=q.maybeSingle.bind(q);
   q.maybeSingle=()=>Promise.resolve({data:{role},error:null});
  }
  return q;
 };
 return db;
}
const rejects=(p,status)=>assert.rejects(p,e=>e.status===status);
const invalid=x=>assert.throws(()=>validateInvoicePayload(x),e=>e.status===400);

test('validates invoice UUID and rejects malformed identifiers',()=>{
 assert.equal(validateInvoiceId(invoiceId),invoiceId);
 for(const id of ['../../../a','123',null,''])assert.throws(()=>validateInvoiceId(id),e=>e.status===400);
});
test('calculates GST excluded on server and trims input',()=>{
 const {values,items}=validateInvoicePayload(body);
 assert.equal(values.invoice_number,'INV-2026-001');
 assert.equal(values.subtotal,250);assert.equal(values.tax_amount,37.5);assert.equal(values.total_amount,287.5);
 assert.equal(items[0].subtotal,250);
});
test('calculates GST included on server',()=>{
 const {values}=validateInvoicePayload({...body,tax_included:true});
 assert.equal(values.total_amount,250);assert.equal(values.tax_amount,32.61);
});
test('rejects owner injection, client impersonation fields and malformed payloads',()=>{
 for(const v of [{...body,photographer_id:other},{...body,total_amount:0},{...body,user_id:uid},{...body,role:'admin'},null,[],{}])invalid(v);
});
test('rejects invalid dates and due dates before issue date',()=>{
 for(const v of [{...body,issue_date:'2026-02-30'},{...body,due_date:'2026-10-01'},{...body,issue_date:'11/10/2026'}])invalid(v);
});
test('rejects invalid status, GST rate and malformed line items',()=>{
 for(const v of [{...body,status:'refunded'},{...body,tax_rate:200},{...body,tax_rate:1.123},{...body,items:[]},{...body,items:[{...body.items[0],quantity:0}]},{...body,items:[{...body.items[0],unit_price:-1}]},{...body,items:[{...body.items[0],unit_price:0.001}]},{...body,items:[{...body.items[0],photographer_id:other}]}])invalid(v);
});
test('rejects a client-role account before any invoice read',async()=>{
 const db=mock({role:'client'});
 await rejects(listPhotographerInvoices(db,uid),403);
 assert.equal(db.calls.some(x=>x.table==='invoices'),false);
});
test('rejects client-role account before invoice creation',async()=>{
 const db=mock({role:'client'});
 await rejects(createPhotographerInvoice(db,uid,body),403);
 assert.equal(db.calls.some(x=>x.op==='insert'),false);
});
test('invoice list includes client names and related bookings',async()=>{
 const db=mock();const rows=await listPhotographerInvoices(db,uid);
 assert.equal(rows.length,1);assert.equal(rows[0].clientProfile.first_name,'A');assert.equal(rows[0].booking.booking_id,bookingId);
 assert.ok(db.calls.some(x=>x.table==='invoices'&&x.op==='eq'&&x.k==='photographer_id'&&x.v===owner));
});
test('invoice form options include tax rate and only owned records',async()=>{
 const db=mock();const result=await getPhotographerInvoiceOptions(db,uid);
 assert.equal(result.default_tax_rate,15);assert.equal(result.clients.length,1);assert.equal(result.services.length,1);
});
test('invoice detail contains PDF fields and lines',async()=>{
 const db=mock();const result=await getPhotographerInvoice(db,uid,invoiceId);
 assert.equal(result.invoice.invoice_id,invoiceId);assert.equal(result.items.length,1);
 assert.equal(result.photographerProfile.business_name,'Test Studio');
});
test('other photographer invoice is not accessible',async()=>{
 const db=mock({initialInvoices:[{...invoice,photographer_id:other}]});
 await rejects(getPhotographerInvoice(db,uid,invoiceId),404);
});
test('create validates client and booking ownership before insertion',async()=>{
 const db=mock();await rejects(createPhotographerInvoice(db,uid,{...body,client_id:other}),400);
 assert.equal(db.calls.some(x=>x.op==='insert'),false);
});
test('create validates invoice service ownership before insertion',async()=>{
 const db=mock();await rejects(createPhotographerInvoice(db,uid,{...body,items:[{...body.items[0],service_id:other}]}),400);
 assert.equal(db.calls.some(x=>x.op==='insert'),false);
});
test('create inserts server totals and bank snapshot',async()=>{
 const db=mock({initialInvoices:[]});const result=await createPhotographerInvoice(db,uid,body);
 assert.equal(result.total_amount,287.5);assert.equal(result.tax_number,'NZ123');
 assert.equal(db.data.invoice_items.length,2);assert.equal(db.data.invoice_items.at(-1).photographer_id,owner);
});
test('create compensates for line-item insertion failure',async()=>{
 const db=mock({initialInvoices:[],failTable:'invoice_items',failOp:'insert'});
 await assert.rejects(createPhotographerInvoice(db,uid,body),/Unable to create invoice items/);
 assert.equal(db.data.invoices.length,0);
});
test('update blocks paid invoices',async()=>{
 const db=mock({initialInvoices:[{...invoice,status:'paid'}]});
 await rejects(updatePhotographerInvoice(db,uid,invoiceId,body),409);
 assert.equal(db.calls.some(x=>x.op==='update'),false);
});
test('update blocks invoices with payment records',async()=>{
 const db=mock({payments:[{payment_id:itemId,invoice_id:invoiceId}]});
 await rejects(updatePhotographerInvoice(db,uid,invoiceId,body),409);
});
test('update replaces line items only for owned invoice',async()=>{
 const db=mock();const result=await updatePhotographerInvoice(db,uid,invoiceId,body);
 assert.equal(result.total_amount,287.5);assert.equal(db.data.invoice_items.length,1);
});
test('status action validates allowed values and transitions',async()=>{
 const db=mock();await rejects(setPhotographerInvoiceStatus(db,uid,invoiceId,{status:'refunded'}),400);
 await rejects(setPhotographerInvoiceStatus(db,uid,invoiceId,{status:'paid',photographer_id:other}),400);
 const sent=await setPhotographerInvoiceStatus(db,uid,invoiceId,{status:'sent'});
 assert.equal(sent.status,'sent');
 await rejects(setPhotographerInvoiceStatus(db,uid,invoiceId,{status:'sent'}),409);
 const paid=await setPhotographerInvoiceStatus(db,uid,invoiceId,{status:'paid'});
 assert.equal(paid.status,'paid');
});
test('delete rejects invoices with payments',async()=>{
 const db=mock({payments:[{payment_id:itemId,invoice_id:invoiceId}]});
 await rejects(deletePhotographerInvoice(db,uid,invoiceId),409);
});
test('delete uses invoice FK cascade and photographer ownership',async()=>{
 const db=mock();const result=await deletePhotographerInvoice(db,uid,invoiceId);
 assert.equal(result.invoice_id,invoiceId);
 assert.equal(db.data.invoices.length,0);
 assert.equal(db.calls.some(x=>x.table==='invoice_items'&&x.op==='delete'),false);
});
test('database errors are propagated, not reported as success',async()=>{
 const db=mock({failTable:'invoices',failOp:'select'});
 await assert.rejects(listPhotographerInvoices(db,uid),/Unable to load invoices/);
});
