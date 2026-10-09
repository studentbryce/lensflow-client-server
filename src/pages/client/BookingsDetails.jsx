import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiGetClientBookingById } from "../../services/clientBookingApi";
import { formatCurrency, formatDate, formatTime } from "./bookingHelpers";
import "./Bookings.css";

export default function BookingsDetails() {
  const { user } = useAuth();
  const { booking_id } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setBooking(null);
      setError("");
      try {
        if (!user?.id) throw new Error("Please sign in to view your booking.");
        try {
          const { data } = await apiGetClientBookingById(booking_id);
          if (active) setBooking(data);
        } catch (requestError) {
          if (requestError.status === 404 || requestError.message === "Booking not found.") {
            if (active) setBooking(null);
          } else {
            throw requestError;
          }
        }
      } catch (err) {
        console.error("Unable to load client booking:", err);
        if (active) setError("We couldn't load this booking. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user?.id, booking_id, retry]);

  return (
    <div className="client-bookings-page">
      <Link className="client-booking-back" to="/client/bookings">← Back to My Bookings</Link>
      <header className="client-bookings-header">
        <p className="client-bookings-eyebrow">Your photography</p>
        <h1>Booking Details</h1>
        <p>Everything you need to know about your session.</p>
      </header>
      {loading ? <div className="client-bookings-state" role="status">Loading your booking…</div> :
        error ? <div className="client-bookings-state" role="alert"><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>Try again</button></div> :
        !booking ? <div className="client-bookings-state"><h2>Booking not found</h2><p>This booking is unavailable or does not belong to your account.</p></div> : (
          <>
            <div className="client-booking-detail-grid">
              <section className="client-booking-panel">
                <p className="client-bookings-eyebrow">Session information</p>
                <h2>{booking.services?.name || "Photography session"}</h2>
                <span className="client-bookings-status" data-status={booking.status}>{booking.status || "Unknown"}</span>
                <dl className="client-booking-facts">
                  <div><dt>Date</dt><dd>{formatDate(booking.booking_date)}</dd></div>
                  <div><dt>Time</dt><dd>{formatTime(booking.start_time)}{booking.end_time && ` – ${formatTime(booking.end_time)}`}</dd></div>
                  <div><dt>Total</dt><dd>{formatCurrency(booking.total_amount)}</dd></div>
                </dl>
                {booking.status === "pending" && <p>Your request is awaiting confirmation from your photographer.</p>}
              </section>
              <section className="client-booking-panel">
                <p className="client-bookings-eyebrow">Service</p>
                <h2>About your session</h2>
                <p>{booking.services?.description || "Contact your photographer for more information about your session."}</p>
                {booking.services?.duration_minutes > 0 && <p>Service duration: {booking.services.duration_minutes} minutes</p>}
              </section>
              <section className="client-booking-panel">
                <p className="client-bookings-eyebrow">Location</p>
                <h2>Where to meet</h2>
                <p>{booking.location || "Location to be confirmed with your photographer."}</p>
                {booking.location && <a className="client-booking-back" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.location)}`} target="_blank" rel="noopener noreferrer">Open in Google Maps →</a>}
              </section>
              <section className="client-booking-panel">
                <p className="client-bookings-eyebrow">Booking notes</p>
                <h2>Session requirements</h2>
                <p className="client-booking-notes">{booking.notes || "No notes have been added to this booking."}</p>
              </section>
            </div>
            <p className="client-booking-help">Need to change your session? Please contact your photographer to arrange any changes.</p>
          </>
        )}
    </div>
  );
}
