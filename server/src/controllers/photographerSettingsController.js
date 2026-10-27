import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { makeSettingsHandler } from './photographerSettingsHandler.js';
import { getPhotographerSettings, savePhotographerAccount, savePhotographerBusiness, savePhotographerTax, savePhotographerBank } from '../services/photographerSettingsService.js';

// Generic handler to wrap service functions and handle errors
// Explicit argument adaptation: GET needs Auth email, writes need request body.
export const getSettings = makeSettingsHandler((db, userId, _body, authEmail) => getPhotographerSettings(db, userId, authEmail), createUserSupabaseClient);
export const patchAccount = makeSettingsHandler(savePhotographerAccount, createUserSupabaseClient);
export const patchBusiness = makeSettingsHandler(savePhotographerBusiness, createUserSupabaseClient);
export const putTax = makeSettingsHandler(savePhotographerTax, createUserSupabaseClient);
export const putBank = makeSettingsHandler(savePhotographerBank, createUserSupabaseClient);
