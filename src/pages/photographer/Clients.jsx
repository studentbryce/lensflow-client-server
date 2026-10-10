import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetPhotographerClients } from "../../services/photographerClientsApi";
import "./Clients.css";

export default function Clients() {
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    setError("");

    try {
      const response = await apiGetPhotographerClients();
      const formattedClients = response.data || [];

      setClients(formattedClients);
    } catch (err) {
      console.error("Error loading clients:", err);
      setError(err.message || "Unable to load clients.");
    } finally {
      setLoading(false);
    }
  }

  const filteredClients = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return clients;
    }

    return clients.filter((client) => {
      const profile = client.profile;

      const name =
        `${profile?.first_name || ""} ${profile?.last_name || ""}`
          .trim()
          .toLowerCase();

      const email = (profile?.email || "").toLowerCase();
      const phone = (profile?.phone || "").toLowerCase();

      return (
        name.includes(search) ||
        email.includes(search) ||
        phone.includes(search)
      );
    });
  }, [clients, searchTerm]);

  function getClientName(client) {
    const profile = client.profile;

    if (!profile) {
      return "Unknown Client";
    }

    return (
      `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
      "Unknown Client"
    );
  }

  function getInitials(client) {
    const profile = client.profile;

    if (!profile) {
      return "?";
    }

    const first = profile.first_name?.charAt(0) || "";
    const last = profile.last_name?.charAt(0) || "";

    return `${first}${last}`.toUpperCase() || "?";
  }

  function formatDate(dateString) {
    if (!dateString) return "—";

    return new Date(
      `${dateString}T00:00:00`
    ).toLocaleDateString("en-NZ", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
    }).format(amount || 0);
  }

  return (
    <div className="clients-page">

      {/* =========================
          Header
      ========================= */}

      <header className="clients-header">
        <div>
          <p className="page-eyebrow">LensFlow</p>

          <h1>Clients</h1>

          <p className="page-description">
            Manage your photography clients and view their booking history.
          </p>
        </div>

        <div className="clients-summary">
          <span>{clients.length}</span>
          <small>
            {clients.length === 1 ? "Client" : "Clients"}
          </small>
        </div>
      </header>

      {/* =========================
          Search
      ========================= */}

      {!loading && !error && clients.length > 0 && (
        <div className="clients-toolbar">

          <div className="client-search">
            <span className="search-icon">⌕</span>

            <input
              type="search"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
            />
          </div>

          <span className="results-count">
            {filteredClients.length}{" "}
            {filteredClients.length === 1
              ? "client"
              : "clients"}
          </span>

        </div>
      )}

      {/* =========================
          Loading
      ========================= */}

      {loading && (
        <div className="clients-state">
          <p>Loading clients...</p>
        </div>
      )}

      {/* =========================
          Error
      ========================= */}

      {!loading && error && (
        <div className="clients-state error-state">
          <h2>Unable to load clients</h2>

          <p>{error}</p>

          <button
            type="button"
            className="secondary-button"
            onClick={fetchClients}
          >
            Try Again
          </button>
        </div>
      )}

      {/* =========================
          No Clients
      ========================= */}

      {!loading &&
        !error &&
        clients.length === 0 && (
          <div className="clients-state empty-state">
            <div className="empty-icon">◇</div>

            <h2>No clients yet</h2>

            <p>
              Your clients will appear here once you have
              created your first booking.
            </p>
          </div>
        )}

      {/* =========================
          No Search Results
      ========================= */}

      {!loading &&
        !error &&
        clients.length > 0 &&
        filteredClients.length === 0 && (
          <div className="clients-state empty-state">
            <div className="empty-icon">⌕</div>

            <h2>No clients found</h2>

            <p>
              No clients match "{searchTerm}".
            </p>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setSearchTerm("")}
            >
              Clear Search
            </button>
          </div>
        )}

      {/* =========================
          Client List
      ========================= */}

      {!loading &&
        !error &&
        filteredClients.length > 0 && (
          <section className="clients-section">

            <div className="clients-list">

              {filteredClients.map((client) => {
                const profile = client.profile;
                const latestBooking = client.latestBooking;

                return (
                  <article
                    className="client-card"
                    key={client.client_id}
                  >

                    {/* Client identity */}

                    <div className="client-identity">

                      <div className="client-avatar">
                        {profile?.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={getClientName(client)}
                          />
                        ) : (
                          getInitials(client)
                        )}
                      </div>

                      <div className="client-name-block">
                        <h2>
                          {getClientName(client)}
                        </h2>

                        {profile?.email && (
                          <a
                            href={`mailto:${profile.email}`}
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                          >
                            {profile.email}
                          </a>
                        )}

                        {profile?.phone && (
                          <a
                            href={`tel:${profile.phone}`}
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                          >
                            {profile.phone}
                          </a>
                        )}
                      </div>

                    </div>

                    {/* Booking information */}

                    <div className="client-booking-summary">

                      <div className="client-stat">
                        <span>Bookings</span>

                        <strong>
                          {client.bookingCount}
                        </strong>
                      </div>

                      <div className="client-stat">
                        <span>Last Booking</span>

                        <strong>
                          {latestBooking
                            ? formatDate(
                                latestBooking.booking_date
                              )
                            : "—"}
                        </strong>
                      </div>

                      <div className="client-stat">
                        <span>Latest Service</span>

                        <strong>
                          {latestBooking?.services?.name ||
                            "—"}
                        </strong>
                      </div>

                      <div className="client-stat">
                        <span>Latest Value</span>

                        <strong>
                          {latestBooking
                            ? formatCurrency(
                                latestBooking.total_amount
                              )
                            : "—"}
                        </strong>
                      </div>

                    </div>

                    {/* Action */}

                    <button
                      type="button"
                      className="client-view-button"
                      onClick={() =>
                        navigate(
                          `/photographer/clients/${client.client_id}`
                        )
                      }
                    >
                      View Client
                      <span>→</span>
                    </button>

                  </article>
                );
              })}

            </div>

          </section>
        )}

    </div>
  );
}