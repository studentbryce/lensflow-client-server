import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetPhotographerServices } from "../../services/photographerServicesApi";
import "./Services.css";

export default function Services() {
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchServices();
  }, []);

  async function fetchServices() {
    setLoading(true);
    setError("");

    try {
      const { data } = await apiGetPhotographerServices();

      setServices(data || []);
    } catch (err) {
      console.error("Error loading services:", err);
      setError(err.message || "Unable to load services.");
    } finally {
      setLoading(false);
    }
  }

  const filteredServices = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return services.filter((service) => {
      const matchesSearch =
        !search ||
        service.name?.toLowerCase().includes(search) ||
        service.description?.toLowerCase().includes(search);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && service.is_active) ||
        (statusFilter === "inactive" && !service.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [services, searchTerm, statusFilter]);

  const activeCount = services.filter(
    (service) => service.is_active
  ).length;

  const inactiveCount = services.filter(
    (service) => !service.is_active
  ).length;

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
    }).format(amount || 0);
  }

  function formatDuration(minutes) {
    if (!minutes) return "—";

    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return `${hours} hr${hours !== 1 ? "s" : ""}`;
    }

    return `${hours} hr${hours !== 1 ? "s" : ""} ${remainingMinutes} min`;
  }

  function handleEdit(serviceId) {
    navigate(`/photographer/services/${serviceId}/edit`);
  }

  return (
    <div className="services-page">
      <header className="services-header">
        <div>
          <p className="page-eyebrow">LensFlow</p>

          <h1>Services</h1>

          <p className="page-description">
            Create and manage the photography services you offer to your clients.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/photographer/services/new")}
        >
          <span>+</span>
          New Service
        </button>
      </header>

      {!loading && !error && services.length > 0 && (
        <>
          <div className="services-summary">
            <div className="summary-card">
              <span className="summary-label">Total Services</span>
              <strong>{services.length}</strong>
            </div>

            <div className="summary-card">
              <span className="summary-label">Active</span>
              <strong>{activeCount}</strong>
            </div>

            <div className="summary-card">
              <span className="summary-label">Inactive</span>
              <strong>{inactiveCount}</strong>
            </div>
          </div>

          <div className="services-toolbar">
            <div className="service-search">
              <span className="search-icon">⌕</span>

              <input
                type="search"
                placeholder="Search services..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <div className="service-filters">
              <button
                type="button"
                className={statusFilter === "all" ? "filter-active" : ""}
                onClick={() => setStatusFilter("all")}
              >
                All
              </button>

              <button
                type="button"
                className={statusFilter === "active" ? "filter-active" : ""}
                onClick={() => setStatusFilter("active")}
              >
                Active
              </button>

              <button
                type="button"
                className={statusFilter === "inactive" ? "filter-active" : ""}
                onClick={() => setStatusFilter("inactive")}
              >
                Inactive
              </button>
            </div>

            <span className="results-count">
              {filteredServices.length}{" "}
              {filteredServices.length === 1 ? "service" : "services"}
            </span>
          </div>
        </>
      )}

      {loading && (
        <div className="services-state">
          <p>Loading services...</p>
        </div>
      )}

      {!loading && error && (
        <div className="services-state error-state">
          <h2>Unable to load services</h2>

          <p>{error}</p>

          <button
            type="button"
            className="secondary-button"
            onClick={fetchServices}
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && services.length === 0 && (
        <div className="services-state empty-state">
          <div className="empty-icon">◇</div>

          <h2>No services yet</h2>

          <p>
            Create your first photography service to start offering packages
            to your clients.
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/photographer/services/new")}
          >
            <span>+</span>
            Create Your First Service
          </button>
        </div>
      )}

      {!loading &&
        !error &&
        services.length > 0 &&
        filteredServices.length === 0 && (
          <div className="services-state empty-state">
            <div className="empty-icon">⌕</div>

            <h2>No services found</h2>

            <p>
              No services match your current search or filter.
            </p>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
              }}
            >
              Clear Filters
            </button>
          </div>
        )}

      {!loading &&
        !error &&
        filteredServices.length > 0 && (
          <section className="services-section">
            <div className="services-grid">
              {filteredServices.map((service) => (
                <article
                  className="service-card"
                  key={service.service_id}
                >
                  <div className="service-card-top">
                    <div className="service-image">
                      {service.image_url ? (
                        <img
                          src={service.image_url}
                          alt={service.name}
                        />
                      ) : (
                        <span>✦</span>
                      )}
                    </div>

                    <span
                      className={`service-status ${
                        service.is_active
                          ? "status-active"
                          : "status-inactive"
                      }`}
                    >
                      {service.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="service-card-content">
                    <h2>{service.name}</h2>

                    <p className="service-description">
                      {service.description || "No description provided."}
                    </p>

                    <div className="service-details">
                      <div className="service-detail">
                        <span>Price</span>
                        <strong>
                          {formatCurrency(service.price)}
                        </strong>
                      </div>

                      <div className="service-detail">
                        <span>Duration</span>
                        <strong>
                          {formatDuration(service.duration_minutes)}
                        </strong>
                      </div>

                      <div className="service-detail">
                        <span>Deposit</span>
                        <strong>
                          {service.deposit_amount !== null &&
                          service.deposit_amount !== undefined
                            ? formatCurrency(service.deposit_amount)
                            : "None"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="service-card-footer">
                    <button
                      type="button"
                      className="service-edit-button"
                      onClick={() => handleEdit(service.service_id)}
                    >
                      Edit Service
                      <span>→</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
    </div>
  );
}