import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSettingsHandler } from '../src/controllers/photographerSettingsHandler.js';
import { savePhotographerAccount } from '../src/services/photographerSettingsService.js';

function setup(action, reqBody, authEmail = 'confirmed@example.nz') {
  const captured = [];
  const actionSpy = async (...args) => { captured.push(args); return { ok: true }; };
  const actualAction = action ?? actionSpy;
  const handler = makeSettingsHandler(actualAction, token => ({ token }));
  const req = { accessToken:'verified.jwt', user:{id:'verified-user',email:authEmail}, body:reqBody };
  const res = { statusCode:200, headers:{}, status(n){this.statusCode=n;return this;}, set(k,v){this.headers[k]=v;return this;}, json(body){this.body=body;return this;} };
  return { handler, req, res, captured };
}
test('settings handler passes body and Auth email in correct positions', async () => {
  const body={business_name:'Studio'};
  const {handler,req,res,captured}=setup(null,body);
  await handler(req,res,e=>{throw e});
  assert.deepEqual(captured[0],[{token:'verified.jwt'},'verified-user',body,'confirmed@example.nz']);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['Cache-Control'],'no-store');
});
test('settings handler rejects unconfirmed email without invoking DB action', async () => {
  const {handler,req,res}=setup(savePhotographerAccount,{email:'unconfirmed@example.nz',first_name:'A',last_name:'B',phone:''});
  await handler(req,res,e=>{throw e});
  assert.equal(res.statusCode,400);
  assert.equal(res.body.error.code,'EMAIL_NOT_CONFIRMED');
});
test('settings handler rejects malformed email without throwing 500', async () => {
  const {handler,req,res}=setup(savePhotographerAccount,{email:42,first_name:'A',last_name:'B',phone:''});
  await handler(req,res,e=>{throw e});
  assert.equal(res.statusCode,400);
});
test('settings handler forwards unexpected DB errors to error middleware', async () => {
  const {handler,req,res}=setup(async()=>{throw new Error('db offline')},{});
  let received;
  await handler(req,res,e=>{received=e});
  assert.equal(received.message,'db offline');
});
