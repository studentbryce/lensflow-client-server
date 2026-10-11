import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGetPhotographerGallery, apiUpdatePhotographerGallery } from "../../services/photographerGalleriesApi";
import { useAuth } from "../../context/AuthContext";
import "./EditGallery.css";

const formatDate = (value) => {
  if (!value) return "Not specified";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatTime = (value) => {
  if (!value) return null;

  const date = new Date(`1970-01-01T${value}`);

  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-NZ", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return value;
};

// ------------------------------------------------------------
// Get client name from the linked profile.
// The clients table stores user_id, while the user's personal
// information is stored in the profiles table.
// ------------------------------------------------------------
const getClientName = (client) => {
  if (!client) return "Unknown client";

  const profile = client.profile;

  if (profile?.first_name || profile?.last_name) {
    return [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ");
  }

  if (profile?.email) {
    return profile.email;
  }

  return "Unknown client";
};

const getBookingDate = (booking) => {
  if (!booking) return null;

  return (
    booking.booking_date ||
    booking.date ||
    booking.scheduled_date ||
    booking.start_date ||
    null
  );
};

const getBookingTime = (booking) => {
  if (!booking) return null;

  return (
    booking.start_time ||
    booking.booking_time ||
    booking.time ||
    null
  );
};

const getBookingStatus = (booking) => {
  if (!booking?.status) return null;

  return String(booking.status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function EditGallery() {
  const { gallery_id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [gallery, setGallery] = useState(null);
  const [client, setClient] = useState(null);
  const [booking, setBooking] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_published: false,
    allow_downloads: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadGallery = useCallback(async () => {
    if (!user?.id || !gallery_id) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = await apiGetPhotographerGallery(gallery_id);
      const galleryData = payload.gallery;
      const relatedClient = payload.client;
      const relatedBooking = payload.booking;

      setGallery(galleryData);

      setFormData({
        name: galleryData.name || "",
        description: galleryData.description || "",
        is_published: Boolean(
          galleryData.is_published
        ),
        allow_downloads: Boolean(
          galleryData.allow_downloads
        ),
      });

      setClient(relatedClient || null);
      setBooking(relatedBooking || null);
    } catch (err) {
      console.error(
        "Error loading gallery:",
        err
      );

      setError(
        err?.message ||
          "Unable to load the gallery."
      );
    } finally {
      setLoading(false);
    }
  }, [gallery_id, user?.id]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  // ---------------------------------------------------------
  // Handle form changes
  // ---------------------------------------------------------
  const handleChange = (event) => {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setFormData((current) => ({
      ...current,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  };

  // ---------------------------------------------------------
  // Save gallery
  // ---------------------------------------------------------
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!user?.id) {
      setError(
        "You must be logged in to edit a gallery."
      );
      return;
    }

    const trimmedName =
      formData.name.trim();

    if (!trimmedName) {
      setError(
        "Please enter a gallery name."
      );
      return;
    }

    if (trimmedName.length > 150) {
      setError(
        "Gallery name must be 150 characters or fewer."
      );
      return;
    }

    if (
      formData.description.length > 2000
    ) {
      setError(
        "Description must be 2000 characters or fewer."
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updatedGallery = await apiUpdatePhotographerGallery(gallery_id, {
        name: trimmedName,
        description: formData.description.trim() || null,
        is_published: formData.is_published,
        allow_downloads: formData.allow_downloads,
      });

      setGallery(updatedGallery);

      setSuccess(
        "Gallery changes saved successfully."
      );

      // Give the success message a moment before navigating.
      setTimeout(() => {
        navigate(
          `/photographer/galleries/${gallery_id}`
        );
      }, 700);
    } catch (err) {
      console.error(
        "Error updating gallery:",
        err
      );

      setError(
        err?.message ||
          "Unable to save gallery changes. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------
  // Cancel editing
  // ---------------------------------------------------------
  const handleCancel = () => {
    navigate(
      `/photographer/galleries/${gallery_id}`
    );
  };

  // ---------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------
  if (loading) {
    return (
      <main className="edit-gallery-page">
        <div className="edit-gallery-container">

          <div className="edit-gallery-loading">
            <div className="edit-gallery-spinner" />

            <p>
              Loading gallery...
            </p>
          </div>

        </div>
      </main>
    );
  }

  // ---------------------------------------------------------
  // Error state
  // ---------------------------------------------------------
  if (error && !gallery) {
    return (
      <main className="edit-gallery-page">
        <div className="edit-gallery-container">

          <div className="edit-gallery-error-page">

            <div className="edit-gallery-error-icon">
              !
            </div>

            <h1>
              Unable to load gallery
            </h1>

            <p>{error}</p>

            <div className="edit-gallery-error-actions">

              <button
                type="button"
                className="edit-gallery-secondary-button"
                onClick={() =>
                  navigate(
                    "/photographer/galleries"
                  )
                }
              >
                Back to Galleries
              </button>

              <button
                type="button"
                className="edit-gallery-primary-button"
                onClick={loadGallery}
              >
                Try Again
              </button>

            </div>

          </div>

        </div>
      </main>
    );
  }

  if (!gallery) {
    return null;
  }

  const clientName =
    getClientName(client);

  const bookingDate =
    getBookingDate(booking);

  const bookingTime =
    getBookingTime(booking);

  const bookingStatus =
    getBookingStatus(booking);

  return (
    <main className="edit-gallery-page">
      <div className="edit-gallery-container">

        {/* ----------------------------------------------------- */}
        {/* Header                                                */}
        {/* ----------------------------------------------------- */}
        <header className="edit-gallery-header">

          <div>

            <button
              type="button"
              className="edit-gallery-back-button"
              onClick={handleCancel}
            >
              <span aria-hidden="true">
                ←
              </span>

              Back to Gallery
            </button>

            <div className="edit-gallery-heading">

              <span className="edit-gallery-eyebrow">
                Gallery Management
              </span>

              <h1>
                Edit Gallery
              </h1>

              <p>
                Update the gallery details and
                access settings.
              </p>

            </div>

          </div>

        </header>

        {/* ----------------------------------------------------- */}
        {/* Alerts                                                */}
        {/* ----------------------------------------------------- */}
        {error && (
          <div
            className="edit-gallery-alert edit-gallery-alert-error"
            role="alert"
          >
            <span className="edit-gallery-alert-icon">
              !
            </span>

            <div>
              <strong>
                Unable to save changes
              </strong>

              <p>{error}</p>
            </div>

          </div>
        )}

        {success && (
          <div
            className="edit-gallery-alert edit-gallery-alert-success"
            role="status"
          >
            <span className="edit-gallery-alert-icon">
              ✓
            </span>

            <div>
              <strong>
                Changes saved
              </strong>

              <p>{success}</p>
            </div>

          </div>
        )}

        <form
          className="edit-gallery-layout"
          onSubmit={handleSubmit}
        >

          {/* --------------------------------------------------- */}
          {/* Main Form                                           */}
          {/* --------------------------------------------------- */}
          <section className="edit-gallery-main-card">

            <div className="edit-gallery-card-header">

              <div>

                <h2>
                  Gallery Details
                </h2>

                <p>
                  Update the information displayed
                  for this client gallery.
                </p>

              </div>

            </div>

            <div className="edit-gallery-form">

              {/* Gallery Name */}
              <div className="edit-gallery-field">

                <label htmlFor="name">
                  Gallery Name
                  <span className="required">
                    *
                  </span>
                </label>

                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Smith Wedding"
                  maxLength={150}
                  disabled={saving}
                  autoComplete="off"
                />

                <div className="edit-gallery-field-footer">

                  <span>
                    A clear name helps you
                    identify the gallery
                    quickly.
                  </span>

                  <span>
                    {formData.name.length}/150
                  </span>

                </div>

              </div>

              {/* Description */}
              <div className="edit-gallery-field">

                <label htmlFor="description">
                  Description
                </label>

                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Add a description for this gallery..."
                  rows={7}
                  maxLength={2000}
                  disabled={saving}
                />

                <div className="edit-gallery-field-footer">

                  <span>
                    Optional information about
                    the gallery, event, or
                    collection.
                  </span>

                  <span>
                    {formData.description.length}/2000
                  </span>

                </div>

              </div>

              {/* Client */}
              <div className="edit-gallery-field">

                <label htmlFor="client">
                  Client
                </label>

                <div className="edit-gallery-readonly">

                  <div className="edit-gallery-readonly-icon">
                    👤
                  </div>

                  <div className="edit-gallery-readonly-content">

                    <strong>
                      {clientName}
                    </strong>

                    {client?.profile?.email && (
                      <span>
                        {client.profile.email}
                      </span>
                    )}

                    {client?.profile?.phone && (
                      <span>
                        {client.profile.phone}
                      </span>
                    )}

                  </div>

                  <span className="edit-gallery-readonly-badge">
                    Read only
                  </span>

                </div>

                <p className="edit-gallery-help-text">
                  The client cannot be changed
                  after a gallery has been
                  created.
                </p>

              </div>

              {/* Booking */}
              <div className="edit-gallery-field">

                <label htmlFor="booking">
                  Booking
                </label>

                <div className="edit-gallery-readonly">

                  <div className="edit-gallery-readonly-icon">
                    📅
                  </div>

                  <div className="edit-gallery-readonly-content">

                    {bookingDate ? (
                      <>
                        <strong>
                          {formatDate(
                            bookingDate
                          )}

                          {bookingTime
                            ? ` at ${formatTime(
                                bookingTime
                              )}`
                            : ""}
                        </strong>

                        {bookingStatus && (
                          <span>
                            {bookingStatus}
                          </span>
                        )}
                      </>
                    ) : (
                      <strong>
                        Booking information
                        unavailable
                      </strong>
                    )}

                  </div>

                  <span className="edit-gallery-readonly-badge">
                    Read only
                  </span>

                </div>

                <p className="edit-gallery-help-text">
                  The booking is permanently
                  associated with this gallery.
                </p>

              </div>

            </div>

          </section>

          {/* --------------------------------------------------- */}
          {/* Sidebar                                              */}
          {/* --------------------------------------------------- */}
          <aside className="edit-gallery-sidebar">

            {/* Gallery Settings */}
            <section className="edit-gallery-settings-card">

              <div className="edit-gallery-card-header">

                <div>

                  <h2>
                    Gallery Settings
                  </h2>

                  <p>
                    Control visibility and
                    client downloads.
                  </p>

                </div>

              </div>

              <div className="edit-gallery-settings">

                {/* Publish */}
                <label className="edit-gallery-setting">

                  <input
                    type="checkbox"
                    name="is_published"
                    checked={
                      formData.is_published
                    }
                    onChange={handleChange}
                    disabled={saving}
                  />

                  <span className="edit-gallery-checkbox">
                    ✓
                  </span>

                  <span className="edit-gallery-setting-content">

                    <strong>
                      Publish Gallery
                    </strong>

                    <small>
                      Allow the client to
                      access this gallery.
                    </small>

                  </span>

                </label>

                {/* Downloads */}
                <label className="edit-gallery-setting">

                  <input
                    type="checkbox"
                    name="allow_downloads"
                    checked={
                      formData.allow_downloads
                    }
                    onChange={handleChange}
                    disabled={saving}
                  />

                  <span className="edit-gallery-checkbox">
                    ✓
                  </span>

                  <span className="edit-gallery-setting-content">

                    <strong>
                      Allow Downloads
                    </strong>

                    <small>
                      Allow downloadable
                      media in the gallery.
                    </small>

                  </span>

                </label>

              </div>

            </section>

            {/* Current Status */}
            <section className="edit-gallery-status-card">

              <div className="edit-gallery-status-heading">

                <span className="edit-gallery-status-icon">
                  {formData.is_published
                    ? "✓"
                    : "○"}
                </span>

                <div>

                  <strong>
                    {formData.is_published
                      ? "Gallery Published"
                      : "Gallery Unpublished"}
                  </strong>

                  <p>
                    {formData.is_published
                      ? "The gallery is available to the client."
                      : "The gallery is currently hidden from the client."}
                  </p>

                </div>

              </div>

              <div className="edit-gallery-status-divider" />

              <div className="edit-gallery-status-row">

                <span>
                  Downloads
                </span>

                <strong>
                  {formData.allow_downloads
                    ? "Enabled"
                    : "Disabled"}
                </strong>

              </div>

            </section>

            {/* Important Information */}
            <section className="edit-gallery-info-card">

              <div className="edit-gallery-info-icon">
                i
              </div>

              <div>

                <h3>
                  Gallery relationship
                </h3>

                <p>
                  This gallery is linked to
                  its existing client and
                  booking. These relationships
                  cannot be changed here.
                </p>

              </div>

            </section>

          </aside>

          {/* --------------------------------------------------- */}
          {/* Actions                                              */}
          {/* --------------------------------------------------- */}
          <div className="edit-gallery-actions">

            <button
              type="button"
              className="edit-gallery-secondary-button"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="edit-gallery-primary-button"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="edit-gallery-button-spinner" />
                  Saving...
                </>
              ) : (
                <>
                  <span>✓</span>
                  Save Changes
                </>
              )}
            </button>

          </div>

        </form>

      </div>
    </main>
  );
}

export default EditGallery;