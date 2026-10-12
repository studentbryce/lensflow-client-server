import { apiFetch } from './apiClient';

export const apiGetPhotographerReviews = () => apiFetch('/api/photographer/reviews');
export const apiModeratePhotographerReview = (reviewId, status) => apiFetch(
  `/api/photographer/reviews/${encodeURIComponent(reviewId)}/moderate`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  },
);
