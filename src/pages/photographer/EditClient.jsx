import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGetPhotographerClient, apiUpdatePhotographerClient } from "../../services/photographerClientsApi";
import "./EditClient.css";

export default function EditClient() {
    const { client_id } = useParams();
    return <EditClientContent key={client_id} client_id={client_id} />;
}

function EditClientContent({ client_id }) {
    const navigate = useNavigate();

    const [client, setClient] = useState(null);

    const [formData, setFormData] = useState({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        notes: "",
    });

    const [bookings, setBookings] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let active = true;

        async function loadClient() {
            try {
                const response = await apiGetPhotographerClient(client_id);
                if (!active) return;

                const clientData = response.data.client;
                const profileData = clientData.profile;
                setClient(clientData);
                setBookings(response.data.bookings || []);
                setFormData({
                    first_name: profileData?.first_name || "",
                    last_name: profileData?.last_name || "",
                    email: profileData?.email || "",
                    phone: profileData?.phone || "",
                    notes: clientData?.notes || "",
                });
            } catch (err) {
                if (!active) return;
                console.error("Error loading client:", err);
                setError(err.message || "Unable to load client.");
            } finally {
                if (active) setLoading(false);
            }
        }

        void loadClient();
        return () => { active = false; };
    }, [client_id, retryCount]);

    function retryLoadClient() {
        setLoading(true);
        setError("");
        setSuccess("");
        setRetryCount((count) => count + 1);
    }

    function handleChange(event) {
        const { name, value } = event.target;

        setFormData((current) => ({
            ...current,
            [name]: value,
        }));

        setSuccess("");
    }

    async function handleSubmit(event) {
        event.preventDefault();

        setSaving(true);
        setError("");
        setSuccess("");

        try {
            if (!client) {
                throw new Error("Client information is unavailable.");
            }

            await apiUpdatePhotographerClient(client_id, {
                first_name: formData.first_name.trim(),
                last_name: formData.last_name.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim(),
                notes: formData.notes.trim(),
            });
            // Refresh without erasing the success message.
            const response = await apiGetPhotographerClient(client_id);
            const refreshed = response.data.client;
            setClient(refreshed);
            setBookings(response.data.bookings || []);
            setFormData({
                first_name: refreshed.profile?.first_name || "",
                last_name: refreshed.profile?.last_name || "",
                email: refreshed.profile?.email || "",
                phone: refreshed.profile?.phone || "",
                notes: refreshed.notes || "",
            });
            setSuccess("Client details have been saved successfully.");
        } catch (err) {
            console.error("Error saving client:", err);
            setError(err.message || "Unable to save client details.");
        } finally {
            setSaving(false);
        }
    }

    function handleCancel() {
        navigate(`/photographer/clients/${client_id}`);
    }

    function getClientName() {
        const firstName = formData.first_name.trim();
        const lastName = formData.last_name.trim();

        return (
            `${firstName} ${lastName}`.trim() ||
            "Client"
        );
    }

    function getInitials() {
        const first = formData.first_name?.charAt(0) || "";
        const last = formData.last_name?.charAt(0) || "";

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

    function formatTime(timeString) {
        if (!timeString) return "—";

        const [hours, minutes] = timeString.split(":");

        const date = new Date();
        date.setHours(Number(hours), Number(minutes), 0, 0);

        return date.toLocaleTimeString("en-NZ", {
            hour: "numeric",
            minute: "2-digit",
        });
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat("en-NZ", {
            style: "currency",
            currency: "NZD",
        }).format(amount || 0);
    }

    function getStatusClass(status) {
        return `booking-status ${status || ""}`;
    }

    if (loading) {
        return (
            <div className="edit-client-page">
                <div className="edit-client-state">
                    <p>Loading client...</p>
                </div>
            </div>
        );
    }

    if (error && !client) {
        return (
            <div className="edit-client-page">
                <div className="edit-client-state error-state">
                    <h2>Unable to load client</h2>

                    <p>{error}</p>

                    <button
                        type="button"
                        className="secondary-button"
                        onClick={retryLoadClient}
                    >
                        Try Again
                    </button>

                    <button
                        type="button"
                        className="text-button"
                        onClick={() => navigate("/photographer/clients")}
                    >
                        Back to Clients
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="edit-client-page">

            {/* =========================
          Header
      ========================= */}

            <header className="edit-client-header">

                <div>
                    <button
                        type="button"
                        className="back-button"
                        onClick={handleCancel}
                    >
                        ← Back to Client
                    </button>

                    <p className="page-eyebrow">
                        LensFlow / Clients
                    </p>

                    <h1>Edit Client</h1>

                    <p className="page-description">
                        Update {getClientName()}'s contact details and client information.
                    </p>
                </div>

                <div className="client-header-avatar">
                    {client?.profile?.avatar_url ? (
                        <img
                            src={client.profile.avatar_url}
                            alt={getClientName()}
                        />
                    ) : (
                        getInitials()
                    )}
                </div>

            </header>

            {/* =========================
          Save Messages
      ========================= */}

            {error && (
                <div className="form-message error-message">
                    <strong>Unable to save changes</strong>
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="form-message success-message">
                    {success}
                </div>
            )}

            {/* =========================
          Client Form
      ========================= */}

            <form
                className="edit-client-form"
                onSubmit={handleSubmit}
            >

                <section className="form-section">

                    <div className="section-heading">
                        <p className="section-eyebrow">
                            Personal Information
                        </p>

                        <h2>Client Details</h2>

                        <p>
                            Update the client's basic contact information.
                        </p>
                    </div>

                    <div className="form-grid">

                        <div className="form-field">
                            <label htmlFor="first_name">
                                First Name
                            </label>

                            <input
                                id="first_name"
                                name="first_name"
                                type="text"
                                value={formData.first_name}
                                onChange={handleChange}
                                placeholder="First name"
                                autoComplete="given-name"
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="last_name">
                                Last Name
                            </label>

                            <input
                                id="last_name"
                                name="last_name"
                                type="text"
                                value={formData.last_name}
                                onChange={handleChange}
                                placeholder="Last name"
                                autoComplete="family-name"
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="email">
                                Email Address
                            </label>

                            <input
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="client@example.com"
                                autoComplete="email"
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="phone">
                                Phone Number
                            </label>

                            <input
                                id="phone"
                                name="phone"
                                type="tel"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder="021 123 4567"
                                autoComplete="tel"
                            />
                        </div>

                    </div>

                </section>

                {/* =========================
            Client Notes
        ========================= */}

                <section className="form-section">

                    <div className="section-heading">
                        <p className="section-eyebrow">
                            Client Notes
                        </p>

                        <h2>Private Notes</h2>

                        <p>
                            Add information that will help you manage this client.
                        </p>
                    </div>

                    <div className="form-field">

                        <label htmlFor="notes">
                            Notes
                        </label>

                        <textarea
                            id="notes"
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            placeholder="Add notes about this client..."
                            rows="6"
                        />

                        <span className="field-hint">
                            These notes are stored with the photographer's client record.
                        </span>

                    </div>

                </section>

                {/* =========================
            Booking History
        ========================= */}

                <section className="form-section booking-history-section">

                    <div className="section-heading">
                        <p className="section-eyebrow">
                            Client History
                        </p>

                        <h2>Booking History</h2>

                        <p>
                            Previous and upcoming bookings associated with this client.
                        </p>
                    </div>

                    {bookings.length === 0 ? (
                        <div className="booking-empty">
                            <span>◇</span>
                            <p>No bookings found for this client.</p>
                        </div>
                    ) : (
                        <div className="booking-history">

                            {bookings.map((booking) => (
                                <article
                                    className="booking-history-card"
                                    key={booking.booking_id}
                                >

                                    <div className="booking-history-date">
                                        <strong>
                                            {formatDate(booking.booking_date)}
                                        </strong>

                                        <span>
                                            {formatTime(booking.start_time)}
                                            {booking.end_time
                                                ? ` – ${formatTime(booking.end_time)}`
                                                : ""}
                                        </span>
                                    </div>

                                    <div className="booking-history-service">
                                        <span>Service</span>

                                        <strong>
                                            {booking.services?.name || "Unknown Service"}
                                        </strong>
                                    </div>

                                    <div className="booking-history-value">
                                        <span>Value</span>

                                        <strong>
                                            {formatCurrency(booking.total_amount)}
                                        </strong>
                                    </div>

                                    <span className={getStatusClass(booking.status)}>
                                        {booking.status || "unknown"}
                                    </span>

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
                                        <span>→</span>
                                    </button>

                                </article>
                            ))}

                        </div>
                    )}

                </section>

                {/* =========================
            Form Actions
        ========================= */}

                <div className="form-actions">

                    <button
                        type="button"
                        className="cancel-button"
                        onClick={handleCancel}
                        disabled={saving}
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        className="save-button"
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>

                </div>

            </form>

        </div>
    );
}