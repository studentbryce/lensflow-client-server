import { apiFetch } from './apiClient';
export const apiGetPhotographerMessages = () => apiFetch('/api/photographer/messages');
export const apiStartPhotographerConversation = clientId => apiFetch('/api/photographer/messages/conversation', {
  method: 'POST', body: JSON.stringify({ clientId }),
});
export const apiSendPhotographerMessage = (conversationId, message) => apiFetch('/api/photographer/messages', {
  method: 'POST', body: JSON.stringify({ conversationId, message }),
});
export const apiMarkPhotographerMessagesRead = conversationId => apiFetch('/api/photographer/messages/read', {
  method: 'PATCH', body: JSON.stringify({ conversationId }),
});
export const apiGetUnreadMessageCount = () => apiFetch('/api/messages/unread-count');
