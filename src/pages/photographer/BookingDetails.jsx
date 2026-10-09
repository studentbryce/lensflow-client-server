import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { apiDeleteBooking, apiGetBookingById, apiUpdateBooking, apiUpdateBookingStatus } from "../../services/bookingApi";
import "./BookingDetails.css";

export default function BookingDetails() {
  const { booking_id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [client, setClient] = useState(null);
  const [service, setService] = useState(null);
  const [existingInvoice, setExistingInvoice] = useState(null);
  const [existingGallery, setExistingGallery] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState("");
  const [editForm, setEditForm] = useState({
    booking_date: "", start_time: "", location: "", notes: "",
  });

  useEffect(() => {
    fetchBooking();
  }, [booking_id]);

  async function fetchBooking() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Booking data, service and client contact details come through Express.
      const response = await apiGetBookingById(booking_id);
      const data = response.data;
      setBooking(data);
      setService(data.services ?? null);
      setClient(data.photographerClientProfile ?? null);

      /*
       * Check whether this booking already has an invoice.
       *
       * If an invoice exists, the completed booking action will
       * open that invoice instead of allowing a duplicate invoice
       * to be created for the same booking.
       */
      const { data: invoiceData, error: invoiceError } =
        await supabase
          .from("invoices")
          .select(`
            invoice_id,
            invoice_number,
            status
          `)
          .eq("booking_id", data.booking_id)
          .maybeSingle();

      if (invoiceError) throw invoiceError;

      setExistingInvoice(invoiceData || null);

      /*
       * Check whether this booking already has a gallery.
       * If one exists, the gallery action will open it instead of
       * allowing another gallery to be created for the same booking.
       */
      const { data: galleryData, error: galleryError } =
        await supabase
          .from("galleries")
          .select(`
            gallery_id,
            name,
            is_published
          `)
          .eq("booking_id", data.booking_id)
          .maybeSingle();

      if (galleryError) throw galleryError;

      setExistingGallery(galleryData || null);

    } catch (err) {
      console.error("Error loading booking:", err);
      setError(err.message || "Unable to load booking.");
    } finally {
      setLoading(false);
    }
  }

  function beginEdit() {
    if (!booking || !["pending", "confirmed"].includes(booking.status)) return;
    setError("");
    setSuccess("");
    setEditForm({
      booking_date: booking.booking_date ?? "",
      start_time: (booking.start_time ?? "").slice(0, 5),
      location: booking.location ?? "",
      notes: booking.notes ?? "",
    });
    setEditing(true);
  }

  function cancelEdit() {
    if (savingEdit) return;
    setEditing(false);
    setError("");
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!booking || savingEdit || deleting || updating) return;

    // Send only modified fields. Re-sending an unchanged date/time would
    // unnecessarily trigger the API's availability and dependency checks.
    const changes = {};
    if (editForm.booking_date !== booking.booking_date) {
      changes.booking_date = editForm.booking_date;
    }
    if (editForm.start_time !== (booking.start_time ?? "").slice(0, 5)) {
      changes.start_time = editForm.start_time;
    }
    if (editForm.location !== (booking.location ?? "")) {
      changes.location = editForm.location;
    }
    if (editForm.notes !== (booking.notes ?? "")) {
      changes.notes = editForm.notes;
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      setSuccess("No changes were needed.");
      return;
    }

    setSavingEdit(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiUpdateBooking(booking.booking_id, changes);
      // PATCH returns the booking row, not enriched client/service objects.
      // Preserve the relationships already loaded by GET.
      setBooking((current) => ({ ...current, ...response.data }));
      setEditing(false);
      setSuccess("Booking updated successfully through the Express API.");
    } catch (err) {
      setError(err.message || "Unable to update booking.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteBooking() {
    if (!booking || deleting || savingEdit || updating) return;
    if (existingInvoice || existingGallery) {
      setError("This booking has an invoice or gallery and cannot be deleted.");
      return;
    }
    const confirmed = window.confirm(
      "Permanently delete this booking? This cannot be undone. " +
      "Only delete COMP.7214 test records during testing."
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      await apiDeleteBooking(booking.booking_id);
      navigate("/photographer/bookings", { replace: true });
    } catch (err) {
      // The API also rejects linked reviews, locked bookings, and changes
      // made since the record was loaded. Never assume the DELETE succeeded.
      setError(err.message || "Unable to delete booking.");
    } finally {
      setDeleting(false);
    }
  }

  async function updateBookingStatus(newStatus) {
    if (!booking) return;

    const confirmed = window.confirm(
      `Are you sure you want to mark this booking as ${newStatus}?`
    );

    if (!confirmed) return;

    setUpdating(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiUpdateBookingStatus(booking.booking_id, newStatus);
      // Status PATCH returns the booking row; preserve joined client/service data.
      setBooking((current) => ({ ...current, ...response.data }));
      setEditing(false);
      setSuccess(`Booking marked as ${newStatus} through the Express API.`);
    } catch (err) {
      console.error("Error updating booking:", err);

      setError(
        err.message || "Unable to update booking status."
      );
    } finally {
      setUpdating(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "";

    return new Date(
      `${dateString}T00:00:00`
    ).toLocaleDateString("en-NZ", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatShortDate(dateString) {
    if (!dateString) return "";

    return new Date(
      `${dateString}T00:00:00`
    ).toLocaleDateString("en-NZ", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
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

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
    }).format(amount || 0);
  }

  function getClientName() {
    if (!client) return "Unknown Client";

    return `${client.first_name || ""} ${
      client.last_name || ""
    }`.trim() || "Unknown Client";
  }

  function getClientInitials() {
    if (!client) return "?";

    const first = client.first_name?.charAt(0) || "";
    const last = client.last_name?.charAt(0) || "";

    return `${first}${last}`.toUpperCase() || "?";
  }

  function getStatusClass() {
    return `booking-status booking-status-${booking.status}`;
  }

  function getStatusLabel(status) {
    if (!status) return "";

    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function getGoogleMapsUrl() {
    if (!booking?.location) return "#";

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      booking.location
    )}`;
  }

  function getBookingDuration() {
    if (!service?.duration_minutes) return null;

    return `${service.duration_minutes} minutes`;
  }

  function handleInvoiceAction() {
    if (!booking) return;

    /*
     * If this booking already has an invoice, open it instead
     * of creating a duplicate.
     */
    if (existingInvoice?.invoice_id) {
      navigate(
        `/photographer/invoices/${existingInvoice.invoice_id}`
      );
      return;
    }

    /*
     * Pass the client and booking IDs to NewInvoice.jsx.
     *
     * NewInvoice uses these query parameters to preselect the
     * client and booking. The booked service is then automatically
     * added to the invoice items.
     */
    const params = new URLSearchParams({
      client_id: booking.client_id,
      booking_id: booking.booking_id,
    });

    navigate(
      `/photographer/invoices/new?${params.toString()}`
    );
  }

  function renderInvoiceButton() {
    return (
      <button
        className="action-button secondary-action"
        onClick={handleInvoiceAction}
      >
        {existingInvoice ? "View Invoice" : "Create Invoice"}
      </button>
    );
  }

  function handleGalleryAction() {
    if (!booking) return;

    /*
     * If this booking already has a gallery, open it instead of
     * allowing a duplicate gallery to be created.
     */
    if (existingGallery?.gallery_id) {
      navigate(
        `/photographer/galleries/${existingGallery.gallery_id}`
      );
      return;
    }

    /*
     * Pass the client and booking IDs to NewGallery.jsx so the
     * photographer does not need to select the same booking again.
     */
    const params = new URLSearchParams({
      client_id: booking.client_id,
      booking_id: booking.booking_id,
    });

    navigate(
      `/photographer/galleries/new?${params.toString()}`
    );
  }

  function renderGalleryButton() {
    return (
      <button
        className="action-button secondary-action"
        onClick={handleGalleryAction}
      >
        {existingGallery ? "View Gallery" : "Create Gallery"}
      </button>
    );
  }

  function renderActions() {
    if (updating || savingEdit || deleting) {
      return (
        <div className="booking-actions">
          <span className="updating-message">
            Updating booking...
          </span>
        </div>
      );
    }

    switch (booking.status) {
      case "pending":
        return (
          <div className="booking-actions">
            <button
              className="action-button confirm-button"
              onClick={() =>
                updateBookingStatus("confirmed")
              }
            >
              Confirm Booking
            </button>

            <button
              className="action-button decline-button"
              onClick={() =>
                updateBookingStatus("declined")
              }
              disabled={Boolean(existingInvoice || existingGallery)}
              title={existingInvoice || existingGallery ? "Resolve the linked invoice or gallery before declining." : "Decline booking"}
            >
              Decline
            </button>

            <button
              className="action-button secondary-action"
              onClick={beginEdit}
            >
              Edit Booking
            </button>

            {renderInvoiceButton()}
          </div>
        );

      case "confirmed":
        return (
          <div className="booking-actions">
            <button
              className="action-button complete-button"
              onClick={() =>
                updateBookingStatus("completed")
              }
            >
              Mark Completed
            </button>

            <button
              className="action-button secondary-action"
              onClick={beginEdit}
            >
              Edit Booking
            </button>

            <button
              className="action-button decline-button"
              onClick={() =>
                updateBookingStatus("cancelled")
              }
              disabled={Boolean(existingInvoice || existingGallery)}
              title={existingInvoice || existingGallery ? "Resolve the linked invoice or gallery before cancelling." : "Cancel booking"}
            >
              Cancel Booking
            </button>

            {renderInvoiceButton()}
          </div>
        );

      case "completed":
        return (
          <div className="booking-actions">
            {renderInvoiceButton()}

            {renderGalleryButton()}
          </div>
        );

      case "cancelled":
      case "declined":
        return (
          <div className="booking-actions">
            {renderInvoiceButton()}
          </div>
        );

      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="booking-details-page">
        <div className="booking-details-state">
          <p>Loading booking...</p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="booking-details-page">
        <div className="booking-details-state error-state">
          <p className="page-eyebrow">LensFlow</p>

          <h2>Unable to load booking</h2>

          <p>{error}</p>

          <button
            className="secondary-button"
            onClick={() =>
              navigate("/photographer/bookings")
            }
          >
            Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  if (!booking) {
    return null;
  }

  return (
    <div className="booking-details-page">

      {/* Back navigation */}

      <button
        className="back-button"
        onClick={() =>
          navigate("/photographer/bookings")
        }
      >
        ← Back to Bookings
      </button>

      {/* Header */}

      <header className="booking-details-header">

        <div className="booking-heading-content">

          <p className="page-eyebrow">
            Booking Details
          </p>

          <h1>
            {formatDate(booking.booking_date)}
          </h1>

          <p className="booking-time-large">
            {formatTime(booking.start_time)}
            {" – "}
            {formatTime(booking.end_time)}
          </p>

        </div>

        <div className="booking-header-status">
          <span className={getStatusClass()}>
            {getStatusLabel(booking.status)}
          </span>
        </div>

      </header>

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="booking-api-success" role="status">
          {success}
        </div>
      )}

      {/* Main booking information */}

      <div className="booking-details-grid">

        {/* Client */}

        <section className="details-card">

          <p className="card-eyebrow">
            Client
          </p>

          <div className="client-profile">

            <div className="client-avatar">
              {client?.avatar_url ? (
                <img
                  src={client.avatar_url}
                  alt={getClientName()}
                />
              ) : (
                getClientInitials()
              )}
            </div>

            <div className="client-information">

              <h2>
                {getClientName()}
              </h2>

              {client?.email && (
                <a href={`mailto:${client.email}`}>
                  {client.email}
                </a>
              )}

              {client?.phone && (
                <a href={`tel:${client.phone}`}>
                  {client.phone}
                </a>
              )}

            </div>

          </div>

          <button
            className="text-button"
            onClick={() =>
              navigate(
                `/photographer/clients/${booking.client_id}`
              )
            }
          >
            View Client Profile →
          </button>

        </section>

        {/* Service */}

        <section className="details-card">

          <p className="card-eyebrow">
            Service
          </p>

          <h2>
            {service?.name || "Unknown Service"}
          </h2>

          {service?.description && (
            <p className="service-description">
              {service.description}
            </p>
          )}

          <div className="service-details">

            {getBookingDuration() && (
              <div>
                <span>Duration</span>

                <strong>
                  {getBookingDuration()}
                </strong>
              </div>
            )}

            <div>
              <span>Total</span>

              <strong>
                {formatCurrency(
                  booking.total_amount
                )}
              </strong>
            </div>

          </div>

        </section>

        {/* Location */}

        <section className="details-card">

          <p className="card-eyebrow">
            Location
          </p>

          <div className="location-content">

            <div className="location-icon">
              ◇
            </div>

            <h2>
              {booking.location ||
                "No location specified"}
            </h2>

          </div>

          {booking.location && (
            <a
              className="text-button"
              href={getGoogleMapsUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps →
            </a>
          )}

        </section>

        {/* Financial summary */}

        <section className="details-card financial-card">

          <p className="card-eyebrow">
            Booking Summary
          </p>

          <div className="financial-summary">

            <div className="financial-row">
              <span>Service</span>

              <strong>
                {formatCurrency(
                  booking.total_amount
                )}
              </strong>
            </div>

            <div className="financial-row total-row">
              <span>Total Booking Value</span>

              <strong>
                {formatCurrency(
                  booking.total_amount
                )}
              </strong>
            </div>

          </div>

        </section>

        {/* Notes */}

        <section className="details-card notes-card">

          <p className="card-eyebrow">
            Booking Notes
          </p>

          <p className="booking-notes">
            {booking.notes ||
              "No notes have been added to this booking."}
          </p>

        </section>

      </div>

      {/* Booking information */}

      <section className="booking-meta-card">

        <div className="meta-item">
          <span>Booking Date</span>
          <strong>
            {formatShortDate(
              booking.booking_date
            )}
          </strong>
        </div>

        <div className="meta-item">
          <span>Start Time</span>
          <strong>
            {formatTime(booking.start_time)}
          </strong>
        </div>

        <div className="meta-item">
          <span>End Time</span>
          <strong>
            {formatTime(booking.end_time)}
          </strong>
        </div>

        <div className="meta-item">
          <span>Last Updated</span>
          <strong>
            {booking.updated_at
              ? new Date(
                  booking.updated_at
                ).toLocaleDateString("en-NZ", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </strong>
        </div>

      </section>

      {/* Photographer-only PATCH form. The Express API revalidates every change. */}
      {editing && ["pending", "confirmed"].includes(booking.status) && (
        <section className="booking-edit-card" aria-label="Edit booking details">
          <p className="card-eyebrow">Edit Booking</p>
          <h2>Update booking details</h2>
          <p className="booking-edit-hint">
            Dates and times are checked against your availability and existing
            bookings. Client, service, price and status cannot be edited here.
          </p>
          {(existingInvoice || existingGallery) && (
            <p className="booking-edit-hint">
              This booking has an invoice or gallery. You can update its
              location or notes, but the API will reject rescheduling.
            </p>
          )}
          <form onSubmit={handleSaveEdit}>
            <div className="booking-edit-fields">
              <label>
                Booking date
                <input
                  type="date"
                  value={editForm.booking_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, booking_date: e.target.value }))}
                  required
                  disabled={savingEdit}
                />
              </label>
              <label>
                Start time
                <input
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) => setEditForm((f) => ({ ...f, start_time: e.target.value }))}
                  required
                  disabled={savingEdit}
                />
              </label>
              <label>
                Location
                <input
                  type="text"
                  value={editForm.location}
                  maxLength={300}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                  disabled={savingEdit}
                />
              </label>
              <label className="booking-edit-notes">
                Notes
                <textarea
                  value={editForm.notes}
                  maxLength={2000}
                  rows={4}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  disabled={savingEdit}
                />
              </label>
            </div>
            <div className="booking-edit-actions">
              <button type="submit" className="action-button confirm-button" disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" className="action-button secondary-action" onClick={cancelEdit} disabled={savingEdit}>
                Discard Changes
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Actions */}

      <section className="booking-actions-card">

        <div className="actions-heading">

          <p className="card-eyebrow">
            Booking Actions
          </p>

          <h2>
            Manage this booking
          </h2>

        </div>

        <div className="booking-actions-right">
          {renderActions()}
          {["pending", "confirmed"].includes(booking.status) && (
            <button
              type="button"
              className="action-button decline-button booking-delete-button"
              onClick={handleDeleteBooking}
              disabled={updating || savingEdit || deleting || Boolean(existingInvoice || existingGallery)}
              title={existingInvoice || existingGallery
                ? "Cannot delete a booking with an invoice or gallery"
                : "Permanently delete this booking"}
            >
              {deleting ? "Deleting..." : "Delete Booking"}
            </button>
          )}
        </div>

      </section>

    </div>
  );
}