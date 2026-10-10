import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    BiImageAdd,
    BiTrash,
} from "react-icons/bi";

import { supabase } from "../../lib/supabaseClient"; // Storage uploads only; database writes use Express.
import { apiGetPhotographerServicesContext, apiCreatePhotographerService } from "../../services/photographerServicesApi";

import "./NewService.css";

const SERVICE_MEDIA_BUCKET = "service-media";

const MAX_IMAGE_SIZE =
    25 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

export default function NewService() {
    const navigate = useNavigate();

    const [formData, setFormData] =
        useState({
            name: "",
            description: "",
            price: "",
            duration_minutes: "",
            deposit_amount: "",
            is_active: true,
        });

    const [imageFile, setImageFile] =
        useState(null);

    const [imagePreview, setImagePreview] =
        useState("");

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState("");

    const [success, setSuccess] =
        useState("");

    const submitLock = useRef(false);

    function clearMessages() {
        setError("");
        setSuccess("");
    }

    function handleChange(event) {
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

        clearMessages();
    }

    function handleImageChange(event) {
        const file =
            event.target.files?.[0];

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
    }

    function removeImage() {
        clearMessages();

        if (imagePreview) {
            URL.revokeObjectURL(
                imagePreview
            );
        }

        setImageFile(null);
        setImagePreview("");
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (
            submitLock.current ||
            loading
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

        // =================================================
        // Validation
        // =================================================

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
            !Number.isInteger(duration) ||
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

        submitLock.current = true;
        setLoading(true);

        let uploadedStoragePath = null;

        try {
            // The API resolves the authenticated photographer, never trust a supplied owner ID.
            const { data: context } = await apiGetPhotographerServicesContext();
            const photographerId = context.photographer_id;

            // =================================================
            // Upload service image
            // =================================================

            let imageUrl = null;

            if (imageFile) {
                const extension =
                    ALLOWED_IMAGE_TYPES[
                        imageFile.type
                    ];

                const uniqueId =
                    crypto.randomUUID();

                const storagePath = [
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
                    storagePath,
                    imageFile,
                    {
                        cacheControl:
                            "3600",

                        contentType:
                            imageFile.type,

                        upsert: false,
                    }
                );

                if (uploadError) {
                    throw uploadError;
                }

                uploadedStoragePath =
                    storagePath;

                const {
                    data:
                        publicUrlData,
                } =
                    bucket.getPublicUrl(
                        storagePath
                    );

                imageUrl =
                    publicUrlData?.publicUrl ||
                    null;

                if (!imageUrl) {
                    throw new Error(
                        "Unable to create the public service image URL."
                    );
                }
            }

            // =================================================
            // Create service
            // =================================================

            const { data } = await apiCreatePhotographerService({
                name,
                description: description || null,
                price,
                duration_minutes: duration,
                deposit_amount: deposit,
                is_active: formData.is_active,
                image_path: uploadedStoragePath,
            });
            if (!data) throw new Error("The service could not be created.");

            setSuccess(
                "Service created successfully."
            );

            setTimeout(() => {
                navigate(
                    "/photographer/services"
                );
            }, 700);
        } catch (err) {
            console.error(
                "Error creating service:",
                err
            );

            /*
             * If the image uploaded but
             * the database insert failed,
             * clean up the orphaned file.
             */
            if (
                uploadedStoragePath
            ) {
                const {
                    error:
                        cleanupError,
                } = await supabase.storage
                    .from(
                        SERVICE_MEDIA_BUCKET
                    )
                    .remove([
                        uploadedStoragePath,
                    ]);

                if (cleanupError) {
                    console.error(
                        "Unable to clean up uploaded service image:",
                        cleanupError
                    );
                }
            }

            setError(
                err?.message ||
                    "Unable to create the service."
            );
        } finally {
            submitLock.current = false;
            setLoading(false);
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

    return (
        <div className="new-service-page">
            <header className="new-service-header">
                <div>
                    <p className="page-eyebrow">
                        LensFlow / Services
                    </p>

                    <h1>
                        New Service
                    </h1>

                    <p className="page-description">
                        Create a photography
                        service that you can
                        offer to your clients.
                    </p>
                </div>
            </header>

            <form
                className="new-service-form"
                onSubmit={
                    handleSubmit
                }
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
                            Add the basic
                            information about
                            the photography
                            service.
                        </p>
                    </div>

                    <div className="form-grid">
                        <div className="form-field form-field-full">
                            <label htmlFor="name">
                                Service Name
                                <span>
                                    *
                                </span>
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
                                maxLength={
                                    150
                                }
                                disabled={
                                    loading
                                }
                                required
                            />

                            <small>
                                Choose a clear
                                name that
                                clients will
                                easily
                                understand.
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
                                disabled={
                                    loading
                                }
                            />

                            <small>
                                Explain what
                                clients
                                receive as
                                part of this
                                service.
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
                            Pricing &
                            Duration
                        </h2>

                        <p>
                            Set the price,
                            booking duration
                            and optional
                            deposit.
                        </p>
                    </div>

                    <div className="form-grid form-grid-three">
                        <div className="form-field">
                            <label htmlFor="price">
                                Price (NZD)
                                <span>
                                    *
                                </span>
                            </label>

                            <div className="input-with-prefix">
                                <span>
                                    $
                                </span>

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
                                    disabled={
                                        loading
                                    }
                                    required
                                />
                            </div>

                            <small>
                                The full price
                                charged for
                                the service.
                            </small>
                        </div>

                        <div className="form-field">
                            <label htmlFor="duration_minutes">
                                Duration
                                <span>
                                    *
                                </span>
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
                                    disabled={
                                        loading
                                    }
                                    required
                                />

                                <span>
                                    min
                                </span>
                            </div>

                            <small>
                                How long the
                                photography
                                session takes.
                            </small>
                        </div>

                        <div className="form-field">
                            <label htmlFor="deposit_amount">
                                Deposit
                            </label>

                            <div className="input-with-prefix">
                                <span>
                                    $
                                </span>

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
                                    disabled={
                                        loading
                                    }
                                />
                            </div>

                            <small>
                                Optional
                                deposit
                                required to
                                secure a
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
                            Add a photograph
                            that visually
                            represents this
                            service.
                        </p>
                    </div>

                    <div className="service-image-field">
                        {imagePreview ? (
                            <div className="service-image-preview-wrap">
                                <img
                                    className="service-image-preview"
                                    src={
                                        imagePreview
                                    }
                                    alt="Service preview"
                                />

                                <div className="service-image-overlay">
                                    <button
                                        type="button"
                                        className="service-image-remove"
                                        onClick={
                                            removeImage
                                        }
                                        disabled={
                                            loading
                                        }
                                    >
                                        <BiTrash
                                            aria-hidden="true"
                                        />

                                        Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="service-image-empty">
                                <BiImageAdd
                                    aria-hidden="true"
                                />

                                <strong>
                                    Add a service
                                    image
                                </strong>

                                <span>
                                    Choose an image
                                    that represents
                                    this photography
                                    service.
                                </span>
                            </div>
                        )}

                        <div className="service-image-controls">
                            <label
                                htmlFor="service-image-upload"
                                className={
                                    loading
                                        ? "service-upload-button service-upload-button--disabled"
                                        : "service-upload-button"
                                }
                            >
                                <BiImageAdd
                                    aria-hidden="true"
                                />

                                {imagePreview
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
                                disabled={
                                    loading
                                }
                            />
                        </div>

                        <small className="service-image-help">
                            JPEG, PNG or WebP.
                            Maximum 25 MB. A
                            landscape image is
                            recommended for the
                            best appearance on
                            your public website.
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
                            Control whether
                            clients can
                            currently book this
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
                            disabled={
                                loading
                            }
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
                            Unable to create
                            service
                        </strong>

                        <p>
                            {error}
                        </p>
                    </div>
                )}

                {success && (
                    <div className="form-message success-message">
                        <strong>
                            Service created
                        </strong>

                        <p>
                            {success}
                        </p>
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
                        disabled={
                            loading
                        }
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        className="primary-button"
                        disabled={
                            loading
                        }
                    >
                        {loading ? (
                            "Creating..."
                        ) : (
                            <>
                                <span>
                                    +
                                </span>

                                Create Service
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}