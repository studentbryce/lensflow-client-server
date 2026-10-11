import { apiFetch } from './apiClient';

export const apiGetClientReviews = () => apiFetch('/api/client/reviews');
export const apiCreateClientReview = (bookingId, rating, comment) => apiFetch('/api/client/reviews', {
  method: 'POST', body: JSON.stringify({ bookingId, rating, comment }),
});
export const apiUpdateClientReview = (reviewId, rating, comment) => apiFetch(`/api/client/reviews/${encodeURIComponent(reviewId)}`, {
  method: 'PATCH', body: JSON.stringify({ rating, comment }),
});
