import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { listPhotographerInvoices, getPhotographerInvoiceOptions, getPhotographerInvoice, createPhotographerInvoice, updatePhotographerInvoice, setPhotographerInvoiceStatus, deletePhotographerInvoice } from '../services/photographerInvoicesService.js';

// Generic wrapper function to handle responses and errors for photographer invoice operations
const wrap=(action,status=200)=>async(req,res,next)=>{
  try{
    const db=createUserSupabaseClient(req.accessToken);
    const data=await action(db,req.user.id,req.params.id,req.body);
    return res.status(status).set('Cache-Control','no-store').json({success:true,data});
  }catch(error){
    if(error instanceof BookingRequestError)return res.status(error.status).set('Cache-Control','no-store').json({success:false,error:{code:error.code,message:error.message}});
    if(error.cause?.code==='23505')return res.status(409).set('Cache-Control','no-store').json({success:false,error:{code:'DUPLICATE_INVOICE',message:'An invoice with this number or booking already exists. Check the invoice list before retrying.'}});
    if(error.cause?.code==='23503')return res.status(409).set('Cache-Control','no-store').json({success:false,error:{code:'INVOICE_RELATION_CONFLICT',message:'This invoice references a related record that is unavailable or cannot be removed.'}});
    return next(error);
  }
};

// Controller functions for photographer invoice operations
export const getInvoices=wrap(listPhotographerInvoices);
export const getInvoiceOptions=wrap(getPhotographerInvoiceOptions);
export const getInvoice=wrap(getPhotographerInvoice);
export const postInvoice=wrap((db,userId,_id,body)=>createPhotographerInvoice(db,userId,body),201);
export const patchInvoice=wrap(updatePhotographerInvoice);
export const patchInvoiceStatus=wrap(setPhotographerInvoiceStatus);
export const deleteInvoice=wrap(deletePhotographerInvoice);
