import { apiFetch } from './apiClient';
export const apiGetClientInvoices = () => apiFetch('/api/client/invoices');
export const apiGetClientInvoice = id => apiFetch(`/api/client/invoices/${encodeURIComponent(id)}`);
