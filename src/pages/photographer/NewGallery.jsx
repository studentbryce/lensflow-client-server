import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiGetPhotographerGalleryOptions, apiCreatePhotographerGallery } from "../../services/photographerGalleriesApi";
import { useAuth } from "../../context/AuthContext";
import "./Galleries.css";

function getClientName(profile) {
  if (!profile) return "Unknown client";

  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || profile.email || "Unnamed client";
}

function formatDate(date) {
  if (!date) return "No date";

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function formatTime(time) {
  if (!time) return "";

  const [hours, minutes] = time.split(":");
  const date = new Date();

  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function NewGallery() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [existingGalleries, setExistingGalleries] = useState([]);
  const [photographerId, setPhotographerId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    client_id: "",
    booking_id: "",
    name: "",
    description: "",
    is_published: false,
    allow_downloads: true,
  });

  /*
   * Optional booking/client preselection.
   *
   * BookingDetails.jsx passes these values when the photographer
   * chooses Create Gallery from a booking. They are still validated
   * against the photographer's RLS-protected client/booking data
   * before being applied.
   */
  const requestedClientId = searchParams.get("client_id") || "";
  const requestedBookingId = searchParams.get("booking_id") || "";

  /*
   * Load photographer, clients, bookings and existing galleries.
   */
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!user?.id) {
        if (isMounted) {
          setError("Unable to identify the logged-in photographer.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");

      try {
        const payload = await apiGetPhotographerGalleryOptions();
        const currentPhotographerId = payload.photographer_id;
        const clientData = payload.clients;
        const profileData = payload.profiles;
        const bookingData = payload.bookings;
        const galleryData = payload.existing_galleries;

        if (!isMounted) return;

        setPhotographerId(currentPhotographerId);
        setClients(clientData || []);
        setProfiles(profileData || []);
        setBookings(bookingData || []);
        setExistingGalleries(galleryData || []);
      } catch (err) {
        console.error("Error loading new gallery data:", err);

        if (isMounted) {
          setError(
            err?.message ||
              "Unable to load the information required to create a gallery."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  /*
   * Create a quick lookup set containing every booking that already
   * has a gallery.
   */
  const galleryBookingIds = useMemo(() => {
    return new Set(
      existingGalleries
        .map((gallery) => gallery.booking_id)
        .filter(Boolean)
    );
  }, [existingGalleries]);

  /*
   * Apply a client/booking passed from Booking Details once all of
   * the photographer's data has loaded.
   *
   * If the booking is invalid, belongs to another client, or already
   * has a gallery, nothing is preselected.
   */
  useEffect(() => {
    if (loading || !requestedClientId || !requestedBookingId) {
      return;
    }

    const validClient = clients.some(
      (client) => client.client_id === requestedClientId
    );

    const validBooking = bookings.find(
      (booking) =>
        booking.booking_id === requestedBookingId &&
        booking.client_id === requestedClientId
    );

    const alreadyHasGallery = existingGalleries.some(
      (gallery) => gallery.booking_id === requestedBookingId
    );

    if (!validClient || !validBooking || alreadyHasGallery) {
      return;
    }

    setFormData((current) => {
      if (
        current.client_id === requestedClientId &&
        current.booking_id === requestedBookingId
      ) {
        return current;
      }

      return {
        ...current,
        client_id: requestedClientId,
        booking_id: requestedBookingId,
      };
    });
  }, [
    loading,
    requestedClientId,
    requestedBookingId,
    clients,
    bookings,
    existingGalleries,
  ]);

  /*
   * Create a lookup map for client profiles.
   */
  const profileMap = useMemo(() => {
    return new Map(
      profiles.map((profile) => [profile.user_id, profile])
    );
  }, [profiles]);

  /*
   * Create a lookup map for clients.
   */
  const clientMap = useMemo(() => {
    return new Map(
      clients.map((client) => [client.client_id, client])
    );
  }, [clients]);

  /*
   * Only show bookings belonging to the selected client.
   *
   * IMPORTANT:
   * Bookings that already have a gallery are automatically removed.
   */
  const availableBookings = useMemo(() => {
    if (!formData.client_id) {
      return [];
    }

    return bookings.filter((booking) => {
      const belongsToClient =
        booking.client_id === formData.client_id;

      const alreadyHasGallery =
        galleryBookingIds.has(booking.booking_id);

      return belongsToClient && !alreadyHasGallery;
    });
  }, [
    bookings,
    formData.client_id,
    galleryBookingIds,
  ]);

  /*
   * Determine how many bookings for the selected client already
   * have galleries.
   */
  const selectedClientGalleryCount = useMemo(() => {
    if (!formData.client_id) {
      return 0;
    }

    return existingGalleries.filter(
      (gallery) => gallery.client_id === formData.client_id
    ).length;
  }, [existingGalleries, formData.client_id]);

  /*
   * Determine how many bookings the selected client has in total.
   */
  const selectedClientBookingCount = useMemo(() => {
    if (!formData.client_id) {
      return 0;
    }

    return bookings.filter(
      (booking) => booking.client_id === formData.client_id
    ).length;
  }, [bookings, formData.client_id]);

  /*
   * Selected client information.
   */
  const selectedClient = useMemo(() => {
    if (!formData.client_id) {
      return null;
    }

    const client = clientMap.get(formData.client_id);

    if (!client) {
      return null;
    }

    const profile = profileMap.get(client.user_id);

    return {
      ...client,
      profile,
      name: getClientName(profile),
    };
  }, [
    formData.client_id,
    clientMap,
    profileMap,
  ]);

  /*
   * Selected booking.
   */
  const selectedBooking = useMemo(() => {
    if (!formData.booking_id) {
      return null;
    }

    return bookings.find(
      (booking) => booking.booking_id === formData.booking_id
    );
  }, [bookings, formData.booking_id]);

  /*
   * Handle standard text/select inputs.
   */
  function handleChange(event) {
    const { name, value } = event.target;

    setError("");
    setSuccess("");

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  /*
   * Handle checkbox settings.
   */
  function handleCheckboxChange(event) {
    const { name, checked } = event.target;

    setError("");
    setSuccess("");

    setFormData((current) => ({
      ...current,
      [name]: checked,
    }));
  }

  /*
   * When the client changes, clear the selected booking.
   *
   * This prevents a booking belonging to the previous client from
   * remaining selected.
   */
  function handleClientChange(event) {
    const clientId = event.target.value;

    setError("");
    setSuccess("");

    setFormData((current) => ({
      ...current,
      client_id: clientId,
      booking_id: "",
    }));
  }

  /*
   * Validate the form before submission.
   */
  function validateForm() {
    if (!formData.client_id) {
      return "Please select a client.";
    }

    if (!formData.booking_id) {
      return "Please select a booking.";
    }

    if (!formData.name.trim()) {
      return "Please enter a gallery name.";
    }

    if (formData.name.trim().length < 2) {
      return "Gallery name must contain at least 2 characters.";
    }

    if (formData.name.trim().length > 150) {
      return "Gallery name must be 150 characters or fewer.";
    }

    if (formData.description.trim().length > 1000) {
      return "Gallery description must be 1000 characters or fewer.";
    }

    // Make sure the selected booking belongs to the selected client.
    const booking = bookings.find(
      (item) => item.booking_id === formData.booking_id
    );

    if (!booking) {
      return "The selected booking could not be found.";
    }

    if (booking.client_id !== formData.client_id) {
      return "The selected booking does not belong to the selected client.";
    }

    // Make sure the booking does not already have a gallery.
    if (galleryBookingIds.has(formData.booking_id)) {
      return "This booking already has a gallery. Please select another booking.";
    }

    return "";
  }

  /*
   * Create the gallery.
   */
  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      return;
    }

    if (!photographerId) {
      setError(
        "Unable to identify the photographer. Please refresh the page and try again."
      );
      return;
    }

    setSaving(true);

    try {
      // Server verifies booking ownership and checks for duplicate galleries.
      const gallery = await apiCreatePhotographerGallery({
        client_id: formData.client_id,
        booking_id: formData.booking_id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        is_published: Boolean(formData.is_published),
        allow_downloads: Boolean(formData.allow_downloads),
      });

      setSuccess("Gallery created successfully.");

      /*
       * Give the success message a moment to display before
       * navigating to the gallery details page.
       */
      setTimeout(() => {
        navigate(
          `/photographer/galleries/${gallery.gallery_id}`
        );
      }, 700);
    } catch (err) {
      console.error("Error creating gallery:", err);

      setError(
        err?.message ||
          "Unable to create gallery. Please try again."
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } finally {
      setSaving(false);
    }
  }

  /*
   * Loading state.
   */
  if (loading) {
    return (
      <div className="galleries-page">
        <div className="new-gallery-state">
          <div className="new-gallery-state-spinner" />
          <h2>Loading gallery setup...</h2>
          <p>
            Preparing your clients and available bookings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="galleries-page">
      <div className="new-gallery-header">
        <button
          type="button"
          className="new-gallery-back-button"
          onClick={() => navigate("/photographer/galleries")}
        >
          ← Back to Galleries
        </button>

        <div className="new-gallery-eyebrow">
          Gallery Management
        </div>

        <h1>Create New Gallery</h1>

        <p className="new-gallery-description">
          Create a private client gallery for a completed
          photography booking. Media can be uploaded after the
          gallery has been created.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="new-gallery-message error">
          <strong>Unable to create gallery</strong>
          <span>{error}</span>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="new-gallery-message success">
          <strong>Gallery created</strong>
          <span>{success}</span>
        </div>
      )}

      <form
        className="new-gallery-form"
        onSubmit={handleSubmit}
      >
        {/* ===================================================== */}
        {/* 1. Gallery Information */}
        {/* ===================================================== */}
        <section className="gallery-form-section">
          <div className="gallery-section-heading">
            <span className="gallery-section-number">01</span>

            <div>
              <h2>Gallery Information</h2>
              <p>
                Give the gallery a clear name and optional
                description.
              </p>
            </div>
          </div>

          <div className="gallery-form-grid">
            <div className="gallery-field gallery-field-full">
              <label htmlFor="name">
                Gallery Name
                <span className="required">*</span>
              </label>

              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Sarah & James Wedding"
                maxLength={150}
                disabled={saving}
              />

              <span className="gallery-field-help">
                Use a name your client will easily recognise.
              </span>
            </div>

            <div className="gallery-field gallery-field-full">
              <label htmlFor="description">
                Description
              </label>

              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="e.g. Wedding photography collection from the ceremony and reception."
                rows={5}
                maxLength={1000}
                disabled={saving}
              />

              <span className="gallery-field-help">
                Optional. This can be used to provide context
                about the gallery.
              </span>
            </div>
          </div>
        </section>

        {/* ===================================================== */}
        {/* 2. Client & Booking */}
        {/* ===================================================== */}
        <section className="gallery-form-section">
          <div className="gallery-section-heading">
            <span className="gallery-section-number">02</span>

            <div>
              <h2>Client & Booking</h2>
              <p>
                Select the client and photography booking this
                gallery belongs to.
              </p>
            </div>
          </div>

          <div className="gallery-form-grid">
            {/* Client */}
            <div className="gallery-field">
              <label htmlFor="client_id">
                Client
                <span className="required">*</span>
              </label>

              <select
                id="client_id"
                name="client_id"
                value={formData.client_id}
                onChange={handleClientChange}
                disabled={saving}
              >
                <option value="">
                  Select a client...
                </option>

                {clients.map((client) => {
                  const profile = profileMap.get(
                    client.user_id
                  );

                  return (
                    <option
                      key={client.client_id}
                      value={client.client_id}
                    >
                      {getClientName(profile)}
                    </option>
                  );
                })}
              </select>

              {clients.length === 0 && (
                <span className="gallery-field-help">
                  No clients are currently available.
                </span>
              )}
            </div>

            {/* Booking */}
            <div className="gallery-field">
              <label htmlFor="booking_id">
                Booking
                <span className="required">*</span>
              </label>

              <select
                id="booking_id"
                name="booking_id"
                value={formData.booking_id}
                onChange={handleChange}
                disabled={
                  saving || !formData.client_id
                }
              >
                <option value="">
                  {!formData.client_id
                    ? "Select a client first..."
                    : availableBookings.length === 0
                    ? "No available bookings"
                    : "Select a booking..."}
                </option>

                {availableBookings.map((booking) => (
                  <option
                    key={booking.booking_id}
                    value={booking.booking_id}
                  >
                    {formatDate(booking.booking_date)}
                    {booking.start_time
                      ? ` • ${formatTime(
                          booking.start_time
                        )}`
                      : ""}
                    {booking.location
                      ? ` • ${booking.location}`
                      : ""}
                  </option>
                ))}
              </select>

              {formData.client_id &&
                selectedClientBookingCount > 0 &&
                availableBookings.length === 0 && (
                  <span className="gallery-field-help">
                    All bookings for this client already have
                    galleries.
                  </span>
                )}

              {formData.client_id &&
                selectedClientBookingCount === 0 && (
                  <span className="gallery-field-help">
                    This client has no bookings available for a
                    new gallery.
                  </span>
                )}

              {formData.client_id &&
                availableBookings.length > 0 && (
                  <span className="gallery-field-help">
                    {availableBookings.length} booking
                    {availableBookings.length !== 1
                      ? "s"
                      : ""}{" "}
                    available for a new gallery.
                    {selectedClientGalleryCount > 0 &&
                      ` ${selectedClientGalleryCount} ${
                        selectedClientGalleryCount === 1
                          ? "booking already has"
                          : "bookings already have"
                      } a gallery.`}
                  </span>
                )}
            </div>
          </div>

          {/* Selected client preview */}
          {selectedClient && (
            <div className="gallery-selection-preview">
              <div className="gallery-preview-avatar">
                {selectedClient.name
                  .split(" ")
                  .map((part) => part.charAt(0))
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>

              <div className="gallery-preview-content">
                <span className="gallery-preview-label">
                  Selected Client
                </span>

                <strong>{selectedClient.name}</strong>

                {selectedClient.profile?.email && (
                  <span>
                    {selectedClient.profile.email}
                  </span>
                )}

                {selectedClient.profile?.phone && (
                  <span>
                    {selectedClient.profile.phone}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Selected booking preview */}
          {selectedBooking && (
            <div className="gallery-selection-preview booking-preview">
              <div className="gallery-preview-icon">
                📅
              </div>

              <div className="gallery-preview-content">
                <span className="gallery-preview-label">
                  Selected Booking
                </span>

                <strong>
                  {formatDate(
                    selectedBooking.booking_date
                  )}
                  {selectedBooking.start_time
                    ? ` • ${formatTime(
                        selectedBooking.start_time
                      )}`
                    : ""}
                </strong>

                {selectedBooking.location && (
                  <span>
                    {selectedBooking.location}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ===================================================== */}
        {/* 3. Gallery Settings */}
        {/* ===================================================== */}
        <section className="gallery-form-section">
          <div className="gallery-section-heading">
            <span className="gallery-section-number">03</span>

            <div>
              <h2>Gallery Settings</h2>
              <p>
                Control how and when the gallery becomes
                available to the client.
              </p>
            </div>
          </div>

          <div className="gallery-settings">
            {/* Publish */}
            <label className="gallery-setting">
              <input
                type="checkbox"
                name="is_published"
                checked={formData.is_published}
                onChange={handleCheckboxChange}
                disabled={saving}
              />

              <span className="gallery-setting-content">
                <strong>Publish gallery</strong>

                <span>
                  Make the gallery available to the client
                  immediately.
                </span>
              </span>
            </label>

            {/* Downloads */}
            <label className="gallery-setting">
              <input
                type="checkbox"
                name="allow_downloads"
                checked={formData.allow_downloads}
                onChange={handleCheckboxChange}
                disabled={saving}
              />

              <span className="gallery-setting-content">
                <strong>Allow downloads</strong>

                <span>
                  Allow the client to download media from this
                  gallery once it is available.
                </span>
              </span>
            </label>
          </div>

          <div className="gallery-settings-note">
            <strong>Tip:</strong> You can leave the gallery
            unpublished while you upload and organise the
            client's media. Publish it when everything is ready
            for delivery.
          </div>
        </section>

        {/* ===================================================== */}
        {/* Actions */}
        {/* ===================================================== */}
        <div className="new-gallery-actions">
          <button
            type="button"
            className="new-gallery-action secondary"
            onClick={() =>
              navigate("/photographer/galleries")
            }
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="new-gallery-action primary"
            disabled={
              saving ||
              !formData.client_id ||
              !formData.booking_id ||
              !formData.name.trim()
            }
          >
            {saving ? (
              <>
                <span className="button-spinner" />
                Creating Gallery...
              </>
            ) : (
              "Create Gallery"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}