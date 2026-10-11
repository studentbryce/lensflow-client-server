import { apiFetch } from './apiClient';
export const apiGetClientMessages = () => apiFetch('/api/client/messages');
export const apiCreateClientConversation = () => apiFetch('/api/client/messages/conversation', { method: 'POST' });
export const apiSendClientMessage = message => apiFetch('/api/client/messages', {
  method: 'POST', body: JSON.stringify({ message }),
});
export const apiMarkClientMessagesRead = () => apiFetch('/api/client/messages/read', { method: 'PATCH' });
