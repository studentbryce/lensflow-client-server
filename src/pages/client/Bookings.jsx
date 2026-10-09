import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BiCalendar as CalendarDays, BiTimeFive as Clock, BiMap as MapPin, BiSearch as Search } from "react-icons/bi";
import { useAuth } from "../../context/AuthContext";
import { apiGetClientBookings } from "../../services/clientBookingApi";
import "./Bookings.css";

const STATUSES = ["ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "DECLINED"];

function formatDate(value, options = { day: "numeric", month: "short", year: "numeric" }) {
  const date = value ? new Date(`${value}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-NZ", options)
    : "Date to be confirmed";
}

function formatTime(value) {
  if (!value) return "Time to be confirmed";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return "Time to be confirmed";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "pm" : "am"}`;
}

function isUpcoming(booking, today) {
  return ["pending", "confirmed"].includes(booking.status) && booking.booking_date >= today;
}

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadBookings() {
      setLoading(true);
      setError("");
      setBookings([]);
      try {
        if (!user?.id) throw new Error("Please sign in to view your bookings.");
        const { data } = await apiGetClientBookings();
        if (active) setBookings(data || []);
      } catch (err) {
        console.error("Unable to load client bookings:", err);
        if (active) setError("We couldn't load your bookings. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBookings();
    return () => { active = false; };
  }, [user?.id, retry]);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const filtered = bookings.filter((booking) =>
    (status === "all" || booking.status === status) &&
    [booking.services?.name, booking.location, formatDate(booking.booking_date)]
      .filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase())
  );
  const upcoming = filtered.filter((booking) => isUpcoming(booking, today));
  const other = filtered.filter((booking) => !isUpcoming(booking, today)).reverse();
  const summaries = [
    ["Total bookings", bookings.length],
    ["Upcoming", bookings.filter((booking) => isUpcoming(booking, today)).length],
    ["Pending", bookings.filter((booking) => booking.status === "pending").length],
    ["Completed", bookings.filter((booking) => booking.status === "completed").length],
  ];

  return (
    <div className="client-bookings-page">
      <header className="client-bookings-header">
        <div className="client-bookings-header-main">
          <p className="client-bookings-eyebrow">Your photography</p>
          <h1>My Bookings</h1>
          <p>Keep track of your upcoming sessions and revisit your booking history.</p>
        </div>
        <Link className="client-booking-button" to="/client/bookings/new">+ New Booking</Link>
      </header>

      {loading ? (
        <div className="client-bookings-state" role="status">Loading your bookings…</div>
      ) : error ? (
        <div className="client-bookings-state" role="alert">
          <h2>Unable to load your bookings</h2>
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>
      ) : (
        <>
          <section className="client-bookings-summary" aria-label="Booking summary">
            {summaries.map(([label, count]) => (
              <div className="client-bookings-stat" key={label}>
                <CalendarDays size={23} aria-hidden="true" />
                <div><span>{label}</span><strong>{count}</strong></div>
              </div>
            ))}
          </section>

          <div className="client-bookings-toolbar">
            <label className="client-bookings-search">
              <Search size={18} aria-hidden="true" />
              <input type="search" aria-label="Search bookings" placeholder="Search by session, location or date…"
                value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className="client-bookings-filters" role="group" aria-label="Filter by booking status">
              {STATUSES.map((value) => (
                <button type="button" key={value} aria-pressed={status === value.toLowerCase()}
                  onClick={() => setStatus(value.toLowerCase())}>{value}</button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="client-bookings-state" role="status">
              <CalendarDays size={32} aria-hidden="true" />
              <h2>{bookings.length ? "No matching bookings" : "No bookings yet"}</h2>
              <p>{bookings.length ? "Try another search or status filter." : "Your sessions will appear here once a booking has been arranged with your photographer."}</p>
              {bookings.length > 0 && <button type="button" onClick={() => { setSearch(""); setStatus("all"); }}>Clear filters</button>}
            </div>
          ) : [ ["Upcoming sessions", upcoming], ["Booking history & other sessions", other] ].map(([title, items]) => items.length > 0 && (
            <section className="client-bookings-section" key={title}>
              <h2>{title} <span>{items.length}</span></h2>
              <div className="client-bookings-list">
                {items.map((booking) => (
                  <article className="client-bookings-card" key={booking.booking_id}>
                    <div className="client-bookings-date" aria-label={`${formatDate(booking.booking_date)}, ${formatTime(booking.start_time)}`}>
                      <span className="client-bookings-day">
                        {formatDate(booking.booking_date, { day: "2-digit" })} 
                      </span>
                      <span className="client-bookings-month">
                        {formatDate(booking.booking_date, { month: "short" })}
                      </span>
                    </div>
                    <div className="client-bookings-info">
                      <h3>{booking.services?.name || "Photography session"}</h3>
                      <p><Clock size={15} aria-hidden="true" />{formatTime(booking.start_time)}{booking.end_time ? ` – ${formatTime(booking.end_time)}` : ""}</p>
                      <p><MapPin size={15} aria-hidden="true" />{booking.location || "Location to be confirmed"}</p>
                    </div>
                    <div className="client-bookings-meta">
                      <span className="client-bookings-status" data-status={booking.status}>{booking.status || "Unknown"}</span>
                      <strong>{booking.total_amount == null ? "Price to be confirmed" : new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(booking.total_amount)}</strong>
                      <Link className="client-booking-button client-booking-button-secondary" to={`/client/bookings/${booking.booking_id}`}>View</Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
