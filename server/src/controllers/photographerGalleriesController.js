import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { BookingRequestError } from '../services/bookingCreateService.js';
import { listPhotographerGalleries, getPhotographerGalleryOptions, getPhotographerGallery, createPhotographerGallery, updatePhotographerGallery, createPhotographerGalleryMedia, deletePhotographerGalleryMedia, deletePhotographerGallery } from '../services/photographerGalleriesService.js';

// Generic wrapper function to handle responses and errors for photographer gallery operations
const wrap=(fn,status=200)=>async(req,res,next)=>{
  try {
    const db=createUserSupabaseClient(req.accessToken);
    const data=await fn(db,req.user.id,req.params.id,req.body,req.params.mediaId);
    return res.status(status).set('Cache-Control','no-store').json({success:true,data});
  } catch(error) {
    if(error instanceof BookingRequestError)return res.status(error.status).json({success:false,error:{code:error.code,message:error.message}});
    if(error.cause?.code==='23505')return res.status(409).json({success:false,error:{code:'DUPLICATE_GALLERY',message:'A gallery or media record already exists for this booking or file.'}});
    if(error.cause?.code==='23503')return res.status(409).json({success:false,error:{code:'RELATED_RECORD',message:'The gallery has related records that prevent this operation.'}});
    next(error);
  }
};

// Controller functions for photographer gallery operations
export const listGalleries=wrap(listPhotographerGalleries);
export const galleryOptions=wrap(getPhotographerGalleryOptions);
export const getGallery=wrap(getPhotographerGallery);
export const postGallery=wrap((db,userId,_id,body)=>createPhotographerGallery(db,userId,body),201);
export const patchGallery=wrap(updatePhotographerGallery);
export const postMedia=wrap(createPhotographerGalleryMedia,201);
export const deleteMedia=wrap((db,userId,id,_body,mediaId)=>deletePhotographerGalleryMedia(db,userId,id,mediaId));
export const deleteGallery=wrap(deletePhotographerGallery);
