import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BiImageAdd,
  BiTrash,
} from "react-icons/bi";

import { supabase } from "../../lib/supabaseClient"; // Storage operations only.
import { apiGetPhotographerService, apiUpdatePhotographerService } from "../../services/photographerServicesApi";

import "./EditService.css";

const SERVICE_MEDIA_BUCKET = "service-media";

const MAX_IMAGE_SIZE =
  25 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export default function EditService() {
  const navigate = useNavigate();
  const { service_id } = useParams();

  const [service, setService] =
    useState(null);

  const [formData, setFormData] =
    useState({
      name: "",
      description: "",
      price: "",
      duration_minutes: "",
      deposit_amount: "",
      is_active: true,
    });

  /*
   * Existing image currently stored
   * against the service.
   */
  const [
    existingImageUrl,
    setExistingImageUrl,
  ] = useState("");

  /*
   * Newly selected replacement file.
   */
  const [
    imageFile,
    setImageFile,
  ] = useState(null);

  /*
   * Browser object URL used only for
   * previewing the selected replacement.
   */
  const [
    imagePreview,
    setImagePreview,
  ] = useState("");

  /*
   * True when the photographer has
   * chosen to remove the current image.
   */
  const [
    removeCurrentImage,
    setRemoveCurrentImage,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const saveLock = useRef(false);

  useEffect(() => {
    if (service_id) {
      fetchService();
    } else {
      setError(
        "No service was specified."
      );

      setLoading(false);
    }
  }, [service_id]);

  /*
   * Clean up browser preview URL when
   * this page is removed.
   */
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview
        );
      }
    };
  }, [imagePreview]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  async function fetchService() {
    setLoading(true);
    setError("");

    try {
      const { data } = await apiGetPhotographerService(service_id);
      if (!data) throw new Error("Service could not be found.");

      setService(data);

      setFormData({
        name: data.name || "",

        description:
          data.description || "",

        price:
          data.price !== null &&
          data.price !== undefined
            ? String(data.price)
            : "",

        duration_minutes:
          data.duration_minutes !==
            null &&
          data.duration_minutes !==
            undefined
            ? String(
                data.duration_minutes
              )
            : "",

        deposit_amount:
          data.deposit_amount !==
            null &&
          data.deposit_amount !==
            undefined
            ? String(
                data.deposit_amount
              )
            : "",

        is_active:
          data.is_active ?? true,
      });

      setExistingImageUrl(
        data.image_url || ""
      );

      setRemoveCurrentImage(false);

      /*
       * Clear any replacement selection
       * if the service is reloaded.
       */
      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview
        );
      }

      setImageFile(null);
      setImagePreview("");
    } catch (err) {
      console.error(
        "Error loading service:",
        err
      );

      if (
        err.code === "PGRST116"
      ) {
        setError(
          "Service could not be found or you do not have permission to access it."
        );
      } else {
        setError(
          err.message ||
            "Unable to load the service."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleChange(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setFormData(
      (current) => ({
        ...current,

        [name]:
          type === "checkbox"
            ? checked
            : value,
      })
    );

    clearMessages();
  }

  function handleImageChange(
    event
  ) {
    const file =
      event.target.files?.[0];

    /*
     * Reset so selecting the same file
     * again still triggers onChange.
     */
    event.target.value = "";

    clearMessages();

    if (!file) {
      return;
    }

    if (
      !ALLOWED_IMAGE_TYPES[
        file.type
      ]
    ) {
      setError(
        "Please choose a JPEG, PNG or WebP image."
      );

      return;
    }

    if (!file.size) {
      setError(
        "The selected image is empty."
      );

      return;
    }

    if (
      file.size >
      MAX_IMAGE_SIZE
    ) {
      setError(
        "Please choose an image no larger than 25 MB."
      );

      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(
        imagePreview
      );
    }

    const previewUrl =
      URL.createObjectURL(file);

    setImageFile(file);
    setImagePreview(previewUrl);

    /*
     * Selecting a replacement means the
     * service will continue to have an
     * image.
     */
    setRemoveCurrentImage(false);
  }

  function handleRemoveImage() {
    clearMessages();

    if (imagePreview) {
      URL.revokeObjectURL(
        imagePreview
      );
    }

    setImageFile(null);
    setImagePreview("");

    /*
     * Don't delete from Storage yet.
     * We wait until Save Changes succeeds.
     */
    setRemoveCurrentImage(true);
  }

  function handleRestoreImage() {
    clearMessages();

    setRemoveCurrentImage(false);
  }

  /*
   * Extract a service-media Storage path
   * from one of our public Supabase URLs.
   *
   * Example:
   *
   * https://project.supabase.co/
   * storage/v1/object/public/service-media/
   * photographer-id/services/file.jpg
   *
   * becomes:
   *
   * photographer-id/services/file.jpg
   */
  function getServiceStoragePath(
    publicUrl
  ) {
    if (!publicUrl) {
      return null;
    }

    try {
      const url =
        new URL(publicUrl);

      const marker =
        `/storage/v1/object/public/${SERVICE_MEDIA_BUCKET}/`;

      const markerIndex =
        url.pathname.indexOf(
          marker
        );

      if (markerIndex === -1) {
        return null;
      }

      const encodedPath =
        url.pathname.slice(
          markerIndex +
            marker.length
        );

      if (!encodedPath) {
        return null;
      }

      return decodeURIComponent(
        encodedPath
      );
    } catch {
      return null;
    }
  }

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    if (
      saveLock.current ||
      saving
    ) {
      return;
    }

    clearMessages();

    const name =
      formData.name.trim();

    const description =
      formData.description.trim();

    const price =
      Number(formData.price);

    const duration =
      Number(
        formData.duration_minutes
      );

    const deposit =
      formData.deposit_amount.trim() ===
      ""
        ? 0
        : Number(
            formData.deposit_amount
          );

    // =====================================================
    // Validation
    // =====================================================

    if (!name) {
      setError(
        "Please enter a service name."
      );

      return;
    }

    if (name.length > 150) {
      setError(
        "Service name must be 150 characters or less."
      );

      return;
    }

    if (
      Number.isNaN(price) ||
      price < 0
    ) {
      setError(
        "Please enter a valid price of $0 or more."
      );

      return;
    }

    if (
      !Number.isInteger(
        duration
      ) ||
      duration <= 0
    ) {
      setError(
        "Duration must be a whole number greater than 0."
      );

      return;
    }

    if (
      Number.isNaN(deposit) ||
      deposit < 0
    ) {
      setError(
        "Please enter a valid deposit amount of $0 or more."
      );

      return;
    }

    if (deposit > price) {
      setError(
        "Deposit cannot be greater than the service price."
      );

      return;
    }

    if (!service) {
      setError(
        "The service could not be loaded."
      );

      return;
    }

    saveLock.current = true;
    setSaving(true);

    /*
     * Tracks a newly uploaded image.
     * If the database update fails,
     * this gets cleaned up.
     */
    let newStoragePath = null;

    try {
      const photographerId =
        service.photographer_id;

      if (!photographerId) {
        throw new Error(
          "The photographer for this service could not be determined."
        );
      }

      /*
       * Keep the original image unless
       * it has been removed or replaced.
       */
      let nextImageUrl =
        existingImageUrl || null;

      // ===================================================
      // Upload replacement image
      // ===================================================

      if (imageFile) {
        const extension =
          ALLOWED_IMAGE_TYPES[
            imageFile.type
          ];

        const uniqueId =
          crypto.randomUUID();

        newStoragePath = [
          photographerId,
          "services",
          `${uniqueId}.${extension}`,
        ].join("/");

        const bucket =
          supabase.storage.from(
            SERVICE_MEDIA_BUCKET
          );

        const {
          error: uploadError,
        } = await bucket.upload(
          newStoragePath,
          imageFile,
          {
            cacheControl: "3600",

            contentType:
              imageFile.type,

            upsert: false,
          }
        );

        if (uploadError) {
          throw uploadError;
        }

        const {
          data:
            publicUrlData,
        } =
          bucket.getPublicUrl(
            newStoragePath
          );

        nextImageUrl =
          publicUrlData?.publicUrl ||
          null;

        if (!nextImageUrl) {
          throw new Error(
            "Unable to create the public service image URL."
          );
        }
      } else if (
        removeCurrentImage
      ) {
        nextImageUrl = null;
      }

      // ===================================================
      // Update service
      // ===================================================

      const changes = {
        name,
        description: description || null,
        price,
        duration_minutes: duration,
        deposit_amount: deposit,
        is_active: formData.is_active,
      };
      if (imageFile) changes.image_path = newStoragePath;
      else if (removeCurrentImage) changes.image_path = null;
      const { data: updatedService } = await apiUpdatePhotographerService(service_id, changes);
      if (!updatedService) throw new Error("The service could not be updated.");

      // ===================================================
      // Delete old Storage image
      // ===================================================

      /*
       * Only remove the old file if:
       *
       * 1. there was an old image, and
       * 2. the image was replaced or
       *    explicitly removed, and
       * 3. the old URL belongs to our
       *    service-media bucket.
       *
       * Database update happens first so
       * a Storage deletion failure never
       * destroys the only valid image.
       */
      if (
        existingImageUrl &&
        (imageFile ||
          removeCurrentImage)
      ) {
        const oldStoragePath =
          getServiceStoragePath(
            existingImageUrl
          );

        if (oldStoragePath) {
          const {
            error:
              deleteOldError,
          } =
            await supabase.storage
              .from(
                SERVICE_MEDIA_BUCKET
              )
              .remove([
                oldStoragePath,
              ]);

          if (deleteOldError) {
            /*
             * The service update itself
             * succeeded, so we don't
             * treat old-file cleanup as
             * a failed service update.
             */
            console.error(
              "Unable to remove old service image:",
              deleteOldError
            );
          }
        }
      }

      // ===================================================
      // Update local state
      // ===================================================

      setService(
        updatedService
      );

      setExistingImageUrl(
        nextImageUrl || ""
      );

      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview
        );
      }

      setImageFile(null);
      setImagePreview("");
      setRemoveCurrentImage(false);

      setSuccess(
        "Service updated successfully."
      );

      setTimeout(() => {
        navigate(
          "/photographer/services"
        );
      }, 700);
    } catch (err) {
      console.error(
        "Error updating service:",
        err
      );

      /*
       * If a replacement image uploaded
       * successfully but the service
       * database update failed, remove
       * the newly uploaded image.
       */
      if (newStoragePath) {
        const {
          error:
            cleanupError,
        } =
          await supabase.storage
            .from(
              SERVICE_MEDIA_BUCKET
            )
            .remove([
              newStoragePath,
            ]);

        if (cleanupError) {
          console.error(
            "Unable to clean up replacement service image:",
            cleanupError
          );
        }
      }

      setError(
        err?.message ||
          "Unable to update the service."
      );
    } finally {
      saveLock.current = false;

      setSaving(false);
    }
  }

  function handleCancel() {
    if (imagePreview) {
      URL.revokeObjectURL(
        imagePreview
      );
    }

    navigate(
      "/photographer/services"
    );
  }

  // =======================================================
  // Loading
  // =======================================================

  if (loading) {
    return (
      <div className="edit-service-page">
        <div className="edit-service-state">
          <span className="edit-service-spinner" />

          <p>
            Loading service...
          </p>
        </div>
      </div>
    );
  }

  // =======================================================
  // Load error
  // =======================================================

  if (error && !service) {
    return (
      <div className="edit-service-page">
        <div className="edit-service-state error-state">
          <h2>
            Unable to load service
          </h2>

          <p>{error}</p>

          <div className="state-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                navigate(
                  "/photographer/services"
                )
              }
            >
              Back to Services
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={
                fetchService
              }
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*
   * Priority:
   *
   * replacement preview
   * → existing image
   * → no image
   */
  const displayedImage =
    imagePreview ||
    (!removeCurrentImage
      ? existingImageUrl
      : "");

  return (
    <div className="edit-service-page">
      <header className="edit-service-header">
        <div>
          <p className="page-eyebrow">
            LensFlow / Services
          </p>

          <h1>
            Edit Service
          </h1>

          <p className="page-description">
            Update the details,
            pricing and availability
            of this photography
            service.
          </p>
        </div>
      </header>

      <form
        className="edit-service-form"
        onSubmit={handleSubmit}
      >
        {/* =================================================
            SERVICE DETAILS
            ================================================= */}

        <section className="form-section">
          <div className="form-section-heading">
            <h2>
              Service Details
            </h2>

            <p>
              Update the basic
              information about this
              photography service.
            </p>
          </div>

          <div className="form-grid">
            <div className="form-field form-field-full">
              <label htmlFor="name">
                Service Name
                <span>*</span>
              </label>

              <input
                id="name"
                name="name"
                type="text"
                value={
                  formData.name
                }
                onChange={
                  handleChange
                }
                placeholder="e.g. Wedding Photography"
                maxLength={150}
                disabled={saving}
                required
              />

              <small>
                Choose a clear name
                that clients will
                easily understand.
              </small>
            </div>

            <div className="form-field form-field-full">
              <label htmlFor="description">
                Description
              </label>

              <textarea
                id="description"
                name="description"
                value={
                  formData.description
                }
                onChange={
                  handleChange
                }
                placeholder="Describe what is included with this service..."
                rows={5}
                disabled={saving}
              />

              <small>
                Explain what clients
                receive as part of
                this service.
              </small>
            </div>
          </div>
        </section>

        {/* =================================================
            PRICING
            ================================================= */}

        <section className="form-section">
          <div className="form-section-heading">
            <h2>
              Pricing & Duration
            </h2>

            <p>
              Update the service
              price, booking duration
              and deposit.
            </p>
          </div>

          <div className="form-grid form-grid-three">
            <div className="form-field">
              <label htmlFor="price">
                Price (NZD)
                <span>*</span>
              </label>

              <div className="input-with-prefix">
                <span>$</span>

                <input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    formData.price
                  }
                  onChange={
                    handleChange
                  }
                  placeholder="0.00"
                  disabled={saving}
                  required
                />
              </div>

              <small>
                The full price
                charged for the
                service.
              </small>
            </div>

            <div className="form-field">
              <label htmlFor="duration_minutes">
                Duration
                <span>*</span>
              </label>

              <div className="input-with-suffix">
                <input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min="1"
                  step="1"
                  value={
                    formData.duration_minutes
                  }
                  onChange={
                    handleChange
                  }
                  placeholder="60"
                  disabled={saving}
                  required
                />

                <span>min</span>
              </div>

              <small>
                How long the
                photography session
                takes.
              </small>
            </div>

            <div className="form-field">
              <label htmlFor="deposit_amount">
                Deposit
              </label>

              <div className="input-with-prefix">
                <span>$</span>

                <input
                  id="deposit_amount"
                  name="deposit_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    formData.deposit_amount
                  }
                  onChange={
                    handleChange
                  }
                  placeholder="0.00"
                  disabled={saving}
                />
              </div>

              <small>
                Optional deposit
                required to secure a
                booking.
              </small>
            </div>
          </div>
        </section>

        {/* =================================================
            SERVICE IMAGE
            ================================================= */}

        <section className="form-section">
          <div className="form-section-heading">
            <h2>
              Service Image
            </h2>

            <p>
              Replace or remove the
              photograph used to
              represent this service.
            </p>
          </div>

          <div className="service-image-field">
            {displayedImage ? (
              <div className="service-image-preview-wrap">
                <img
                  className="service-image-preview"
                  src={
                    displayedImage
                  }
                  alt={`${formData.name || "Service"} preview`}
                />

                <div className="service-image-overlay">
                  <button
                    type="button"
                    className="service-image-remove"
                    onClick={
                      handleRemoveImage
                    }
                    disabled={saving}
                  >
                    <BiTrash
                      aria-hidden="true"
                    />

                    Remove
                  </button>
                </div>

                {imageFile && (
                  <span className="service-image-badge">
                    New image
                  </span>
                )}
              </div>
            ) : (
              <div className="service-image-empty">
                <BiImageAdd
                  aria-hidden="true"
                />

                <strong>
                  {removeCurrentImage &&
                  existingImageUrl
                    ? "Image will be removed"
                    : "No service image"}
                </strong>

                <span>
                  {removeCurrentImage &&
                  existingImageUrl
                    ? "Save your changes to remove the current image, or restore it below."
                    : "Choose a photograph that represents this photography service."}
                </span>
              </div>
            )}

            <div className="service-image-controls">
              <label
                htmlFor="service-image-upload"
                className={
                  saving
                    ? "service-upload-button service-upload-button--disabled"
                    : "service-upload-button"
                }
              >
                <BiImageAdd
                  aria-hidden="true"
                />

                {displayedImage
                  ? "Replace image"
                  : "Choose image"}
              </label>

              <input
                id="service-image-upload"
                className="service-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={
                  handleImageChange
                }
                disabled={saving}
              />

              {removeCurrentImage &&
                existingImageUrl &&
                !imageFile && (
                  <button
                    type="button"
                    className="service-restore-button"
                    onClick={
                      handleRestoreImage
                    }
                    disabled={
                      saving
                    }
                  >
                    Restore current image
                  </button>
                )}
            </div>

            <small className="service-image-help">
              JPEG, PNG or WebP.
              Maximum 25 MB. A
              landscape image is
              recommended for the
              best appearance on your
              public website.
            </small>
          </div>
        </section>

        {/* =================================================
            STATUS
            ================================================= */}

        <section className="form-section service-status-section">
          <div className="form-section-heading">
            <h2>
              Service Status
            </h2>

            <p>
              Control whether clients
              can currently book this
              service.
            </p>
          </div>

          <label className="status-toggle">
            <input
              type="checkbox"
              name="is_active"
              checked={
                formData.is_active
              }
              onChange={
                handleChange
              }
              disabled={saving}
            />

            <span className="toggle-slider" />

            <span className="toggle-content">
              <strong>
                {formData.is_active
                  ? "Service is active"
                  : "Service is inactive"}
              </strong>

              <small>
                {formData.is_active
                  ? "This service can be offered to clients."
                  : "This service is hidden from new bookings."}
              </small>
            </span>
          </label>
        </section>

        {/* =================================================
            MESSAGES
            ================================================= */}

        {error && (
          <div className="form-message error-message">
            <strong>
              Unable to update service
            </strong>

            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="form-message success-message">
            <strong>
              Service updated
            </strong>

            <p>{success}</p>
          </div>
        )}

        {/* =================================================
            ACTIONS
            ================================================= */}

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={
              handleCancel
            }
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={saving}
          >
            {saving ? (
              "Saving..."
            ) : (
              <>
                Save Changes
                <span>→</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}