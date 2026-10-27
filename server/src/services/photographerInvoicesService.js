/** Photographer invoice REST operations, scoped by verified user JWT and RLS.
 * Note: multi-table invoice writes are NOT transactional over PostgREST.
 */
import { BookingRequestError } from './bookingCreateService.js';
import { resolvePhotographer } from './photographerBookingFormService.js';

// Constants for validation and pagination
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 400;
const INVOICE_FIELDS = 'invoice_id,photographer_id,client_id,booking_id,invoice_number,issue_date,due_date,subtotal,tax_rate,tax_included,tax_number,bank_account_name,bank_name,bank_account_number,bank_payment_instructions,tax_amount,total_amount,status,notes,created_at,updated_at';
const ITEM_FIELDS = 'invoice_item_id,invoice_id,photographer_id,service_id,description,quantity,unit_price,subtotal';
const BOOKING_FIELDS = 'booking_id,client_id,service_id,booking_date,start_time,end_time,location,status,total_amount';
const SERVICE_FIELDS = 'service_id,name,description,price,duration_minutes,deposit_amount,is_active';
const CLIENT_FIELDS = 'client_id,user_id,photographer_id,created_at';
const PROFILE_FIELDS = 'user_id,first_name,last_name,email,phone';
const STATUSES = ['draft','sent','paid','overdue','cancelled'];
const BODY_FIELDS = ['client_id','booking_id','invoice_number','issue_date','due_date','status','tax_rate','tax_included','notes','items'];
const fail = (status, code, message) => { throw new BookingRequestError(status, code, message); };

// Helper function to read data from a Supabase query and handle errors, throwing a new error with a custom message if the query fails
async function read(query, message) {
  const { data, error } = await query;
  if (error) { const e = new Error(message); e.cause = error; throw e; }
  return data;
}

// Helper function to read all rows from a query builder in batches, handling pagination
async function pages(build, message) {
  const out=[];
  for(let offset=0;;offset+=PAGE){
    const rows=await read(build().range(offset,offset+PAGE-1),message)??[];
    out.push(...rows);
    if(rows.length<PAGE)return out;
  }
}

// Helper function to validate a UUID, throwing a BookingRequestError if invalid
function uuid(id, code='INVALID_ID') {
  if(typeof id!=='string'||!UUID.test(id))fail(400,code,'A valid identifier is required.');
  return id;
}
// Helper function to validate a date string, throwing a BookingRequestError if invalid
export const validateInvoiceId = id => uuid(id,'INVALID_INVOICE_ID');
function realDate(value) {
  if(typeof value!=='string'||!DATE.test(value))return false;
  const parsed=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value;
}
// Helper function to validate a date string, throwing a BookingRequestError if invalid
function money(value, label) {
  const n=Number(value);
  if((typeof value!=='number'&&typeof value!=='string')||value===''||!Number.isFinite(n)||n<0||n>999999999||Math.abs(n*100-Math.round(n*100))>1e-6)fail(400,'INVALID_AMOUNT',`${label} must be a nonnegative amount with up to two decimal places.`);
  return Math.round(n*100)/100;
}
// Helper function to validate the invoice payload, ensuring all required fields are present and valid
const round = n => Math.round((n+Number.EPSILON)*100)/100;
export function validateInvoicePayload(body) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!BODY_FIELDS.includes(k)))fail(400,'INVALID_FIELDS','Unexpected invoice fields.');
  for(const key of ['client_id','booking_id'])uuid(body[key],`INVALID_${key.toUpperCase()}`);
  if(typeof body.invoice_number!=='string'||!body.invoice_number.trim()||body.invoice_number.trim().length>50)fail(400,'INVALID_NUMBER','Invoice number must be 1–50 characters.');
  if(!realDate(body.issue_date)||!(body.due_date===null||body.due_date===''||body.due_date===undefined||realDate(body.due_date)))fail(400,'INVALID_DATE','Invoice dates must be valid YYYY-MM-DD dates.');
  if(body.due_date&&body.due_date<body.issue_date)fail(400,'INVALID_DATE','Due date cannot precede issue date.');
  if(!STATUSES.includes(body.status))fail(400,'INVALID_STATUS','Invalid invoice status.');
  const rate=Number(body.tax_rate);
  if(!Number.isFinite(rate)||rate<0||rate>100||Math.abs(rate*100-Math.round(rate*100))>1e-6)fail(400,'INVALID_TAX','GST rate must be between 0 and 100 with at most two decimals.');
  if(typeof body.tax_included!=='boolean')fail(400,'INVALID_TAX','tax_included must be a boolean.');
  if(body.notes!=null&&(typeof body.notes!=='string'||body.notes.length>10000))fail(400,'INVALID_NOTES','Invoice notes are too long.');
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)fail(400,'INVALID_ITEMS','Provide 1–100 invoice items.');
  const items=body.items.map((item,i)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['service_id','description','quantity','unit_price','invoice_item_id'].includes(k)))fail(400,'INVALID_ITEM','Unexpected invoice item fields.');
    const serviceId=item.service_id||null;
    if(serviceId)uuid(serviceId,'INVALID_SERVICE_ID');
    if(typeof item.description!=='string'||!item.description.trim()||item.description.length>5000)fail(400,'INVALID_ITEM',`Invalid description for item ${i+1}.`);
    const quantity=Number(item.quantity);
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)fail(400,'INVALID_ITEM',`Invalid quantity for item ${i+1}.`);
    const unit_price=money(item.unit_price,`Item ${i+1} price`);
    const subtotal=round(quantity*unit_price);
    if(subtotal>999999999)fail(400,'INVALID_AMOUNT','Invoice item amount is too large.');
    return { service_id:serviceId, description:item.description.trim(), quantity, unit_price, subtotal };
  });
  const subtotal=round(items.reduce((sum,item)=>sum+item.subtotal,0));
  const tax_amount=round(body.tax_included ? subtotal*rate/(100+rate) : subtotal*rate/100);
  const total_amount=round(body.tax_included ? subtotal : subtotal+tax_amount);
  if([subtotal,tax_amount,total_amount].some(n=>n>999999999))fail(400,'INVALID_AMOUNT','Invoice total is too large.');
  return {
    values:{client_id:body.client_id,booking_id:body.booking_id,invoice_number:body.invoice_number.trim(),issue_date:body.issue_date,due_date:body.due_date||null,status:body.status,tax_rate:round(rate),tax_included:body.tax_included,notes:body.notes?.trim()||null,subtotal,tax_amount,total_amount},
    items,
  };
}
// Helper function to resolve the photographer for a given user ID, ensuring the user is a photographer and has a valid profile
async function context(db,userId){return resolvePhotographer(db,userId);}
// Helper function to get a specific invoice owned by the photographer, throwing an error if not found
async function ownedInvoice(db,photographerId,id){
  validateInvoiceId(id);
  const invoice=await read(db.from('invoices').select(INVOICE_FIELDS).eq('invoice_id',id).eq('photographer_id',photographerId).maybeSingle(),'Unable to load invoice.');
  if(!invoice)fail(404,'INVOICE_NOT_FOUND','Invoice could not be found.');
  return invoice;
}
// Helper function to verify that the client and booking belong to the photographer, throwing an error if not
async function clientProfiles(db,clients){
  const ids=[...new Set(clients.map(c=>c.user_id).filter(Boolean))];
  if(!ids.length)return clients.map(c=>({...c,profile:null}));
  const profiles=[];
  for(let i=0;i<ids.length;i+=150){
    profiles.push(...(await read(db.from('profiles').select(PROFILE_FIELDS).in('user_id',ids.slice(i,i+150)),'Unable to load client profiles.')??[]));
  }
  const map=new Map(profiles.map(p=>[p.user_id,p]));
  return clients.map(c=>({...c,profile:map.get(c.user_id)??null}));
}
// Helper function to verify that the client and booking belong to the photographer, throwing an error if not
export async function listPhotographerInvoices(db,userId){
  const photographer=await context(db,userId), id=photographer.photographer_id;
  const invoices=await pages(()=>db.from('invoices').select(INVOICE_FIELDS).eq('photographer_id',id).order('created_at',{ascending:false}).order('invoice_id',{ascending:false}),'Unable to load invoices.');
  const clients=await pages(()=>db.from('clients').select(CLIENT_FIELDS).eq('photographer_id',id).order('created_at',{ascending:false}),'Unable to load clients.');
  const withProfiles=await clientProfiles(db,clients);
  const clientMap=new Map(withProfiles.map(c=>[c.client_id,c]));
  const bookings=await pages(()=>db.from('bookings').select(BOOKING_FIELDS).eq('photographer_id',id).order('booking_date',{ascending:false}),'Unable to load bookings.');
  const bookingMap=new Map(bookings.map(b=>[b.booking_id,b]));
  return invoices.map(invoice=>({...invoice,client:clientMap.get(invoice.client_id)??null,clientProfile:clientMap.get(invoice.client_id)?.profile??null,booking:bookingMap.get(invoice.booking_id)??null}));
}
// Helper function to verify that the client and booking belong to the photographer, throwing an error if not
export async function getPhotographerInvoiceOptions(db,userId){
  const photographer=await context(db,userId),id=photographer.photographer_id;
  const [clients,bookings,services,paymentSettings]=await Promise.all([
    pages(()=>db.from('clients').select(CLIENT_FIELDS).eq('photographer_id',id).order('created_at',{ascending:false}),'Unable to load clients.'),
    pages(()=>db.from('bookings').select(BOOKING_FIELDS).eq('photographer_id',id).order('booking_date',{ascending:false}),'Unable to load bookings.'),
    pages(()=>db.from('services').select(SERVICE_FIELDS).eq('photographer_id',id).eq('is_active',true).order('name',{ascending:true}),'Unable to load services.'),
    read(db.from('photographer_payment_settings').select('default_tax_rate').eq('photographer_id',id).maybeSingle(),'Unable to load tax settings.'),
  ]);
  return {clients:await clientProfiles(db,clients),bookings,services,default_tax_rate:paymentSettings?.default_tax_rate??15};
}
// Helper function to verify that the client and booking belong to the photographer, throwing an error if not
export async function getPhotographerInvoice(db,userId,invoiceId){
  const photographer=await context(db,userId),id=photographer.photographer_id;
  const invoice=await ownedInvoice(db,id,invoiceId);
  const [items,client,booking]=await Promise.all([
    read(db.from('invoice_items').select(ITEM_FIELDS).eq('invoice_id',invoiceId).eq('photographer_id',id).order('invoice_item_id',{ascending:true}),'Unable to load invoice items.'),
    read(db.from('clients').select(CLIENT_FIELDS).eq('client_id',invoice.client_id).eq('photographer_id',id).maybeSingle(),'Unable to load invoice client.'),
    read(db.from('bookings').select(BOOKING_FIELDS).eq('booking_id',invoice.booking_id).eq('photographer_id',id).maybeSingle(),'Unable to load invoice booking.'),
  ]);
  const clientProfile=client?.user_id ? await read(db.from('profiles').select(PROFILE_FIELDS).eq('user_id',client.user_id).maybeSingle(),'Unable to load client profile.') : null;
  const service=booking?.service_id ? await read(db.from('services').select(SERVICE_FIELDS).eq('service_id',booking.service_id).eq('photographer_id',id).maybeSingle(),'Unable to load service.') : null;
  return {invoice,items:items??[],clientProfile,booking,service,photographerProfile:{photographer_id:id,business_name:photographer.business_name}};
}
// Helper function to verify that the client and booking belong to the photographer, throwing an error if not
async function verifyRelations(db,id,values,items){
  const [client,booking]=await Promise.all([
    read(db.from('clients').select('client_id').eq('client_id',values.client_id).eq('photographer_id',id).maybeSingle(),'Unable to verify client.'),
    read(db.from('bookings').select('booking_id').eq('booking_id',values.booking_id).eq('client_id',values.client_id).eq('photographer_id',id).maybeSingle(),'Unable to verify booking.'),
  ]);
  if(!client||!booking)fail(400,'INVALID_RELATION','Booking must belong to the selected client and photographer.');
  const serviceIds=[...new Set(items.map(x=>x.service_id).filter(Boolean))];
  for(let i=0;i<serviceIds.length;i+=150){
    const found=await read(db.from('services').select('service_id').eq('photographer_id',id).in('service_id',serviceIds.slice(i,i+150)),'Unable to verify invoice services.');
    if((found??[]).length!==serviceIds.slice(i,i+150).length)fail(400,'INVALID_SERVICE','Invoice item service must belong to this photographer.');
  }
}
// Helper function to ensure that an invoice has no associated payments, throwing an error if payments exist
async function ensureNoPayments(db,invoiceId){
  const payments=await read(db.from('payments').select('payment_id').eq('invoice_id',invoiceId).limit(1),'Unable to verify invoice payments.');
  if(payments?.length)fail(409,'PAYMENTS_EXIST','Invoices with payment records cannot be edited or deleted.');
}
// Helper function to prepare invoice item rows for insertion, adding the photographer ID and invoice ID to each item
async function itemRows(items,id,invoiceId){return items.map(item=>({...item,photographer_id:id,invoice_id:invoiceId}));}
export async function createPhotographerInvoice(db,userId,body){
  const {values,items}=validateInvoicePayload(body);
  const photographer=await context(db,userId),id=photographer.photographer_id;
  await verifyRelations(db,id,values,items);
  const paymentSettings=await read(db.from('photographer_payment_settings').select('bank_account_name,bank_name,bank_account_number,bank_payment_instructions,gst_tax_number').eq('photographer_id',id).maybeSingle(),'Unable to load payment settings.');
  const invoice=await read(db.from('invoices').insert({...values,photographer_id:id,tax_number:paymentSettings?.gst_tax_number??null,bank_account_name:paymentSettings?.bank_account_name??null,bank_name:paymentSettings?.bank_name??null,bank_account_number:paymentSettings?.bank_account_number??null,bank_payment_instructions:paymentSettings?.bank_payment_instructions??null}).select(INVOICE_FIELDS).single(),'Unable to create invoice.');
  if(!invoice?.invoice_id)fail(500,'CREATE_FAILED','Invoice could not be created.');
  try {
    await read(db.from('invoice_items').insert(await itemRows(items,id,invoice.invoice_id)),'Unable to create invoice items.');
  } catch(e){
    try { await read(db.from('invoices').delete().eq('invoice_id',invoice.invoice_id).eq('photographer_id',id),'Unable to clean up incomplete invoice.'); }
    catch(cleanup){ console.error('Invoice creation cleanup failed:',cleanup.message); }
    throw e;
  }
  return invoice;
}
// Helper function to get a specific invoice owned by the photographer, throwing an error if not
export async function updatePhotographerInvoice(db,userId,invoiceId,body){
  const {values,items}=validateInvoicePayload(body);
  const photographer=await context(db,userId),id=photographer.photographer_id;
  const existing=await ownedInvoice(db,id,invoiceId);
  if(existing.status==='paid')fail(409,'PAID_INVOICE','Paid invoices cannot be edited.');
  await ensureNoPayments(db,invoiceId);
  await verifyRelations(db,id,values,items);
  // Retains legacy edit order; invoice + line items are separate PostgREST writes.
  const invoice=await read(db.from('invoices').update(values).eq('invoice_id',invoiceId).eq('photographer_id',id).select(INVOICE_FIELDS).maybeSingle(),'Unable to update invoice.');
  if(!invoice)fail(404,'INVOICE_NOT_FOUND','Invoice could not be found.');
  await read(db.from('invoice_items').delete().eq('invoice_id',invoiceId).eq('photographer_id',id),'Unable to replace invoice items.');
  await read(db.from('invoice_items').insert(await itemRows(items,id,invoiceId)),'Unable to save invoice items.');
  return invoice;
}
// Helper function to get a specific invoice owned by the photographer, throwing an error if not
export async function setPhotographerInvoiceStatus(db,userId,invoiceId,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!['sent','paid'].includes(body.status))fail(400,'INVALID_STATUS','Status action must be sent or paid.');
  const photographer=await context(db,userId),id=photographer.photographer_id;
  const current=await ownedInvoice(db,id,invoiceId);
  if(current.status==='paid'||current.status==='cancelled')fail(409,'INVALID_TRANSITION','Paid or cancelled invoices cannot change status.');
  if(body.status==='sent'&&current.status!=='draft')fail(409,'INVALID_TRANSITION','Only draft invoices can be marked as sent.');
  const updated=await read(db.from('invoices').update({status:body.status}).eq('invoice_id',invoiceId).eq('photographer_id',id).select(INVOICE_FIELDS).maybeSingle(),'Unable to update invoice status.');
  if(!updated)fail(404,'INVOICE_NOT_FOUND','Invoice could not be found.');
  return updated;
}
// Helper function to get a specific invoice owned by the photographer, throwing an error if not
export async function deletePhotographerInvoice(db,userId,invoiceId){
  const photographer=await context(db,userId),id=photographer.photographer_id;
  const existing=await ownedInvoice(db,id,invoiceId);
  if(existing.status==='paid')fail(409,'PAID_INVOICE','Paid invoices cannot be deleted.');
  await ensureNoPayments(db,invoiceId);
  // Database FK ON DELETE CASCADE deletes invoice_items atomically with invoice.
  const deleted=await read(db.from('invoices').delete().eq('invoice_id',invoiceId).eq('photographer_id',id).select('invoice_id').maybeSingle(),'Unable to delete invoice.');
  if(!deleted)fail(404,'INVOICE_NOT_FOUND','Invoice could not be found.');
  return {invoice_id:deleted.invoice_id};
}
