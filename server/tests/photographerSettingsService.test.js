import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingRequestError } from '../src/services/bookingCreateService.js';
import {
  getPhotographerSettings, savePhotographerAccount, savePhotographerBusiness,
  savePhotographerTax, savePhotographerBank, validateTax, validateBank,
} from '../src/services/photographerSettingsService.js';

const U = '22222222-2222-4222-8222-222222222222';
const P = '11111111-1111-4111-8111-111111111111';
const goodBusiness = { business_name:'Studio', email:'owner@example.nz', phone:'', address:'', website_url:'', description:'' };
const goodBank = { bank_account_name:'Studio', bank_name:'NZ Bank', bank_account_number:'12-1234-1234567-00', bank_payment_instructions:'Use invoice number' };
const bad = code => e => e instanceof BookingRequestError && e.code === code;
function mock({ role = 'photographer', errors = {}, emptyPayment = false } = {}) {
  const calls = [];
  const db = { from(table) { return new Query(table); } };
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.payload = null; this.filters = []; }
    select(fields) { this.fields = fields; return this; }
    eq(field, value) { this.filters.push([field,value]); return this; }
    update(value) { this.op = 'update'; this.payload = value; return this; }
    upsert(value, options) { this.op = 'upsert'; this.payload = value; this.options = options; return this; }
    single() { return this.then(x => x); }
    maybeSingle() { return this.then(x => x); }
    then(resolve, reject) {
      calls.push({ table: this.table, op: this.op, filters: this.filters, payload: this.payload, options: this.options });
      let data;
      if (this.table === 'profiles') data = this.op === 'select' ? { role, user_id: U, first_name: 'Alex', email:'profile@example.nz' } : { ...this.payload, user_id:U };
      if (this.table === 'photographer_profiles') data = this.op === 'select' ? { photographer_id:P, user_id:U, business_name:'Studio' } : { ...this.payload, photographer_id:P };
      if (this.table === 'photographer_payment_settings') data = this.op === 'select' && emptyPayment ? null : (this.payload ?? { default_tax_rate:15 });
      if (this.table === 'photographer_stripe_accounts') data = { stripe_account_id:'acct_test', charges_enabled:false };
      if (this.table === 'calendar_integrations') data = null;
      return Promise.resolve({ data, error: errors[this.table] || null }).then(resolve,reject);
    }
  }
  return { db, calls };
}

test('GET settings returns Auth email, not stale profile email', async () => {
  const {db} = mock();
  const result = await getPhotographerSettings(db,U,'auth@example.nz');
  assert.equal(result.profile.email,'auth@example.nz');
  assert.equal(result.business.photographer_id,P);
  assert.equal(result.stripe.stripe_account_id,'acct_test');
});
test('GET settings handles missing payment settings', async () => {
  const {db} = mock({emptyPayment:true});
  assert.equal((await getPhotographerSettings(db,U,'auth@example.nz')).payment,null);
});
test('GET settings scopes sensitive tables to verified owner', async () => {
  const {db,calls} = mock(); await getPhotographerSettings(db,U,'auth@example.nz');
  for (const table of ['photographer_payment_settings','photographer_stripe_accounts','calendar_integrations']) {
    assert(calls.some(c=>c.table===table&&c.filters.some(([key,value])=>key==='photographer_id'&&value===P)));
  }
});
test('client cannot load settings', async () => {
  const {db} = mock({role:'client'}); await assert.rejects(getPhotographerSettings(db,U,'x'),bad('PHOTOGRAPHER_REQUIRED'));
});
test('client cannot change bank details', async () => {
  const {db,calls} = mock({role:'client'}); await assert.rejects(savePhotographerBank(db,U,goodBank),bad('PHOTOGRAPHER_REQUIRED'));
  assert(!calls.some(c=>c.op==='upsert'));
});
test('account update limits fields to verified user', async () => {
  const {db,calls}=mock(); await savePhotographerAccount(db,U,{first_name:'Alex',last_name:'Smith',phone:''});
  assert(calls.some(c=>c.table==='profiles'&&c.op==='update'&&c.filters.some(([k,v])=>k==='user_id'&&v===U)));
});
test('account rejects role escalation', async () => {
  const {db}=mock(); await assert.rejects(savePhotographerAccount(db,U,{first_name:'A',last_name:'B',phone:'',role:'admin'}),bad('INVALID_FIELDS'));
});
test('account rejects missing first name', async () => {
  const {db}=mock(); await assert.rejects(savePhotographerAccount(db,U,{first_name:'',last_name:'B',phone:''}),bad('INVALID_FIELD'));
});
test('business update is scoped to owner', async () => {
  const {db,calls}=mock(); await savePhotographerBusiness(db,U,goodBusiness);
  assert(calls.some(c=>c.table==='photographer_profiles'&&c.op==='update'&&c.filters.some(([k,v])=>k==='photographer_id'&&v===P)));
});
test('business rejects photographer_id injection', async () => {
  const {db}=mock(); await assert.rejects(savePhotographerBusiness(db,U,{...goodBusiness,photographer_id:'other'}),bad('INVALID_FIELDS'));
});
test('business rejects javascript website URL', async () => {
  const {db}=mock(); await assert.rejects(savePhotographerBusiness(db,U,{...goodBusiness,website_url:'javascript:alert(1)'}),bad('INVALID_URL'));
});
test('business rejects malformed email', async () => {
  const {db}=mock(); await assert.rejects(savePhotographerBusiness(db,U,{...goodBusiness,email:'invalid'}),bad('INVALID_EMAIL'));
});
test('tax accepts NZ GST 15 percent', () => assert.deepEqual(validateTax({gst_tax_number:'123',default_tax_rate:15}),{gst_tax_number:'123',default_tax_rate:15}));
test('tax rejects negative rate', () => assert.throws(()=>validateTax({gst_tax_number:'',default_tax_rate:-1}),bad('INVALID_TAX_RATE')));
test('tax rejects excess decimal precision', () => assert.throws(()=>validateTax({gst_tax_number:'',default_tax_rate:15.123}),bad('INVALID_TAX_RATE')));
test('tax rejects missing rate', () => assert.throws(()=>validateTax({gst_tax_number:''}),bad('INVALID_TAX_RATE')));
test('tax upsert cannot select another photographer', async () => {
  const {db,calls}=mock(); await savePhotographerTax(db,U,{gst_tax_number:'123',default_tax_rate:15});
  assert(calls.some(c=>c.table==='photographer_payment_settings'&&c.op==='upsert'&&c.payload.photographer_id===P&&c.options.onConflict==='photographer_id'));
});
test('bank requires name and account number together', () => assert.throws(()=>validateBank({...goodBank,bank_account_number:''}),bad('INVALID_BANK_DETAILS')));
test('bank permits clearing all fields', () => assert.deepEqual(validateBank({bank_account_name:'',bank_name:'',bank_account_number:'',bank_payment_instructions:''}),{bank_account_name:null,bank_name:null,bank_account_number:null,bank_payment_instructions:null}));
test('bank rejects unexpected payment status field', () => assert.throws(()=>validateBank({...goodBank,status:'paid'}),bad('INVALID_FIELDS')));
test('bank update does not rewrite historical invoices', async () => {
  const {db,calls}=mock(); await savePhotographerBank(db,U,goodBank);
  assert(calls.some(c=>c.table==='photographer_payment_settings'&&c.op==='upsert'));
  assert(!calls.some(c=>c.table==='invoices'));
});
test('database errors are propagated, not silently ignored', async () => {
  const {db}=mock({errors:{photographer_payment_settings:{code:'42501',message:'RLS denied'}}});
  await assert.rejects(savePhotographerBank(db,U,goodBank),/Unable to save bank details/);
});
