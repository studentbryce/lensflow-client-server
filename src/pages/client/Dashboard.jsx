import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGetClientDashboard } from "../../services/clientAccountApi";
import { localToday } from "./bookingHelpers";
import StatCard from "../../components/dashboard/StatCard";
import "./Dashboard.css";
import { BiImage } from "react-icons/bi";

export default function Dashboard() {
  const [profile, setProfile] = useState(null);

  const [stats, setStats] = useState({
    bookings: 0,
    upcomingBookings: 0,
    outstanding: 0,
    galleries: 0,
  });

  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [recentGalleries, setRecentGalleries] = useState([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        // Milestone 11A: database access is through the authenticated Express API.
        const { data } = await apiGetClientDashboard(localToday());
        if (cancelled) return;
        setProfile(data.profile);
        setStats(data.stats);
        setUpcomingBookings(data.upcomingBookings);
        setOutstandingInvoices(data.outstandingInvoices);
        setRecentGalleries(data.recentGalleries);
      } catch (err) {
        if (cancelled) return;
        console.error("Client dashboard error:", err);
        setError(err.message || "Unable to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    return () => { cancelled = true; };
  }, []);

  // -----------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------

  if (loading) {
    return (
      <div className="dashboard-page client-dashboard-page">
        <div className="dashboard-loading">
          Loading your dashboard...
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Error state
  // -----------------------------------------------------------

  if (error) {
    return (
      <div className="dashboard-page client-dashboard-page">
        <div className="dashboard-error">
          <h2>Unable to load dashboard</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Dashboard
  // -----------------------------------------------------------

  const firstName = profile?.first_name || "there";

  return (
    <div className="dashboard-page client-dashboard-page">

      {/* -----------------------------------------------------
          Welcome Header
      ----------------------------------------------------- */}

      <section className="client-welcome">

        <div>
          <span className="eyebrow">
            Welcome back
          </span>

          <h1>
            Hello, {firstName}
          </h1>

          <p>
            Here is an overview of your photography sessions,
            galleries and invoices.
          </p>
        </div>

      </section>

      {/* -----------------------------------------------------
          Statistics
      ----------------------------------------------------- */}

      <section className="dashboard-stats">

        <StatCard
          title="Upcoming Bookings"
          value={stats.upcomingBookings}
          description="Scheduled sessions"
        />

        <StatCard
          title="Total Bookings"
          value={stats.bookings}
          description="Your photography sessions"
        />

        <StatCard
          title="Outstanding"
          value={`$${stats.outstanding.toFixed(2)}`}
          description="Unpaid invoices"
        />

        <StatCard
          title="Galleries"
          value={stats.galleries}
          description="Published galleries"
        />

      </section>

      {/* -----------------------------------------------------
          Upcoming Bookings
      ----------------------------------------------------- */}

      <section className="dashboard-section">

        <div className="section-heading">

          <div>
            <span className="eyebrow">
              Your schedule
            </span>

            <h2>
              Upcoming Bookings
            </h2>
          </div>

          <Link className="dashboard-view-all" to="/client/bookings">
            View all
          </Link>

        </div>

        {upcomingBookings.length === 0 ? (

          <div className="empty-state">
            <h3>No upcoming bookings</h3>

            <p>
              You don't currently have any upcoming
              photography sessions.
            </p>
          </div>

        ) : (

          <div className="booking-list">

            {upcomingBookings.map((booking) => (

              <div
                className="booking-row"
                key={booking.booking_id}
              >

                <div className="booking-date">

                  <strong>
                    {new Date(
                      `${booking.booking_date}T00:00:00`
                    ).toLocaleDateString(
                      "en-NZ",
                      {
                        day: "2-digit",
                        month: "short",
                      }
                    )}
                  </strong>

                  <span>
                    {booking.start_time?.slice(0, 5)}
                  </span>

                </div>

                <div className="booking-client">

                  <strong>
                    {booking.services?.name ||
                      "Photography Session"}
                  </strong>

                  <span>
                    {booking.end_time
                      ? `${booking.start_time?.slice(
                        0,
                        5
                      )} – ${booking.end_time.slice(
                        0,
                        5
                      )}`
                      : "Scheduled session"}
                  </span>

                </div>

                <div className="booking-amount">

                  $
                  {Number(
                    booking.total_amount || 0
                  ).toFixed(2)}

                </div>

                <div className="booking-status">

                  <span
                    className={`status status-${booking.status}`}
                  >
                    {booking.status}
                  </span>

                </div>
              </div>

            ))}

          </div>

        )}

      </section>

      {/* -----------------------------------------------------
          Lower Dashboard Content
      ----------------------------------------------------- */}

      <div className="client-dashboard-grid">

        {/* ---------------------------------------------------
            Recent Galleries
        --------------------------------------------------- */}

        <section className="dashboard-section client-dashboard-card">

          <div className="section-heading">

            <div>
              <span className="eyebrow">
                Your photos
              </span>

              <h2>
                Recent Galleries
              </h2>
            </div>

            <Link className="dashboard-view-all" to="/client/galleries">
              View all
            </Link>

          </div>

          {recentGalleries.length === 0 ? (

            <div className="empty-state">
              <h3>No galleries yet</h3>

              <p>
                Your photographer has not published any
                galleries for you yet.
              </p>
            </div>

          ) : (

            <div className="client-gallery-list">

              {recentGalleries.map((gallery) => (

                <div
                  className="client-gallery-row"
                  key={gallery.gallery_id}
                >

                  <div className="client-gallery-icon">
                    <span><BiImage/></span>
                  </div>

                  <div className="client-gallery-info">

                    <strong>
                      {gallery.name}
                    </strong>

                    <span>
                      {gallery.description ||
                        "Photography gallery"}
                    </span>

                  </div>

                  <div className="gallery-access">
                    <span className="status status-confirmed">
                      Available
                    </span>
                  </div>

                </div>

              ))}

            </div>

          )}

        </section>

        {/* ---------------------------------------------------
            Outstanding Invoices
        --------------------------------------------------- */}

        <section className="dashboard-section client-dashboard-card">

          <div className="section-heading">

            <div>
              <span className="eyebrow">
                Payments
              </span>

              <h2>
                Outstanding Invoices
              </h2>
            </div>

            <Link className="dashboard-view-all" to="/client/invoices">
              View all
            </Link>

          </div>

          {outstandingInvoices.length === 0 ? (

            <div className="empty-state">
              <h3>You're all caught up</h3>

              <p>
                You don't have any outstanding invoices.
              </p>
            </div>

          ) : (

            <div className="invoice-list">

              {outstandingInvoices.map((invoice) => (

                <div
                  className="invoice-row"
                  key={invoice.invoice_id}
                >

                  <div className="invoice-info">

                    <strong>
                      {invoice.invoice_number ||
                        "Invoice"}
                    </strong>

                    <span>
                      Due{" "}
                      {invoice.due_date
                        ? new Date(
                          `${invoice.due_date}T00:00:00`
                        ).toLocaleDateString(
                          "en-NZ",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }
                        )
                        : "Date unavailable"}
                    </span>

                  </div>

                  <div className="invoice-amount">

                    <strong>
                      $
                      {Number(
                        invoice.total_amount || 0
                      ).toFixed(2)}
                    </strong>

                    <span
                      className={`status status-${invoice.status}`}
                    >
                      {invoice.status}
                    </span>

                  </div>

                </div>

              ))}

            </div>

          )}

        </section>

      </div>

    </div>
  );
}
