import { useEffect, useMemo, useState } from "react";
import {
  BiCalendar,
  BiCheckCircle,
  BiMessageSquareDetail,
  BiStar,
  BiTimeFive,
  BiX,
} from "react-icons/bi";
import { useAuth } from "../../context/authStore";
import { apiGetPhotographerReviews, apiModeratePhotographerReview } from "../../services/photographerReviewsApi";
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

function getClientName(client) {
  const profile = client?.profiles;

  const firstName = profile?.first_name?.trim() || "";
  const lastName = profile?.last_name?.trim() || "";

  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || "LensFlow Client";
}

function StarDisplay({ rating }) {
  return (
    <div
      className="photographer-review-stars"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <BiStar
          key={star}
          className={star <= rating ? "filled" : ""}
          aria-hidden="true"
        />
      ))}

      <span>{rating}.0</span>
    </div>
  );
}

export default function Reviews() {
  const { user } = useAuth();

  const [reviews, setReviews] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [filter, setFilter] = useState("all");
  const [moderatingId, setModeratingId] = useState(null);

  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadReviews() {
      try {
        setLoading(true);
        setErrorMessage("");

        if (!user?.id) {
          throw new Error("Please sign in to manage your reviews.");
        }

        // All review, client and booking data comes from the authenticated Express API.
        const result = await apiGetPhotographerReviews();
        const enrichedReviews = result?.data?.reviews || [];

        if (!active) {
          return;
        }

        setReviews(enrichedReviews);
      } catch (error) {
        console.error("Unable to load photographer reviews:", error);

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

    loadReviews();

    return () => {
      active = false;
    };
  }, [user?.id, retry]);

  // -------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------

  const filteredReviews = useMemo(() => {
    if (filter === "all") {
      return reviews;
    }

    return reviews.filter((review) => review.status === filter);
  }, [reviews, filter]);

  // -------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------

  const pendingCount = reviews.filter(
    (review) => review.status === "pending"
  ).length;

  const approvedCount = reviews.filter(
    (review) => review.status === "approved"
  ).length;

  const rejectedCount = reviews.filter(
    (review) => review.status === "rejected"
  ).length;

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

  // -------------------------------------------------------------
  // Moderate review
  // -------------------------------------------------------------

  async function moderateReview(review, newStatus) {
    if (!review?.review_id) {
      return;
    }

    if (!["approved", "rejected"].includes(newStatus)) {
      return;
    }

    try {
      setModeratingId(review.review_id);
      setErrorMessage("");
      setSuccessMessage("");

      // Express verifies JWT, role and review ownership, then calls the existing
      // auth-scoped moderate_review RPC. Never send moderation directly from React.
      const result = await apiModeratePhotographerReview(review.review_id, newStatus);
      const moderatedReview = result?.data;

      setReviews((currentReviews) =>
        currentReviews.map((currentReview) =>
          currentReview.review_id === review.review_id
            ? {
                ...currentReview,
                status: moderatedReview?.status || newStatus,
                updated_at:
                  moderatedReview?.updated_at ||
                  new Date().toISOString(),
              }
            : currentReview
        )
      );

      setSuccessMessage(
        newStatus === "approved"
          ? "The review has been approved and is now published."
          : "The review has been marked as not published."
      );
    } catch (error) {
      console.error("Unable to moderate review:", error);

      setErrorMessage(
        error?.message ||
          "We couldn't update this review. Please try again."
      );
    } finally {
      setModeratingId(null);
    }
  }

  // -------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------

  if (loading) {
    return (
      <div className="photographer-reviews-page">
        <div className="photographer-reviews-loading">
          <div className="photographer-reviews-spinner"></div>
          <p>Loading your reviews...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Initial page error
  // -------------------------------------------------------------

  if (errorMessage && reviews.length === 0) {
    return (
      <div className="photographer-reviews-page">
        <header className="photographer-reviews-header">
          <p className="photographer-reviews-eyebrow">
            Reviews &amp; feedback
          </p>

          <h1>Reviews</h1>

          <p>
            Manage feedback from your clients and choose which reviews
            can be displayed publicly.
          </p>
        </header>

        <div className="photographer-reviews-state error">
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
    <div className="photographer-reviews-page">
      {/* ========================================================
          HEADER
      ======================================================== */}

      <header className="photographer-reviews-header">
        <p className="photographer-reviews-eyebrow">
          Reviews &amp; feedback
        </p>

        <h1>Reviews</h1>

        <p>
          Manage feedback from your clients and choose which reviews
          can be displayed publicly.
        </p>
      </header>

      {/* ========================================================
          SUCCESS / ERROR MESSAGES
      ======================================================== */}

      {successMessage && (
        <div className="photographer-reviews-message success" role="status">
          <BiCheckCircle aria-hidden="true" />

          <span>{successMessage}</span>

          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setSuccessMessage("")}
          >
            <BiX aria-hidden="true" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="photographer-reviews-message error" role="alert">
          <BiX aria-hidden="true" />

          <span>{errorMessage}</span>

          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setErrorMessage("")}
          >
            <BiX aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ========================================================
          SUMMARY
      ======================================================== */}

      <section
        className="photographer-reviews-summary"
        aria-label="Review summary"
      >
        <div className="photographer-review-stat">
          <BiMessageSquareDetail aria-hidden="true" />

          <div>
            <span>Total Reviews</span>
            <strong>{reviews.length}</strong>
          </div>
        </div>

        <div className="photographer-review-stat">
          <BiStar aria-hidden="true" />

          <div>
            <span>Average Rating</span>
            <strong>{averageRating}</strong>
          </div>
        </div>

        <div className="photographer-review-stat">
          <BiTimeFive aria-hidden="true" />

          <div>
            <span>Pending</span>
            <strong>{pendingCount}</strong>
          </div>
        </div>

        <div className="photographer-review-stat">
          <BiCheckCircle aria-hidden="true" />

          <div>
            <span>Published</span>
            <strong>{approvedCount}</strong>
          </div>
        </div>
      </section>

      {/* ========================================================
          REVIEWS
      ======================================================== */}

      <section className="photographer-reviews-section">
        <div className="photographer-reviews-section-heading">
          <div>
            <h2>Client Reviews</h2>

            <p>
              Approve reviews for public display or keep them private.
            </p>
          </div>
        </div>

        {/* FILTERS */}

        {reviews.length > 0 && (
          <div
            className="photographer-review-filters"
            role="group"
            aria-label="Filter reviews by status"
          >
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
          <div className="photographer-reviews-state">
            <BiStar size={34} aria-hidden="true" />

            <h2>No reviews yet</h2>

            <p>
              Client reviews will appear here after completed
              photography sessions.
            </p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="photographer-reviews-state compact">
            <BiStar size={30} aria-hidden="true" />

            <h2>No reviews in this category</h2>

            <p>Try selecting a different moderation status.</p>

            <button
              type="button"
              onClick={() => setFilter("all")}
            >
              View All Reviews
            </button>
          </div>
        ) : (
          <div className="photographer-review-list">
            {filteredReviews.map((review) => {
              const booking = review.booking;
              const clientName = getClientName(review.client);
              const isModerating =
                moderatingId === review.review_id;

              return (
                <article
                  className="photographer-review-card"
                  key={review.review_id}
                >
                  {/* TOP */}

                  <div className="photographer-review-card-top">
                    <div>
                      <StarDisplay rating={Number(review.rating)} />

                      <h3>{clientName}</h3>
                    </div>

                    <span
                      className="photographer-review-status"
                      data-status={review.status}
                    >
                      {getStatusLabel(review.status)}
                    </span>
                  </div>

                  {/* BOOKING DETAILS */}

                  <div className="photographer-review-booking">
                    <div>
                      <span>Service</span>

                      <strong>
                        {booking?.services?.name ||
                          "Photography Session"}
                      </strong>
                    </div>

                    <div>
                      <span>Session</span>

                      <strong>
                        {booking?.booking_date
                          ? formatDate(booking.booking_date)
                          : "Date unavailable"}
                      </strong>
                    </div>

                    {booking?.location && (
                      <div>
                        <span>Location</span>
                        <strong>{booking.location}</strong>
                      </div>
                    )}
                  </div>

                  {/* COMMENT */}

                  {review.comment ? (
                    <blockquote className="photographer-review-comment">
                      “{review.comment}”
                    </blockquote>
                  ) : (
                    <p className="photographer-review-no-comment">
                      This client submitted a rating without a written
                      comment.
                    </p>
                  )}

                  {/* STATUS EXPLANATION */}

                  {review.status === "pending" && (
                    <div className="photographer-review-notice pending">
                      <BiTimeFive aria-hidden="true" />

                      <p>
                        This review is waiting for moderation. Approve
                        it to make it available for public display, or
                        mark it as not published.
                      </p>
                    </div>
                  )}

                  {review.status === "approved" && (
                    <div className="photographer-review-notice approved">
                      <BiCheckCircle aria-hidden="true" />

                      <p>
                        This review is approved and available for
                        public display.
                      </p>
                    </div>
                  )}

                  {review.status === "rejected" && (
                    <div className="photographer-review-notice rejected">
                      <BiX aria-hidden="true" />

                      <p>
                        This review is currently not available for
                        public display.
                      </p>
                    </div>
                  )}

                  {/* FOOTER */}

                  <div className="photographer-review-card-footer">
                    <div className="photographer-review-submitted">
                      <BiCalendar aria-hidden="true" />

                      <span>
                        Submitted {formatTimestamp(review.created_at)}
                      </span>
                    </div>

                    <div className="photographer-review-actions">
                      {/* Pending */}

                      {review.status === "pending" && (
                        <>
                          <button
                            type="button"
                            className="photographer-review-button reject"
                            disabled={isModerating}
                            onClick={() =>
                              moderateReview(review, "rejected")
                            }
                          >
                            {isModerating
                              ? "Updating..."
                              : "Not Published"}
                          </button>

                          <button
                            type="button"
                            className="photographer-review-button approve"
                            disabled={isModerating}
                            onClick={() =>
                              moderateReview(review, "approved")
                            }
                          >
                            <BiCheckCircle aria-hidden="true" />

                            {isModerating
                              ? "Updating..."
                              : "Approve"}
                          </button>
                        </>
                      )}

                      {/* Approved */}

                      {review.status === "approved" && (
                        <button
                          type="button"
                          className="photographer-review-button reject"
                          disabled={isModerating}
                          onClick={() =>
                            moderateReview(review, "rejected")
                          }
                        >
                          {isModerating
                            ? "Updating..."
                            : "Unpublish"}
                        </button>
                      )}

                      {/* Rejected */}

                      {review.status === "rejected" && (
                        <button
                          type="button"
                          className="photographer-review-button approve"
                          disabled={isModerating}
                          onClick={() =>
                            moderateReview(review, "approved")
                          }
                        >
                          <BiCheckCircle aria-hidden="true" />

                          {isModerating
                            ? "Updating..."
                            : "Approve"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}