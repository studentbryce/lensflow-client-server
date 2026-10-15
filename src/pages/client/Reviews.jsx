import { useEffect, useMemo, useState } from "react";
import {
  BiCalendar,
  BiCheckCircle,
  BiEdit,
  BiMessageSquareDetail,
  BiStar,
  BiX,
} from "react-icons/bi";
import { useAuth } from "../../context/authStore";
import { apiGetClientReviews, apiCreateClientReview, apiUpdateClientReview } from "../../services/clientReviewsApi";
import "./Reviews.css";

const REVIEW_FILTERS = ["all", "pending", "approved", "rejected"];

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimestamp(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusLabel(status) {
  switch (status) {
    case "approved":
      return "Published";

    case "rejected":
      return "Not Published";

    case "pending":
    default:
      return "Pending Approval";
  }
}

function StarDisplay({ rating }) {
  return (
    <div
      className="client-review-stars-display"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <BiStar
          key={star}
          className={star <= rating ? "filled" : ""}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function Reviews() {
  const { user } = useAuth();

  const [clientId, setClientId] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [filter, setFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [editingReview, setEditingReview] = useState(null);

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadReviewsPage() {
      try {
        setLoading(true);
        setErrorMessage("");

        if (!user?.id) {
          throw new Error("Please sign in to view your reviews.");
        }

        const response = await apiGetClientReviews();
        const { clientId: currentClientId, bookings: bookingData, reviews: reviewData } = response.data;

        if (!active) {
          return;
        }

        setClientId(currentClientId);
        setBookings(bookingData || []);
        setReviews(reviewData || []);
      } catch (error) {
        console.error("Unable to load client reviews:", error);

        if (active) {
          setErrorMessage(
            error?.message ||
            "We couldn't load your reviews. Please try again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadReviewsPage();

    return () => {
      active = false;
    };
  }, [user?.id, retry]);

  // -------------------------------------------------------------
  // Booking lookup
  // -------------------------------------------------------------

  const bookingMap = useMemo(() => {
    const map = new Map();

    bookings.forEach((booking) => {
      map.set(booking.booking_id, booking);
    });

    return map;
  }, [bookings]);

  // -------------------------------------------------------------
  // Determine completed bookings that do not yet have reviews
  // -------------------------------------------------------------

  const reviewedBookingIds = useMemo(() => {
    return new Set(reviews.map((review) => review.booking_id));
  }, [reviews]);

  const completedBookings = useMemo(() => {
    return bookings.filter(
      (booking) => booking.status === "completed"
    );
  }, [bookings]);

  const awaitingReviews = useMemo(() => {
    return completedBookings.filter(
      (booking) => !reviewedBookingIds.has(booking.booking_id)
    );
  }, [completedBookings, reviewedBookingIds]);

  // -------------------------------------------------------------
  // Enrich existing reviews with booking information
  // -------------------------------------------------------------

  const enrichedReviews = useMemo(() => {
    return reviews.map((review) => ({
      ...review,
      booking: bookingMap.get(review.booking_id) || null,
    }));
  }, [reviews, bookingMap]);

  // -------------------------------------------------------------
  // Review filtering
  // -------------------------------------------------------------

  const filteredReviews = useMemo(() => {
    if (filter === "all") {
      return enrichedReviews;
    }

    return enrichedReviews.filter((review) => review.status === filter);
  }, [enrichedReviews, filter]);

  // -------------------------------------------------------------
  // Summary statistics
  // -------------------------------------------------------------

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return "—";
    }

    const total = reviews.reduce(
      (sum, review) => sum + Number(review.rating || 0),
      0
    );

    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const pendingCount = reviews.filter(
    (review) => review.status === "pending"
  ).length;

  const approvedCount = reviews.filter(
    (review) => review.status === "approved"
  ).length;

  const rejectedCount = reviews.filter(
    (review) => review.status === "rejected"
  ).length;

  // -------------------------------------------------------------
  // Modal helpers
  // -------------------------------------------------------------

  function resetForm() {
    setSelectedBooking(null);
    setEditingReview(null);
    setRating(0);
    setHoverRating(0);
    setComment("");
    setFormError("");
    setSubmitting(false);
  }

  function closeModal() {
    if (submitting) {
      return;
    }

    setModalOpen(false);
    resetForm();
  }

  function openNewReview(booking) {
    setSuccessMessage("");
    setSelectedBooking(booking);
    setEditingReview(null);
    setRating(0);
    setHoverRating(0);
    setComment("");
    setFormError("");
    setModalOpen(true);
  }

  function openEditReview(review) {
    if (review.status !== "pending") {
      return;
    }

    setSuccessMessage("");
    setSelectedBooking(review.booking || null);
    setEditingReview(review);
    setRating(Number(review.rating));
    setHoverRating(0);
    setComment(review.comment || "");
    setFormError("");
    setModalOpen(true);
  }

  // -------------------------------------------------------------
  // Submit new/edit review
  // -------------------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setSuccessMessage("");

    if (!clientId) {
      setFormError("Your client profile could not be found.");
      return;
    }

    if (!rating || rating < 1 || rating > 5) {
      setFormError("Please select a rating between 1 and 5 stars.");
      return;
    }

    const cleanComment = comment.trim();

    if (cleanComment.length > 2000) {
      setFormError("Your review must be 2,000 characters or fewer.");
      return;
    }

    try {
      setSubmitting(true);

      // ---------------------------------------------------------
      // Editing an existing pending review
      // ---------------------------------------------------------

      if (editingReview) {
        const { data: updatedReview } = await apiUpdateClientReview(
          editingReview.review_id, rating, cleanComment
        );

        setReviews((currentReviews) =>
          currentReviews.map((review) =>
            review.review_id === updatedReview.review_id
              ? updatedReview
              : review
          )
        );

        setModalOpen(false);
        resetForm();
        setSuccessMessage("Your review has been updated.");
        return;
      }

      // ---------------------------------------------------------
      // Creating a new review
      // ---------------------------------------------------------

      if (!selectedBooking?.booking_id) {
        setFormError("The booking for this review could not be found.");
        return;
      }

      const { data: createdReview } = await apiCreateClientReview(
        selectedBooking.booking_id, rating, cleanComment
      );

      setReviews((currentReviews) => [
        createdReview,
        ...currentReviews,
      ]);

      setModalOpen(false);
      resetForm();

      setSuccessMessage(
        "Thank you. Your review has been submitted for approval."
      );
    } catch (error) {
      console.error("Unable to save review:", error);

      if (error?.message === "You have already reviewed this booking.") {
        setFormError("You have already reviewed this booking.");
      } else {
        setFormError(
          error?.message ||
          "We couldn't save your review. Please try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------

  if (loading) {
    return (
      <div className="client-reviews-page">
        <div className="client-reviews-loading">
          <div className="client-reviews-spinner"></div>
          <p>Loading your reviews...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------

  if (errorMessage) {
    return (
      <div className="client-reviews-page">
        <header className="client-reviews-header">
          <p className="client-reviews-eyebrow">Your experience</p>

          <h1>My Reviews</h1>

          <p>
            Share feedback about your photography sessions and manage
            reviews you have already submitted.
          </p>
        </header>

        <div className="client-reviews-state error">
          <BiStar size={34} aria-hidden="true" />

          <h2>Unable to load your reviews</h2>

          <p>{errorMessage}</p>

          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="client-reviews-page">
      {/* ========================================================
          HEADER
      ======================================================== */}

      <header className="client-reviews-header">
        <p className="client-reviews-eyebrow">Your experience</p>

        <h1>My Reviews</h1>

        <p>
          Share feedback about your completed photography sessions and
          manage reviews you have already submitted.
        </p>
      </header>

      {/* ========================================================
          SUCCESS MESSAGE
      ======================================================== */}

      {successMessage && (
        <div className="client-reviews-success" role="status">
          <BiCheckCircle aria-hidden="true" />

          <span>{successMessage}</span>

          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss message"
          >
            <BiX aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ========================================================
          SUMMARY
      ======================================================== */}

      <section
        className="client-reviews-summary"
        aria-label="Review summary"
      >
        <div className="client-review-stat">
          <BiCalendar aria-hidden="true" />

          <div>
            <span>Completed Sessions</span>
            <strong>{completedBookings.length}</strong>
          </div>
        </div>

        <div className="client-review-stat">
          <BiMessageSquareDetail aria-hidden="true" />

          <div>
            <span>Your Reviews</span>
            <strong>{reviews.length}</strong>
          </div>
        </div>

        <div className="client-review-stat">
          <BiEdit aria-hidden="true" />

          <div>
            <span>Awaiting Review</span>
            <strong>{awaitingReviews.length}</strong>
          </div>
        </div>

        <div className="client-review-stat">
          <BiStar aria-hidden="true" />

          <div>
            <span>Average Rating</span>
            <strong>{averageRating}</strong>
          </div>
        </div>
      </section>

      {/* ========================================================
          AWAITING REVIEWS
      ======================================================== */}

      {awaitingReviews.length > 0 && (
        <section className="client-reviews-section">
          <div className="client-reviews-section-heading">
            <div>
              <h2>Awaiting Your Review</h2>

              <p>
                Tell your photographer about your experience after a
                completed session.
              </p>
            </div>

            <span>{awaitingReviews.length}</span>
          </div>

          <div className="client-awaiting-list">
            {awaitingReviews.map((booking) => (
              <article
                className="client-awaiting-card"
                key={booking.booking_id}
              >
                <div className="client-awaiting-icon">
                  <BiStar aria-hidden="true" />
                </div>

                <div className="client-awaiting-info">
                  <h3>
                    {booking.services?.name ||
                      "Photography Session"}
                  </h3>

                  <div className="client-awaiting-meta">
                    <span>
                      <BiCalendar aria-hidden="true" />
                      {formatDate(booking.booking_date)}
                    </span>

                    {booking.location && (
                      <span>{booking.location}</span>
                    )}
                  </div>

                  <p>
                    How was your photography experience? Your feedback
                    helps your photographer understand what went well.
                  </p>
                </div>

                <button
                  type="button"
                  className="client-review-primary-button"
                  onClick={() => openNewReview(booking)}
                >
                  Leave a Review
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================
          EXISTING REVIEWS
      ======================================================== */}

      <section className="client-reviews-section">
        <div className="client-reviews-section-heading">
          <div>
            <h2>Your Reviews</h2>

            <p>
              View the feedback you've submitted for your photography
              sessions.
            </p>
          </div>
        </div>

        {/* FILTERS */}

        {reviews.length > 0 && (
          <div className="client-review-filters">
            {REVIEW_FILTERS.map((value) => {
              let count = reviews.length;

              if (value === "pending") {
                count = pendingCount;
              }

              if (value === "approved") {
                count = approvedCount;
              }

              if (value === "rejected") {
                count = rejectedCount;
              }

              return (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value === "all"
                    ? "All"
                    : getStatusLabel(value)}

                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* EMPTY STATE */}

        {reviews.length === 0 ? (
          <div className="client-reviews-state">
            <BiStar size={34} aria-hidden="true" />

            <h2>No reviews yet</h2>

            <p>
              Once you complete a photography session, you'll be able
              to leave feedback for your photographer here.
            </p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="client-reviews-state compact">
            <BiStar size={30} aria-hidden="true" />

            <h2>No reviews in this category</h2>

            <p>Try selecting a different review status.</p>

            <button
              type="button"
              onClick={() => setFilter("all")}
            >
              View All Reviews
            </button>
          </div>
        ) : (
          <div className="client-review-list">
            {filteredReviews.map((review) => {
              const booking = review.booking;

              return (
                <article
                  className="client-review-card"
                  key={review.review_id}
                >
                  <div className="client-review-card-top">
                    <div>
                      <span className="client-review-session-label">
                        Photography Session
                      </span>

                      <h3>
                        {booking?.services?.name ||
                          "Photography Session"}
                      </h3>
                    </div>

                    <span
                      className="client-review-status"
                      data-status={review.status}
                    >
                      {getStatusLabel(review.status)}
                    </span>
                  </div>

                  <div className="client-review-session-meta">
                    <span>
                      <BiCalendar aria-hidden="true" />

                      {booking?.booking_date
                        ? formatDate(booking.booking_date)
                        : "Session date unavailable"}
                    </span>

                    {booking?.location && (
                      <span>{booking.location}</span>
                    )}
                  </div>

                  <StarDisplay rating={Number(review.rating)} />

                  {review.comment ? (
                    <blockquote className="client-review-comment">
                      “{review.comment}”
                    </blockquote>
                  ) : (
                    <p className="client-review-no-comment">
                      No written comment was provided with this rating.
                    </p>
                  )}

                  {review.status === "pending" && (
                    <div className="client-review-notice pending">
                      Your review is waiting for your photographer to
                      approve it for public display. You can edit it
                      while it is pending.
                    </div>
                  )}

                  {review.status === "approved" && (
                    <div className="client-review-notice approved">
                      This review has been approved and may be displayed
                      publicly by your photographer.
                    </div>
                  )}

                  {review.status === "rejected" && (
                    <div className="client-review-notice rejected">
                      This review isn't currently displayed publicly.
                    </div>
                  )}

                  <div className="client-review-card-footer">
                    <span>
                      Submitted {formatTimestamp(review.created_at)}
                    </span>

                    {review.status === "pending" && (
                      <button
                        type="button"
                        className="client-review-edit-button"
                        onClick={() => openEditReview(review)}
                      >
                        <BiEdit aria-hidden="true" />
                        Edit Review
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ========================================================
          REVIEW MODAL
      ======================================================== */}

      {modalOpen && (
        <div
          className="client-review-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            className="client-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-review-modal-title"
          >
            <div className="client-review-modal-header">
              <div>
                <p className="client-review-modal-eyebrow">
                  {editingReview
                    ? "Update your feedback"
                    : "Share your experience"}
                </p>

                <h2 id="client-review-modal-title">
                  {editingReview
                    ? "Edit Review"
                    : "Leave a Review"}
                </h2>
              </div>

              <button
                type="button"
                className="client-review-modal-close"
                onClick={closeModal}
                disabled={submitting}
                aria-label="Close review form"
              >
                <BiX aria-hidden="true" />
              </button>
            </div>

            <div className="client-review-modal-session">
              <BiCalendar aria-hidden="true" />

              <div>
                <span>Photography Session</span>

                <strong>
                  {selectedBooking?.services?.name ||
                    "Photography Session"}
                </strong>

                {selectedBooking?.booking_date && (
                  <small>
                    {formatDate(selectedBooking.booking_date)}
                  </small>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <fieldset
                className="client-review-rating-fieldset"
                disabled={submitting}
              >
                <legend>Your rating</legend>

                <p>
                  Select the number of stars that best represents your
                  experience.
                </p>

                <div
                  className="client-review-rating-buttons"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const activeRating = hoverRating || rating;
                    const selected = star <= activeRating;

                    return (
                      <button
                        type="button"
                        key={star}
                        className={selected ? "selected" : ""}
                        onMouseEnter={() => setHoverRating(star)}
                        onFocus={() => setHoverRating(star)}
                        onBlur={() => setHoverRating(0)}
                        onClick={() => setRating(star)}
                        aria-label={`${star} ${star === 1 ? "star" : "stars"
                          }`}
                        aria-pressed={rating === star}
                      >
                        <BiStar aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>

                <div className="client-review-rating-text">
                  {rating
                    ? `${rating} out of 5`
                    : "No rating selected"}
                </div>
              </fieldset>

              <label className="client-review-comment-field">
                <span>Tell us about your experience</span>

                <small>
                  Optional — share anything you think would be useful
                  to your photographer.
                </small>

                <textarea
                  rows="6"
                  maxLength="2000"
                  value={comment}
                  onChange={(event) =>
                    setComment(event.target.value)
                  }
                  placeholder="Write your review..."
                  disabled={submitting}
                />

                <span className="client-review-character-count">
                  {comment.length} / 2000
                </span>
              </label>

              <div className="client-review-form-info">
                <BiMessageSquareDetail aria-hidden="true" />

                <p>
                  Your review will be submitted to your photographer
                  for approval before it can be displayed publicly.
                </p>
              </div>

              {formError && (
                <div className="client-review-form-error" role="alert">
                  {formError}
                </div>
              )}

              <div className="client-review-modal-actions">
                <button
                  type="button"
                  className="client-review-secondary-button"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="client-review-primary-button"
                  disabled={submitting || rating === 0}
                >
                  {submitting
                    ? "Saving..."
                    : editingReview
                      ? "Save Changes"
                      : "Submit Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}