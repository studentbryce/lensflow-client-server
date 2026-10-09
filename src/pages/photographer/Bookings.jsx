import { useEffect, useMemo, useState } from "react";
import { apiGetBookings } from "../../services/bookingApi";
import { useNavigate } from "react-router-dom";
import "./Bookings.css";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Declined", value: "declined" },
];

export default function Bookings() {
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    setLoading(true);
    setError("");

    try {
      // The API returns booking relationships and RLS-visible client profiles.
      // All booking reads now pass through Express rather than direct Supabase queries.
      const response = await apiGetBookings();
      setBookings(response.data ?? []);
      setLimitReached(Boolean(response.meta?.limit && response.meta.returned >= response.meta.limit));
    } catch (err) {
      setLimitReached(false);
      console.error("Error loading bookings:", err);
      setError(err.message || "Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  }

  const filteredBookings = useMemo(() => {
    if (activeFilter === "all") {
      return bookings;
    }

    return bookings.filter(
      (booking) => booking.status === activeFilter
    );
  }, [bookings, activeFilter]);

  const upcomingBookings = filteredBookings.filter((booking) => {
    const bookingDate = new Date(
      `${booking.booking_date}T${booking.start_time}`
    );

    return bookingDate >= new Date();
  });

  const pastBookings = filteredBookings.filter((booking) => {
    const bookingDate = new Date(
      `${booking.booking_date}T${booking.start_time}`
    );

    return bookingDate < new Date();
  });

  function formatDate(dateString) {
    return new Date(`${dateString}T00:00:00`).toLocaleDateString(
      "en-NZ",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  function formatTime(timeString) {
    if (!timeString) return "";

    const [hours, minutes] = timeString.split(":");

    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return date.toLocaleTimeString("en-NZ", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getClientName(booking) {
    const profile = booking.photographerClientProfile;

    if (!profile) {
      return "Unknown Client";
    }

    return `${profile.first_name} ${profile.last_name}`.trim();
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
    }).format(amount || 0);
  }

  function getStatusClass(status) {
    return `status status-${status}`;
  }

  function BookingCard({ booking }) {
    return (
      <article className="booking-card">
        <div className="booking-date">
          <span className="booking-day">
            {new Date(
              `${booking.booking_date}T00:00:00`
            ).toLocaleDateString("en-NZ", {
              day: "2-digit",
            })}
          </span>

          <span className="booking-month">
            {new Date(
              `${booking.booking_date}T00:00:00`
            ).toLocaleDateString("en-NZ", {
              month: "short",
            })}
          </span>
        </div>

        <div className="booking-main">
          <div className="booking-time">
            {formatTime(booking.start_time)}
            <span>–</span>
            {formatTime(booking.end_time)}
          </div>

          <h3>{getClientName(booking)}</h3>

          <p className="booking-service">
            {booking.services?.name || "Unknown Service"}
          </p>

          {booking.location && (
            <p className="booking-location">
              {booking.location}
            </p>
          )}
        </div>

        <div className="booking-meta">
          <span className={getStatusClass(booking.status)}>
            {booking.status}
          </span>

          <strong>
            {formatCurrency(booking.total_amount)}
          </strong>

          <button
            type="button"
            className="booking-view-button"
            onClick={() =>
              navigate(
                `/photographer/bookings/${booking.booking_id}`
              )
            }
          >
            View
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="bookings-page">

      <header className="bookings-header">
        <div>
          <p className="page-eyebrow">LensFlow</p>
          <h1>Bookings</h1>
          <p className="page-description">
            Manage your photography bookings and upcoming sessions.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/photographer/bookings/new")}
        >
          + New Booking
        </button>
      </header>

      <nav className="booking-filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={
              activeFilter === filter.value
                ? "filter-button active"
                : "filter-button"
            }
            onClick={() => setActiveFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </nav>

      {!loading && !error && limitReached && (
        <p role="status" className="page-description">
          Showing the first 100 bookings. API pagination will be added in a later milestone.
        </p>
      )}

      {loading && (
        <div className="booking-state">
          <p>Loading bookings...</p>
        </div>
      )}

      {!loading && error && (
        <div className="booking-state error-state">
          <h2>Unable to load bookings</h2>
          <p>{error}</p>

          <button
            type="button"
            className="secondary-button"
            onClick={fetchBookings}
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filteredBookings.length === 0 && (
        <div className="booking-state">
          <div className="empty-icon">◇</div>
          <h2>No bookings found</h2>
          <p>
            There are no bookings matching the selected filter.
          </p>
        </div>
      )}

      {!loading && !error && filteredBookings.length > 0 && (
        <>
          {upcomingBookings.length > 0 && (
            <section className="booking-section">
              <div className="section-heading">
                <div>
                  <p className="section-eyebrow">Your schedule</p>
                  <h2>Upcoming Bookings</h2>
                </div>

                <span className="booking-count">
                  {upcomingBookings.length}
                </span>
              </div>

              <div className="booking-list">
                {upcomingBookings.map((booking) => (
                  <BookingCard
                    key={booking.booking_id}
                    booking={booking}
                  />
                ))}
              </div>
            </section>
          )}

          {pastBookings.length > 0 && (
            <section className="booking-section past-section">
              <div className="section-heading">
                <div>
                  <p className="section-eyebrow">History</p>
                  <h2>Past Bookings</h2>
                </div>

                <span className="booking-count">
                  {pastBookings.length}
                </span>
              </div>

              <div className="booking-list">
                {pastBookings.map((booking) => (
                  <BookingCard
                    key={booking.booking_id}
                    booking={booking}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

    </div>
  );
}
