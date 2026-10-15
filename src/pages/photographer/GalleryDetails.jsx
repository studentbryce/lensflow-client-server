import {
    useCallback,
    useEffect,
    useRef,
    useMemo,
    useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    BiArrowBack,
    BiCalendar,
    BiCheckCircle,
    BiChevronLeft,
    BiChevronRight,
    BiEdit,
    BiImage,
    BiImages,
    BiLinkExternal,
    BiLockAlt,
    BiMap,
    BiPlay,
    BiTimeFive,
    BiTrash,
    BiUpload,
    BiUser,
    BiX,
} from "react-icons/bi";
import { supabase } from "../../lib/supabaseClient";
import { apiGetPhotographerGallery, apiUpdatePhotographerGallery, apiCreatePhotographerGalleryMedia, apiDeletePhotographerGalleryMedia, apiDeletePhotographerGallery } from "../../services/photographerGalleriesApi";
import { useAuth } from "../../context/authStore";
import "./GalleryDetails.css";

const MAX_PHOTO_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_VIDEO_SIZE = 250 * 1024 * 1024; // 250 MB

const ALLOWED_PHOTO_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
];

const ALLOWED_VIDEO_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
];

const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-NZ", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const formatDateTime = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleString("en-NZ", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const formatTime = (value) => {
    if (!value) return "—";

    const [hours, minutes] = String(value).split(":");
    if (hours === undefined || minutes === undefined) return value;

    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return date.toLocaleTimeString("en-NZ", {
        hour: "numeric",
        minute: "2-digit",
    });
};

// ------------------------------------------------------------
// Get the client name from the linked profile.
// ------------------------------------------------------------
const getClientName = (client) => {
    if (!client) return "Unknown client";

    const profile = client.profile;

    if (profile?.first_name || profile?.last_name) {
        return `${profile.first_name || ""} ${profile.last_name || ""
            }`.trim();
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

const getMediaType = (media) => {
    if (!media) return "image";

    if (media.media_type === "video") return "video";

    if (
        media.mime_type &&
        media.mime_type.toLowerCase().startsWith("video/")
    ) {
        return "video";
    }

    return "image";
};

const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "—";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]
        }`;
};

// ------------------------------------------------------------
// Create a safe filename for Supabase Storage.
// ------------------------------------------------------------
const sanitiseFileName = (fileName) => {
    const extension = fileName.includes(".")
        ? fileName.substring(fileName.lastIndexOf("."))
        : "";

    const baseName = fileName
        .substring(
            0,
            fileName.length - extension.length
        )
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return `${baseName || "media"}${extension.toLowerCase()}`;
};

export default function GalleryDetails() {
    const { gallery_id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const fileInputRef = useRef(null);

    const [gallery, setGallery] = useState(null);
    const [client, setClient] = useState(null);
    const [booking, setBooking] = useState(null);
    const [media, setMedia] = useState([]);
    const [selectedMedia, setSelectedMedia] = useState(null);

    const [photographerId, setPhotographerId] = useState(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");
    const [deletingMediaId, setDeletingMediaId] =
        useState(null);
    const [deletingGallery, setDeletingGallery] =
        useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // ------------------------------------------------------------
    // Generate signed URLs for private gallery media.
    // ------------------------------------------------------------
    const addSignedUrls = useCallback(async (mediaItems) => {
        if (!mediaItems?.length) {
            return [];
        }

        const mediaWithUrls = await Promise.all(
            mediaItems.map(async (mediaItem) => {
                if (!mediaItem.storage_path) {
                    return {
                        ...mediaItem,
                        signedUrl: null,
                    };
                }

                const { data, error: signedUrlError } =
                    await supabase.storage
                        .from("client-media")
                        .createSignedUrl(
                            mediaItem.storage_path,
                            60 * 60
                        );

                if (signedUrlError) {
                    console.warn(
                        "Unable to create signed URL:",
                        signedUrlError
                    );

                    return {
                        ...mediaItem,
                        signedUrl: null,
                    };
                }

                return {
                    ...mediaItem,
                    signedUrl: data?.signedUrl || null,
                };
            })
        );

        return mediaWithUrls;
    }, []);

    // ------------------------------------------------------------
    // Load gallery
    // ------------------------------------------------------------
    const loadGallery = useCallback(async () => {
        if (!user?.id || !gallery_id) return;

        try {
            setLoading(true);
            setError("");
            setSuccess("");

            const payload = await apiGetPhotographerGallery(gallery_id);
            setPhotographerId(payload.photographer_id);
            setGallery(payload.gallery);
            setClient(payload.client || null);
            setBooking(payload.booking || null);
            const mediaData = payload.media;

            const mediaWithUrls = await addSignedUrls(
                mediaData || []
            );

            setMedia(mediaWithUrls);
        } catch (err) {
            console.error("Error loading gallery:", err);

            setError(
                err?.message ||
                "Unable to load the gallery. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }, [
        gallery_id,
        user?.id,
        addSignedUrls,
    ]);

    useEffect(() => {
        loadGallery();
    }, [loadGallery]);

    const selectedIndex = useMemo(() => {
        if (!selectedMedia) return -1;

        return media.findIndex(
            (item) => item.media_id === selectedMedia.media_id
        );
    }, [media, selectedMedia]);

    const navigateMedia = useCallback((direction) => {
        if (selectedIndex === -1 || media.length === 0) return;

        const nextIndex =
            (selectedIndex + direction + media.length) % media.length;

        setSelectedMedia(media[nextIndex]);
    }, [media, selectedIndex]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!selectedMedia) return;

            if (event.key === "Escape") {
                setSelectedMedia(null);
            } else if (event.key === "ArrowRight") {
                navigateMedia(1);
            } else if (event.key === "ArrowLeft") {
                navigateMedia(-1);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedMedia, navigateMedia]);

    useEffect(() => {
        if (!selectedMedia) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [selectedMedia]);

    // ------------------------------------------------------------
    // Update gallery settings
    // ------------------------------------------------------------
    const updateGallerySetting = async (
        field,
        value
    ) => {
        if (!gallery || !photographerId) return;

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            const data = await apiUpdatePhotographerGallery(gallery.gallery_id, { [field]: value });

            setGallery(data);

            setSuccess(
                field === "is_published"
                    ? value
                        ? "Gallery published successfully."
                        : "Gallery unpublished successfully."
                    : value
                        ? "Client downloads enabled."
                        : "Client downloads disabled."
            );

            setTimeout(() => {
                setSuccess("");
            }, 3000);
        } catch (err) {
            console.error(
                "Error updating gallery:",
                err
            );

            setError(
                err?.message ||
                "Unable to update the gallery. Please try again."
            );
        } finally {
            setSaving(false);
        }
    };

    // ------------------------------------------------------------
    // Open file picker
    // ------------------------------------------------------------
    const openFilePicker = () => {
        if (uploading) return;

        fileInputRef.current?.click();
    };

    // ------------------------------------------------------------
    // Upload media
    // ------------------------------------------------------------
    const handleMediaUpload = async (event) => {
        const selectedFiles = Array.from(
            event.target.files || []
        );

        // Reset input so selecting the same file again works.
        event.target.value = "";

        if (!selectedFiles.length) {
            return;
        }

        if (!photographerId || !gallery) {
            setError(
                "Gallery information is not available. Please refresh the page."
            );
            return;
        }

        try {
            setUploading(true);
            setError("");
            setSuccess("");

            const totalFiles = selectedFiles.length;
            let uploadedCount = 0;

            for (const file of selectedFiles) {
                uploadedCount += 1;

                setUploadProgress(
                    `Uploading ${uploadedCount} of ${totalFiles}: ${file.name}`
                );

                const isPhoto = ALLOWED_PHOTO_TYPES.includes(
                    file.type
                );

                const isVideo = ALLOWED_VIDEO_TYPES.includes(
                    file.type
                );

                // ------------------------------------------------------
                // Validate file type
                // ------------------------------------------------------
                if (!isPhoto && !isVideo) {
                    throw new Error(
                        `"${file.name}" is not a supported file type. Please upload JPG, PNG, WebP, MP4, WebM, or MOV files.`
                    );
                }

                // ------------------------------------------------------
                // Validate file size
                // ------------------------------------------------------
                if (
                    isPhoto &&
                    file.size > MAX_PHOTO_SIZE
                ) {
                    throw new Error(
                        `"${file.name}" is larger than the 25 MB photo limit.`
                    );
                }

                if (
                    isVideo &&
                    file.size > MAX_VIDEO_SIZE
                ) {
                    throw new Error(
                        `"${file.name}" is larger than the 250 MB video limit.`
                    );
                }

                // ------------------------------------------------------
                // Create unique storage path
                // ------------------------------------------------------
                const safeFileName =
                    sanitiseFileName(file.name);

                const uniqueId =
                    typeof crypto !== "undefined" &&
                        crypto.randomUUID
                        ? crypto.randomUUID()
                        : `${Date.now()}-${Math.random()
                            .toString(36)
                            .substring(2)}`;

                const storagePath = [
                    photographerId,
                    gallery.gallery_id,
                    `${uniqueId}-${safeFileName}`,
                ].join("/");

                console.log("UPLOAD DEBUG:", {
                    photographerId,
                    galleryId: gallery.gallery_id,
                    storagePath,
                    currentUserId: user?.id,
                });

                // ------------------------------------------------------
                // Upload to private Supabase Storage bucket
                // ------------------------------------------------------
                const {
                    error: storageError,
                } = await supabase.storage
                    .from("client-media")
                    .upload(storagePath, file, {
                        cacheControl: "3600",
                        upsert: false,
                        contentType: file.type,
                    });

                if (storageError) {
                    throw storageError;
                }

                // ------------------------------------------------------
                // Create media database record
                // ------------------------------------------------------
                let mediaRecord;
                try {
                    mediaRecord = await apiCreatePhotographerGalleryMedia(gallery.gallery_id, {
                        file_name: file.name,
                        storage_path: storagePath,
                        media_type: isVideo ? "video" : "image",
                        mime_type: file.type,
                        file_size: file.size,
                        is_downloadable: true,
                    });
                } catch (mediaError) {
                    await supabase.storage.from("client-media").remove([storagePath]);
                    throw mediaError;
                }

                // ------------------------------------------------------
                // Generate signed URL for immediate display
                // ------------------------------------------------------
                let signedUrl = null;

                const {
                    data: signedUrlData,
                } = await supabase.storage
                    .from("client-media")
                    .createSignedUrl(
                        storagePath,
                        60 * 60
                    );

                if (signedUrlData?.signedUrl) {
                    signedUrl =
                        signedUrlData.signedUrl;
                }

                setMedia((currentMedia) => [
                    {
                        ...mediaRecord,
                        signedUrl,
                    },
                    ...currentMedia,
                ]);
            }

            setUploadProgress("");

            setSuccess(
                totalFiles === 1
                    ? "Media uploaded successfully."
                    : `${totalFiles} media files uploaded successfully.`
            );

            setTimeout(() => {
                setSuccess("");
            }, 4000);
        } catch (err) {
            console.error(
                "Error uploading media:",
                err
            );

            setUploadProgress("");

            setError(
                err?.message ||
                "Unable to upload media. Please try again."
            );
        } finally {
            setUploading(false);
        }
    };

    // ------------------------------------------------------------
    // Delete media
    // ------------------------------------------------------------
    const handleDeleteMedia = async (
        mediaItem
    ) => {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${mediaItem.file_name}"? This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            setDeletingMediaId(
                mediaItem.media_id
            );
            setError("");
            setSuccess("");

            // --------------------------------------------------------
            // Remove storage file first.
            // If this fails, keep the database record so the
            // photographer can retry rather than losing the reference.
            // --------------------------------------------------------
            if (mediaItem.storage_path) {
                const {
                    error: storageError,
                } = await supabase.storage
                    .from("client-media")
                    .remove([
                        mediaItem.storage_path,
                    ]);

                if (storageError) {
                    throw storageError;
                }
            }

            // Database deletion is handled by Express after the Storage removal.
            await apiDeletePhotographerGalleryMedia(gallery_id, mediaItem.media_id);

            setMedia((currentMedia) =>
                currentMedia.filter(
                    (item) =>
                        item.media_id !==
                        mediaItem.media_id
                )
            );

            setSuccess(
                "Media item deleted successfully."
            );

            setTimeout(() => {
                setSuccess("");
            }, 3000);
        } catch (err) {
            console.error(
                "Error deleting media:",
                err
            );

            setError(
                err?.message ||
                "Unable to delete the media item."
            );
        } finally {
            setDeletingMediaId(null);
        }
    };

    // ------------------------------------------------------------
    // Delete entire gallery
    // ------------------------------------------------------------
    const handleDeleteGallery = async () => {
        if (!gallery || !photographerId) {
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to permanently delete the gallery "${gallery.name}"?\n\nAll media associated with this gallery will also be deleted.\n\nThis action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            setDeletingGallery(true);
            setError("");
            setSuccess("");

            // The loaded media belongs to this authenticated gallery.
            const galleryMedia = media;

            // --------------------------------------------------------
            // 2. Remove files from Supabase Storage.
            // --------------------------------------------------------
            const storagePaths =
                (galleryMedia || [])
                    .map(
                        (item) =>
                            item.storage_path
                    )
                    .filter(Boolean);

            if (storagePaths.length > 0) {
                const {
                    error: storageError,
                } = await supabase.storage
                    .from("client-media")
                    .remove(storagePaths);

                if (storageError) {
                    throw storageError;
                }
            }

            // Express deletes the owned gallery and its media records.
            await apiDeletePhotographerGallery(gallery.gallery_id);

            // --------------------------------------------------------
            // 5. Return to Galleries page.
            // --------------------------------------------------------
            navigate(
                "/photographer/galleries"
            );
        } catch (err) {
            console.error(
                "Error deleting gallery:",
                err
            );

            setError(
                err?.message ||
                "Unable to delete the gallery. Please try again."
            );

            setDeletingGallery(false);
        }
    };

    // ------------------------------------------------------------
    // Media statistics
    // ------------------------------------------------------------
    const photos = media.filter((item) => getMediaType(item) === "image");
    const videos = media.filter((item) => getMediaType(item) === "video");
    const photoCount = photos.length;
    const videoCount = videos.length;

    // ------------------------------------------------------------
    // Loading state
    // ------------------------------------------------------------
    if (loading) {
        return (
            <div className="gallery-details-page">
                <div className="gallery-details-loading">
                    <div className="gallery-details-spinner" />
                    <p>Loading gallery...</p>
                </div>
            </div>
        );
    }

    // ------------------------------------------------------------
    // Error / gallery not found
    // ------------------------------------------------------------
    if (error && !gallery) {
        return (
            <div className="gallery-details-page">
                <div className="gallery-details-error">
                    <div className="gallery-details-error-icon">
                        <BiImage aria-hidden="true" />
                    </div>
                    <h2>Unable to load gallery</h2>
                    <p>{error}</p>
                    <div className="gallery-details-error-actions">
                        <button
                            type="button"
                            className="gallery-details-button secondary"
                            onClick={() => navigate("/photographer/galleries")}
                        >
                            Back to Galleries
                        </button>
                        <button
                            type="button"
                            className="gallery-details-button primary"
                            onClick={loadGallery}
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!gallery) return null;

    const clientName = getClientName(client);
    const bookingDate = getBookingDate(booking);
    const bookingTime = getBookingTime(booking);

    return (
        <div className="gallery-details-page photographer-gallery-details">
            <div className="gallery-details-container">
                <button
                    type="button"
                    className="gallery-details-back"
                    onClick={() => navigate("/photographer/galleries")}
                >
                    <BiArrowBack aria-hidden="true" />
                    Back to Galleries
                </button>

                <header className="gallery-details-header">
                    <div className="gallery-details-header-main">
                        <div className="gallery-details-eyebrow">Client gallery</div>
                        <div className="photographer-gallery-title-row">
                            <h1>{gallery.name}</h1>
                            <span
                                className={`gallery-details-status ${
                                    gallery.is_published ? "published" : "unpublished"
                                }`}
                            >
                                <span className="gallery-details-status-dot" />
                                {gallery.is_published ? "Published" : "Unpublished"}
                            </span>
                        </div>

                        <p className="gallery-details-description">
                            {gallery.description ||
                                "Manage this client gallery, access settings and uploaded media."}
                        </p>
                    </div>

                    <div className="gallery-details-header-actions">
                        <button
                            type="button"
                            className="gallery-details-button secondary"
                            onClick={() =>
                                navigate(`/photographer/galleries/${gallery.gallery_id}/edit`)
                            }
                            disabled={deletingGallery}
                        >
                            <BiEdit aria-hidden="true" />
                            Edit Gallery
                        </button>

                        <button
                            type="button"
                            className="gallery-details-button danger"
                            onClick={handleDeleteGallery}
                            disabled={deletingGallery}
                        >
                            <BiTrash aria-hidden="true" />
                            {deletingGallery ? "Deleting..." : "Delete Gallery"}
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="gallery-details-alert error">
                        <span className="gallery-details-alert-icon">!</span>
                        <span>{error}</span>
                        <button
                            type="button"
                            onClick={() => setError("")}
                            aria-label="Dismiss error"
                        >
                            ×
                        </button>
                    </div>
                )}

                {success && (
                    <div className="gallery-details-alert success">
                        <span className="gallery-details-alert-icon">✓</span>
                        <span>{success}</span>
                    </div>
                )}

                <section className="gallery-details-info">
                    <div className="gallery-info-card">
                        <div className="gallery-info-icon">
                            <BiUser aria-hidden="true" />
                        </div>
                        <div>
                            <span>Client</span>
                            <strong title={clientName}>{clientName}</strong>
                        </div>
                    </div>

                    <div className="gallery-info-card">
                        <div className="gallery-info-icon">
                            <BiCalendar aria-hidden="true" />
                        </div>
                        <div>
                            <span>Session date</span>
                            <strong>
                                {bookingDate ? formatDate(bookingDate) : "Not linked"}
                            </strong>
                        </div>
                    </div>

                    <div className="gallery-info-card">
                        <div className="gallery-info-icon">
                            <BiImage aria-hidden="true" />
                        </div>
                        <div>
                            <span>Photos</span>
                            <strong>{photoCount}</strong>
                        </div>
                    </div>

                    <div className="gallery-info-card">
                        <div className="gallery-info-icon">
                            <BiPlay aria-hidden="true" />
                        </div>
                        <div>
                            <span>Videos</span>
                            <strong>{videoCount}</strong>
                        </div>
                    </div>
                </section>

                <section className="photographer-gallery-access">
                    <div className="photographer-gallery-access-heading">
                        <div>
                            <span className="gallery-details-section-eyebrow">Gallery access</span>
                            <h2>Client visibility & downloads</h2>
                        </div>
                        <p>
                            Control whether the client can view this gallery and download its media.
                        </p>
                    </div>

                    <div className="photographer-gallery-access-grid">
                        <article
                            className={`photographer-gallery-access-card ${
                                gallery.is_published ? "active" : ""
                            }`}
                        >
                            <div className="photographer-gallery-access-icon">
                                {gallery.is_published ? (
                                    <BiCheckCircle aria-hidden="true" />
                                ) : (
                                    <BiLockAlt aria-hidden="true" />
                                )}
                            </div>
                            <div className="photographer-gallery-access-content">
                                <div className="photographer-gallery-access-title">
                                    <strong>Client access</strong>
                                    <span>{gallery.is_published ? "Published" : "Hidden"}</span>
                                </div>
                                <p>
                                    {gallery.is_published
                                        ? "The client can open this gallery from their LensFlow account."
                                        : "The gallery is hidden from the client until it is published."}
                                </p>
                                <button
                                    type="button"
                                    className="gallery-details-button secondary compact"
                                    onClick={() =>
                                        updateGallerySetting(
                                            "is_published",
                                            !gallery.is_published
                                        )
                                    }
                                    disabled={saving || deletingGallery}
                                >
                                    {gallery.is_published ? "Unpublish Gallery" : "Publish Gallery"}
                                </button>
                            </div>
                        </article>

                        <article
                            className={`photographer-gallery-access-card ${
                                gallery.allow_downloads ? "active" : ""
                            }`}
                        >
                            <div className="photographer-gallery-access-icon">
                                {gallery.allow_downloads ? (
                                    <BiCheckCircle aria-hidden="true" />
                                ) : (
                                    <BiLockAlt aria-hidden="true" />
                                )}
                            </div>
                            <div className="photographer-gallery-access-content">
                                <div className="photographer-gallery-access-title">
                                    <strong>Client downloads</strong>
                                    <span>{gallery.allow_downloads ? "Enabled" : "Disabled"}</span>
                                </div>
                                <p>
                                    {gallery.allow_downloads
                                        ? "The client can download media that is marked as downloadable."
                                        : "The client can view published media but cannot download it."}
                                </p>
                                <button
                                    type="button"
                                    className="gallery-details-button secondary compact"
                                    onClick={() =>
                                        updateGallerySetting(
                                            "allow_downloads",
                                            !gallery.allow_downloads
                                        )
                                    }
                                    disabled={saving || deletingGallery}
                                >
                                    {gallery.allow_downloads
                                        ? "Disable Downloads"
                                        : "Enable Downloads"}
                                </button>
                            </div>
                        </article>
                    </div>
                </section>

                <section className="gallery-details-media-section photographer-gallery-media-section">
                    <div className="gallery-details-section-heading">
                        <div>
                            <span className="gallery-details-section-eyebrow">Gallery</span>
                            <h2>Photos & videos</h2>
                        </div>

                        <div className="photographer-gallery-media-actions">
                            <div className="gallery-details-media-summary">
                                <span>{photoCount} photos</span>
                                <span>{videoCount} videos</span>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={[...ALLOWED_PHOTO_TYPES, ...ALLOWED_VIDEO_TYPES].join(",")}
                                multiple
                                onChange={handleMediaUpload}
                                disabled={uploading}
                                className="photographer-gallery-file-input"
                            />

                            <button
                                type="button"
                                className="gallery-details-button primary"
                                onClick={openFilePicker}
                                disabled={uploading || deletingGallery}
                            >
                                <BiUpload aria-hidden="true" />
                                {uploading ? "Uploading..." : "Upload Media"}
                            </button>
                        </div>
                    </div>

                    {uploading && (
                        <div className="gallery-upload-status">
                            <div className="gallery-upload-spinner" />
                            <div>
                                <strong>Uploading media</strong>
                                <span>{uploadProgress || "Preparing upload..."}</span>
                            </div>
                        </div>
                    )}

                    {media.length === 0 ? (
                        <div className="gallery-details-empty">
                            <div className="gallery-details-empty-icon">
                                <BiImages aria-hidden="true" />
                            </div>
                            <h3>No media uploaded yet</h3>
                            <p>
                                Upload photos or videos to make them available in this client gallery.
                            </p>
                            <button
                                type="button"
                                className="gallery-details-button primary"
                                onClick={openFilePicker}
                                disabled={uploading || deletingGallery}
                            >
                                <BiUpload aria-hidden="true" />
                                Upload Media
                            </button>
                        </div>
                    ) : (
                        <div className="gallery-details-grid">
                            {media.map((mediaItem) => {
                                const video = getMediaType(mediaItem) === "video";

                                return (
                                    <article
                                        key={mediaItem.media_id}
                                        className={`gallery-media-card ${video ? "video" : ""}`}
                                    >
                                        <button
                                            type="button"
                                            className="gallery-media-preview"
                                            onClick={() => setSelectedMedia(mediaItem)}
                                            aria-label={`View ${mediaItem.file_name || (video ? "video" : "photo")}`}
                                        >
                                            {mediaItem.signedUrl ? (
                                                video ? (
                                                    <video
                                                        src={mediaItem.signedUrl}
                                                        preload="metadata"
                                                        muted
                                                        playsInline
                                                    />
                                                ) : (
                                                    <img
                                                        src={mediaItem.signedUrl}
                                                        alt={mediaItem.file_name || "Gallery photo"}
                                                        loading="lazy"
                                                    />
                                                )
                                            ) : (
                                                <div className="gallery-media-no-preview">
                                                    {video ? (
                                                        <BiPlay aria-hidden="true" />
                                                    ) : (
                                                        <BiImage aria-hidden="true" />
                                                    )}
                                                    <span>Preview unavailable</span>
                                                </div>
                                            )}

                                            <div className="gallery-media-overlay">
                                                <span className="gallery-media-view-icon">
                                                    {video ? (
                                                        <BiPlay aria-hidden="true" />
                                                    ) : (
                                                        <BiLinkExternal aria-hidden="true" />
                                                    )}
                                                </span>
                                            </div>

                                            <span className="gallery-media-type">
                                                {video ? (
                                                    <BiPlay aria-hidden="true" />
                                                ) : (
                                                    <BiImage aria-hidden="true" />
                                                )}
                                                {video ? "Video" : "Photo"}
                                            </span>
                                        </button>

                                        <div className="gallery-media-card-footer">
                                            <div className="gallery-media-file">
                                                <strong title={mediaItem.file_name || "Gallery media"}>
                                                    {mediaItem.file_name || "Gallery media"}
                                                </strong>
                                                <span>
                                                    {formatFileSize(mediaItem.file_size)}
                                                    {mediaItem.uploaded_at
                                                        ? ` · ${formatDateTime(mediaItem.uploaded_at)}`
                                                        : ""}
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                className="gallery-media-delete"
                                                onClick={() => handleDeleteMedia(mediaItem)}
                                                disabled={
                                                    deletingMediaId === mediaItem.media_id ||
                                                    uploading ||
                                                    deletingGallery
                                                }
                                                aria-label={`Delete ${mediaItem.file_name || "media"}`}
                                                title="Delete media"
                                            >
                                                <BiTrash aria-hidden="true" />
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="photographer-gallery-linked-section">
                    <div className="gallery-details-section-heading">
                        <div>
                            <span className="gallery-details-section-eyebrow">Linked records</span>
                            <h2>Client & booking details</h2>
                        </div>
                    </div>

                    <div className="photographer-gallery-linked-grid">
                        <article className="photographer-gallery-linked-card">
                            <div className="photographer-gallery-linked-icon">
                                <BiUser aria-hidden="true" />
                            </div>
                            <div className="photographer-gallery-linked-content">
                                <span>Client</span>
                                <strong>{clientName}</strong>
                                {client?.profile?.email && <p>{client.profile.email}</p>}
                                {client?.profile?.phone && <p>{client.profile.phone}</p>}
                            </div>
                            {gallery.client_id && (
                                <button
                                    type="button"
                                    className="gallery-details-button secondary compact"
                                    onClick={() =>
                                        navigate(`/photographer/clients/${gallery.client_id}`)
                                    }
                                >
                                    View Client
                                </button>
                            )}
                        </article>

                        <article className="photographer-gallery-linked-card">
                            <div className="photographer-gallery-linked-icon">
                                <BiCalendar aria-hidden="true" />
                            </div>
                            <div className="photographer-gallery-linked-content">
                                <span>Booking</span>
                                <strong>
                                    {bookingDate ? formatDate(bookingDate) : "No booking linked"}
                                </strong>
                                {bookingTime && (
                                    <p>
                                        <BiTimeFive aria-hidden="true" />
                                        {formatTime(bookingTime)}
                                        {booking?.end_time ? ` – ${formatTime(booking.end_time)}` : ""}
                                    </p>
                                )}
                                {booking?.location && (
                                    <p>
                                        <BiMap aria-hidden="true" />
                                        {booking.location}
                                    </p>
                                )}
                            </div>
                            {gallery.booking_id && (
                                <button
                                    type="button"
                                    className="gallery-details-button secondary compact"
                                    onClick={() =>
                                        navigate(`/photographer/bookings/${gallery.booking_id}`)
                                    }
                                >
                                    View Booking
                                </button>
                            )}
                        </article>
                    </div>
                </section>
            </div>

            {selectedMedia && (
                <div
                    className="gallery-lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Gallery media viewer"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setSelectedMedia(null);
                        }
                    }}
                >
                    <div className="gallery-lightbox-toolbar">
                        <div className="gallery-lightbox-title">
                            <span>{selectedIndex + 1} / {media.length}</span>
                            <strong>
                                {selectedMedia.file_name ||
                                    (getMediaType(selectedMedia) === "video" ? "Video" : "Photo")}
                            </strong>
                        </div>

                        <div className="gallery-lightbox-actions">
                            <button
                                type="button"
                                className="gallery-lightbox-button danger"
                                onClick={async () => {
                                    await handleDeleteMedia(selectedMedia);
                                    setSelectedMedia(null);
                                }}
                                disabled={deletingMediaId === selectedMedia.media_id}
                                title="Delete media"
                                aria-label="Delete media"
                            >
                                <BiTrash aria-hidden="true" />
                            </button>

                            <button
                                type="button"
                                className="gallery-lightbox-button"
                                onClick={() => setSelectedMedia(null)}
                                title="Close"
                                aria-label="Close viewer"
                            >
                                <BiX aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {media.length > 1 && (
                        <>
                            <button
                                type="button"
                                className="gallery-lightbox-nav previous"
                                onClick={() => navigateMedia(-1)}
                                aria-label="Previous media"
                            >
                                <BiChevronLeft aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="gallery-lightbox-nav next"
                                onClick={() => navigateMedia(1)}
                                aria-label="Next media"
                            >
                                <BiChevronRight aria-hidden="true" />
                            </button>
                        </>
                    )}

                    <div className="gallery-lightbox-content">
                        {getMediaType(selectedMedia) === "video" ? (
                            selectedMedia.signedUrl ? (
                                <video
                                    className="gallery-lightbox-video"
                                    src={selectedMedia.signedUrl}
                                    controls
                                    autoPlay
                                    playsInline
                                />
                            ) : (
                                <div className="gallery-lightbox-unavailable">
                                    <BiPlay aria-hidden="true" />
                                    <p>Preview unavailable</p>
                                </div>
                            )
                        ) : selectedMedia.signedUrl ? (
                            <img
                                className="gallery-lightbox-image"
                                src={selectedMedia.signedUrl}
                                alt={selectedMedia.file_name || "Gallery photo"}
                            />
                        ) : (
                            <div className="gallery-lightbox-unavailable">
                                <BiImage aria-hidden="true" />
                                <p>Preview unavailable</p>
                            </div>
                        )}
                    </div>

                    <div className="gallery-lightbox-hint">
                        Use ← → to navigate · Press Esc to close
                    </div>
                </div>
            )}
        </div>
    );
}
