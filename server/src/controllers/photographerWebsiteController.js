import { createUserSupabaseClient } from '../config/supabaseUser.js';
import { createWebsiteHandler } from './photographerWebsiteHandler.js';
import {
  getWebsite, saveWebsite, listPortfolio, portfolioOptions,
  createPortfolio, updatePortfolio, deletePortfolio, reorderPortfolio,
} from '../services/photographerWebsiteService.js';

const wrap = (fn, options) => createWebsiteHandler(fn, createUserSupabaseClient, options);

export const getWebsiteHandler = wrap(getWebsite);
export const saveWebsiteHandler = wrap(saveWebsite, { mode: 'body' });
export const listPortfolioHandler = wrap(listPortfolio);
export const portfolioOptionsHandler = wrap(portfolioOptions);
export const createPortfolioHandler = wrap(createPortfolio, { status: 201, mode: 'body' });
export const updatePortfolioHandler = wrap(updatePortfolio, { mode: 'itemBody' });
export const deletePortfolioHandler = wrap(deletePortfolio, { mode: 'item' });
export const reorderPortfolioHandler = wrap(reorderPortfolio, { mode: 'body' });
