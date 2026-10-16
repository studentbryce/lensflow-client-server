import { BiPlay, BiImage, BiErrorCircle, BiArrowBack, BiDownload, BiCalendar, BiTimeFive, BiMap, BiImages, BiLockAlt, BiLinkExternal, BiPlusCircle, BiX, BiChevronLeft, BiChevronRight } from "react-icons/bi";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import JSZip from "jszip";
import { useAuth } from "../../context/authStore";
import { apiGetClientGallery, apiGetClientGalleryDownload, apiGetClientGallerySocialExport } from "../../services/clientGalleriesApi";
import "./GalleryDetails.css";

const formatDate = (value) => {
    if (!value) return "Not specified";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not specified";

    return date.toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
};

const formatTime = (value) => {
    if (!value) return "";

    const [hours, minutes] = value.split(":");

    if (hours === undefined || minutes === undefined) return value;

    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return date.toLocaleTimeString("en-NZ", {
        hour: "numeric",
        minute: "2-digit",
    });
};

const formatFileSize = (bytes) => {
    if (!bytes || Number(bytes) <= 0) return "";

    const size = Number(bytes);

    if (size < 1024 * 1024) {
        return `${Math.round(size / 1024)} KB`;
    }

    if (size < 1024 * 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const isVideoMedia = (media) => {
    return (
        media.media_type === "video" ||
        media.mime_type?.startsWith("video/")
    );
};

const socialFileName = (name) => {
    const base = sanitizeFileName(name || 'lensflow-photo').replace(/\.[^.]+$/, '');
    return `${base}-social.jpg`;
};

const getMediaLabel = (media) => {
    if (isVideoMedia(media)) return "Video";
    return "Photo";
};

const getMediaIcon = (media) => {
    if (isVideoMedia(media)) {
        return (
            <BiPlay aria-hidden="true" />
        );
    }

    return (
        <BiImage aria-hidden="true" />
    );
};

const sanitizeFileName = (value, fallback = "lensflow-gallery") => {
    const cleaned = String(value || fallback)
        .trim()
        // eslint-disable-next-line no-control-regex -- Deliberately remove ASCII control characters from downloaded filenames.
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/\.+$/g, "");

    return cleaned || fallback;
};

const getUniqueFileName = (fileName, usedNames) => {
    const safeName = sanitizeFileName(fileName, "lensflow-file");

    if (!usedNames.has(safeName)) {
        usedNames.add(safeName);
        return safeName;
    }

    const lastDot = safeName.lastIndexOf(".");

    const base =
        lastDot > 0
            ? safeName.slice(0, lastDot)
            : safeName;

    const extension =
        lastDot > 0
            ? safeName.slice(lastDot)
            : "";

    let counter = 2;
    let uniqueName = `${base} (${counter})${extension}`;

    while (usedNames.has(uniqueName)) {
        counter += 1;
        uniqueName = `${base} (${counter})${extension}`;
    }

    usedNames.add(uniqueName);

    return uniqueName;
};

function GalleryDetails() {
    const { gallery_id } = useParams();
    const { user, loading: authLoading } = useAuth();
    return (
        <GalleryDetailsContent
            key={`${gallery_id}:${user?.id || "anonymous"}`}
            gallery_id={gallery_id}
            user={user}
            authLoading={authLoading}
        />
    );
}

function GalleryDetailsContent({ gallery_id, user, authLoading }) {
    const navigate = useNavigate();

    const [gallery, setGallery] = useState(null);
    const [booking, setBooking] = useState(null);
    const [media, setMedia] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [selectedMedia, setSelectedMedia] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [downloadDialog, setDownloadDialog] = useState(null);
    const [downloadQuality, setDownloadQuality] = useState("social");

    const [downloadingAll, setDownloadingAll] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({
        current: 0,
        total: 0,
    });

    const [retryCount, setRetryCount] = useState(0);

    // Retry is a user action. The effect itself performs only async loading,
    // and its cancellation guard rejects responses from superseded requests.
    const loadGallery = () => {
        setLoading(true);
        setError("");
        setRetryCount((count) => count + 1);
    };

    useEffect(() => {
        if (authLoading || !user?.id || !gallery_id) return;
        let active = true;

        async function fetchGallery() {
            try {
                const result = await apiGetClientGallery(gallery_id);
                if (!active) return;
                setGallery(result.data.gallery);
                setBooking(result.data.booking || null);
                setMedia(result.data.media || []);
            } catch (loadError) {
                if (!active) return;
                console.error("Error loading client gallery:", loadError);
                setGallery(null);
                setBooking(null);
                setMedia([]);
                setError(
                    loadError?.message ||
                    "Unable to load this gallery. Please try again."
                );
            } finally {
                if (active) setLoading(false);
            }
        }

        void fetchGallery();
        return () => { active = false; };
    }, [authLoading, user?.id, gallery_id, retryCount]);

    /*
     * Prevent the page behind the lightbox from scrolling.
     */
    useEffect(() => {
        if (!selectedMedia) return;

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = "";
        };
    }, [selectedMedia]);

    const photos = useMemo(
        () =>
            media.filter(
                (item) => !isVideoMedia(item)
            ),
        [media]
    );

    const videos = useMemo(
        () =>
            media.filter((item) =>
                isVideoMedia(item)
            ),
        [media]
    );

    const downloadableMedia = useMemo(
        () =>
            media.filter(
                (item) => item.is_downloadable === true
            ),
        [media]
    );

    const downloadableCount = downloadableMedia.length;

    const selectedIndex = useMemo(() => {
        if (!selectedMedia) return -1;

        return media.findIndex(
            (item) =>
                item.media_id === selectedMedia.media_id
        );
    }, [media, selectedMedia]);

    const navigateMedia = (direction) => {
        if (
            selectedIndex === -1 ||
            media.length === 0
        ) {
            return;
        }

        const nextIndex =
            (selectedIndex +
                direction +
                media.length) %
            media.length;

        const nextMedia = media[nextIndex];

        if (nextMedia) {
            setSelectedMedia(nextMedia);
        }
    };

    /*
     * Escape closes the lightbox.
     */
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                if (downloadDialog) {
                    setDownloadDialog(null);
                } else {
                    setSelectedMedia(null);
                }
            }

            if (
                event.key === "ArrowRight" &&
                selectedMedia && !downloadDialog
            ) {
                navigateMedia(1);
            }

            if (
                event.key === "ArrowLeft" &&
                selectedMedia && !downloadDialog
            ) {
                navigateMedia(-1);
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown
            );
        };
    });


    const openMedia = (mediaItem) => {
        setSelectedMedia(mediaItem);
    };

    /*
     * Download one individual media file.
     */
    const openDownloadChoice = (mediaItem = null) => {
        if (!gallery?.allow_downloads) return;
        if (mediaItem && mediaItem.is_downloadable !== true) return;
        if (mediaItem && isVideoMedia(mediaItem)) {
            void handleDownload(mediaItem, "original");
            return;
        }
        if (!mediaItem && photos.length === 0) {
            void handleDownloadAll("original");
            return;
        }
        setDownloadQuality("social");
        setDownloadDialog(mediaItem ? { type: "single", mediaItem } : { type: "all" });
    };

    const handleDownload = async (mediaItem, quality = "original") => {
        if (!gallery?.allow_downloads) return;
        if (mediaItem.is_downloadable !== true) return;

        setDownloadingId(mediaItem.media_id);

        try {
            let blob;
            if (quality === "social" && !isVideoMedia(mediaItem)) {
                blob = await apiGetClientGallerySocialExport(gallery_id, mediaItem.media_id);
            } else {
                // Existing Express-authorized original download is unchanged.
                const result = await apiGetClientGalleryDownload(gallery_id, mediaItem.media_id);
                const downloadUrl = result.data?.url;
                if (!downloadUrl) throw new Error("Unable to create a download link.");
                const response = await fetch(downloadUrl);
                if (!response.ok) throw new Error("Unable to download this file.");
                blob = await response.blob();
            }
            const blobUrl =
                URL.createObjectURL(blob);

            const link =
                document.createElement("a");

            link.href = blobUrl;
            link.download =
                quality === "social" && !isVideoMedia(mediaItem)
                    ? socialFileName(mediaItem.file_name)
                    : (mediaItem.file_name || "lensflow-gallery-file");

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(blobUrl);
        } catch (downloadError) {
            console.error(
                "Download error:",
                downloadError
            );

            window.alert(
                downloadError?.message || "Unable to download this file right now. Please try again."
            );
        } finally {
            setDownloadingId(null);
        }
    };

    /*
     * Download all downloadable gallery media as a ZIP file.
     */
    const handleDownloadAll = async (quality = "original") => {
        if (!gallery?.allow_downloads) return;
        if (downloadableMedia.length === 0) return;
        if (downloadingAll) return;

        setDownloadingAll(true);
        setDownloadProgress({
            current: 0,
            total: downloadableMedia.length,
        });

        try {
            const zip = new JSZip();
            const usedFileNames = new Set();
            let successfulDownloads = 0;

            for (
                let index = 0;
                index < downloadableMedia.length;
                index += 1
            ) {
                const mediaItem =
                    downloadableMedia[index];

                setDownloadProgress({
                    current: index + 1,
                    total: downloadableMedia.length,
                });

                try {
                    const optimize = quality === "social" && !isVideoMedia(mediaItem);
                    let blob;
                    if (optimize) {
                        blob = await apiGetClientGallerySocialExport(gallery_id, mediaItem.media_id);
                    } else {
                        const result = await apiGetClientGalleryDownload(gallery_id, mediaItem.media_id);
                        const downloadUrl = result.data?.url;
                        if (!downloadUrl) throw new Error("Unable to create a download link.");
                        const response = await fetch(downloadUrl);
                        if (!response.ok) throw new Error("Unable to download the file.");
                        blob = await response.blob();
                    }

                    const fileName =
                        getUniqueFileName(
                            optimize ? socialFileName(mediaItem.file_name) : (
                                mediaItem.file_name || `${getMediaLabel(mediaItem).toLowerCase()}-${index + 1}`),
                            usedFileNames
                        );

                    zip.file(fileName, blob);

                    successfulDownloads += 1;
                } catch (fileError) {
                    /*
                     * Continue processing the remaining files if
                     * one individual file fails.
                     */
                    console.error(
                        `Failed to add "${mediaItem.file_name}" (${formatFileSize(
                            mediaItem.file_size
                        )}) to ZIP:`,
                        fileError
                    );
                }
            }

            if (successfulDownloads === 0) {
                throw new Error(
                    "None of the gallery files could be downloaded."
                );
            }

            /*
             * Generate the ZIP after all files have been fetched.
             */
            setDownloadProgress({
                current: downloadableMedia.length,
                total: downloadableMedia.length,
            });

            const zipBlob =
                await zip.generateAsync({
                    type: "blob",
                    compression: "DEFLATE",
                    compressionOptions: {
                        level: 6,
                    },
                });

            const zipUrl =
                URL.createObjectURL(zipBlob);

            const link =
                document.createElement("a");

            link.href = zipUrl;
            link.download = `${sanitizeFileName(
                gallery.name,
                "lensflow-gallery"
            )}${quality === "social" ? "-social" : ""}.zip`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(zipUrl);

            /*
             * If some files failed, let the user know that the ZIP
             * contains the files that were successfully downloaded.
             */
            if (
                successfulDownloads <
                downloadableMedia.length
            ) {
                window.alert(
                    `${successfulDownloads} of ${downloadableMedia.length} files were added to the ZIP. Some files could not be downloaded.`
                );
            }
        } catch (downloadAllError) {
            console.error(
                "Download all error:",
                downloadAllError
            );

            window.alert(
                downloadAllError?.message ||
                "Unable to download the gallery right now. Please try again."
            );
        } finally {
            setDownloadingAll(false);

            setDownloadProgress({
                current: 0,
                total: 0,
            });
        }
    };

    const confirmDownloadChoice = () => {
        if (!downloadDialog) return;
        const choice = downloadQuality;
        const action = downloadDialog;
        setDownloadDialog(null);
        if (action.type === "all") {
            void handleDownloadAll(choice);
        } else {
            void handleDownload(action.mediaItem, choice);
        }
    };

    const handleBack = () => {
        navigate("/client/galleries");
    };

    if (authLoading || loading) {
        return (
            <div className="gallery-details-page client-gallery-details-page">
                <div className="gallery-details-loading">
                    <div className="gallery-details-spinner" />
                    <p>Loading your gallery...</p>
                </div>
            </div>
        );
    }

    if (error || !gallery) {
        return (
            <div className="gallery-details-page client-gallery-details-page">
                <div className="gallery-details-error">
                    <div className="gallery-details-error-icon">
                        <BiErrorCircle aria-hidden="true" />
                    </div>

                    <h2>Gallery unavailable</h2>

                    <p>
                        {error ||
                            "This gallery could not be found."}
                    </p>

                    <div className="gallery-details-error-actions">
                        <button
                            type="button"
                            className="gallery-details-secondary-button"
                            onClick={handleBack}
                        >
                            Back to Galleries
                        </button>

                        <button
                            type="button"
                            className="gallery-details-primary-button"
                            onClick={loadGallery}
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="gallery-details-page client-gallery-details-page">
            <div className="gallery-details-container">
                {/* Back navigation */}
                <button
                    type="button"
                    className="gallery-details-back"
                    onClick={handleBack}
                >
                    <BiArrowBack aria-hidden="true" />

                    Back to Galleries
                </button>

                {/* Header */}
                <header className="gallery-details-header">
                    <div className="gallery-details-header-main">
                        <div className="gallery-details-eyebrow">
                            Your photography gallery
                        </div>

                        <h1>{gallery.name}</h1>

                        {gallery.description && (
                            <p className="gallery-details-description">
                                {gallery.description}
                            </p>
                        )}
                    </div>

                    <div className="gallery-details-header-actions">
                        {gallery.allow_downloads &&
                            downloadableCount > 0 && (
                                <button
                                    type="button"
                                    className="gallery-details-download-all"
                                    onClick={() => openDownloadChoice()}
                                    disabled={downloadingAll}
                                >
                                    {downloadingAll ? (
                                        <>
                                            <span className="gallery-details-button-spinner" />

                                            <span>
                                                Preparing{" "}
                                                {
                                                    downloadProgress.current
                                                }{" "}
                                                /{" "}
                                                {
                                                    downloadProgress.total
                                                }
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <BiDownload aria-hidden="true" />

                                            Download All
                                        </>
                                    )}
                                </button>
                            )}

                        <div className="gallery-details-ready">
                            <span className="gallery-details-ready-dot" />
                            Ready to view
                        </div>
                    </div>
                </header>

                {/* Gallery information */}
                <section className="gallery-details-info">
                    <div className="gallery-info-card">
                        <div className="gallery-info-icon">
                            <BiCalendar aria-hidden="true" />
                        </div>

                        <div>
                            <span>Session date</span>

                            <strong>
                                {formatDate(
                                    booking?.booking_date
                                )}
                            </strong>
                        </div>
                    </div>

                    {booking?.start_time && (
                        <div className="gallery-info-card">
                            <div className="gallery-info-icon">
                                <BiTimeFive aria-hidden="true" />
                            </div>

                            <div>
                                <span>Session time</span>

                                <strong>
                                    {formatTime(
                                        booking.start_time
                                    )}

                                    {booking.end_time
                                        ? ` – ${formatTime(
                                            booking.end_time
                                        )}`
                                        : ""}
                                </strong>
                            </div>
                        </div>
                    )}

                    {booking?.location && (
                        <div className="gallery-info-card">
                            <div className="gallery-info-icon">
                                <BiMap aria-hidden="true" />
                            </div>

                            <div>
                                <span>Location</span>
                                <strong>{booking.location}</strong>
                            </div>
                        </div>
                    )}

                    <div className="gallery-info-card">
                        <div className="gallery-info-icon">
                            <BiImages aria-hidden="true" />
                        </div>

                        <div>
                            <span>Gallery content</span>

                            <strong>
                                {media.length}{" "}
                                {media.length === 1
                                    ? "item"
                                    : "items"}
                            </strong>
                        </div>
                    </div>
                </section>

                {/* Download notice */}
                <section
                    className={`gallery-details-download-banner ${gallery.allow_downloads
                            ? "available"
                            : "disabled"
                        }`}
                >
                    <div className="gallery-download-banner-icon">
                        {gallery.allow_downloads ? (
                            <BiDownload aria-hidden="true" />
                        ) : (
                            <BiLockAlt aria-hidden="true" />
                        )}
                    </div>

                    <div className="gallery-download-banner-content">
                        <strong>
                            {gallery.allow_downloads
                                ? "Downloads available"
                                : "Downloads disabled"}
                        </strong>

                        <p>
                            {gallery.allow_downloads
                                ? `${downloadableCount} ${downloadableCount === 1
                                    ? "item is"
                                    : "items are"
                                } available to download from this gallery.`
                                : "Your photographer has disabled downloads for this gallery. You can still view all available media."}
                        </p>
                    </div>
                </section>

                {/* Media section */}
                <section className="gallery-details-media-section">
                    <div className="gallery-details-section-heading">
                        <div>
                            <span className="gallery-details-section-eyebrow">
                                Gallery
                            </span>

                            <h2>Your photos & videos</h2>
                        </div>

                        <div className="gallery-details-media-summary">
                            <span>
                                {photos.length} photos
                            </span>

                            <span>
                                {videos.length} videos
                            </span>
                        </div>
                    </div>

                    {media.length === 0 ? (
                        <div className="gallery-details-empty">
                            <div className="gallery-details-empty-icon">
                                <BiImage aria-hidden="true" />
                            </div>

                            <h3>No media yet</h3>

                            <p>
                                Your photographer has not added any
                                media to this gallery yet.
                            </p>
                        </div>
                    ) : (
                        <div className="gallery-details-grid">
                            {media.map((mediaItem) => {
                                const video =
                                    isVideoMedia(mediaItem);

                                return (
                                    <article
                                        key={mediaItem.media_id}
                                        className={`gallery-media-card ${video ? "video" : ""
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            className="gallery-media-preview"
                                            onClick={() =>
                                                openMedia(mediaItem)
                                            }
                                            aria-label={`View ${mediaItem.file_name ||
                                                getMediaLabel(
                                                    mediaItem
                                                )
                                                }`}
                                        >
                                            {mediaItem.previewUrl ? (
                                                video ? (
                                                    <video
                                                        src={
                                                            mediaItem.previewUrl
                                                        }
                                                        preload="metadata"
                                                        muted
                                                        playsInline
                                                    />
                                                ) : (
                                                    <img
                                                        src={
                                                            mediaItem.previewUrl
                                                        }
                                                        alt={
                                                            mediaItem.file_name ||
                                                            "Gallery photo"
                                                        }
                                                        loading="lazy"
                                                    />
                                                )
                                            ) : (
                                                <div className="gallery-media-no-preview">
                                                    {getMediaIcon(
                                                        mediaItem
                                                    )}

                                                    <span>
                                                        Preview unavailable
                                                    </span>
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
                                                {getMediaIcon(
                                                    mediaItem
                                                )}

                                                {getMediaLabel(
                                                    mediaItem
                                                )}
                                            </span>

                                        </button>

                                        <div className="gallery-media-card-footer">
                                            <div className="gallery-media-file">
                                                <strong
                                                    title={
                                                        mediaItem.file_name ||
                                                        getMediaLabel(
                                                            mediaItem
                                                        )
                                                    }
                                                >
                                                    {mediaItem.file_name ||
                                                        getMediaLabel(
                                                            mediaItem
                                                        )}
                                                </strong>

                                                {mediaItem.file_size && (
                                                    <span>
                                                        {formatFileSize(
                                                            mediaItem.file_size
                                                        )}
                                                    </span>
                                                )}
                                            </div>

                                            {gallery.allow_downloads &&
                                                mediaItem.is_downloadable ===
                                                true && (
                                                    <button
                                                        type="button"
                                                        className="gallery-media-download"
                                                        onClick={() =>
                                                            openDownloadChoice(
                                                                mediaItem
                                                            )
                                                        }
                                                        disabled={
                                                            downloadingId ===
                                                            mediaItem.media_id ||
                                                            downloadingAll
                                                        }
                                                        aria-label={`Download ${mediaItem.file_name ||
                                                            getMediaLabel(
                                                                mediaItem
                                                            )
                                                            }`}
                                                        title="Download"
                                                    >
                                                        {downloadingId ===
                                                            mediaItem.media_id ? (
                                                            <span className="gallery-download-spinner" />
                                                        ) : (
                                                            <BiDownload aria-hidden="true" />
                                                        )}
                                                    </button>
                                                )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Footer information */}
                <footer className="gallery-details-footer">
                    <div className="gallery-details-footer-icon">
                        <BiPlusCircle aria-hidden="true" />
                    </div>

                    <div>
                        <strong>
                            Your gallery is securely hosted by LensFlow
                        </strong>

                        <p>
                            Your photographer controls the availability
                            and download permissions for this gallery.
                        </p>
                    </div>
                </footer>
            </div>

            {/* Image export quality choice; videos remain original quality. */}
            {downloadDialog && (
                <div className="gallery-export-backdrop" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setDownloadDialog(null);
                }}>
                    <div className="gallery-export-dialog" role="dialog" aria-modal="true"
                        aria-labelledby="gallery-export-heading">
                        <h2 id="gallery-export-heading">{downloadDialog.type === "all" ? "Download gallery" : "Download photo"}</h2>
                        <p>Choose the quality that works best for you.</p>
                        <label className="gallery-export-option">
                            <input type="radio" name="gallery-export-quality" value="social"
                                checked={downloadQuality === "social"}
                                onChange={() => setDownloadQuality("social")} autoFocus />
                            <span><strong>Social media optimized</strong>
                                <small>Smaller JPG for sharing, messaging and saving to your phone.</small></span>
                        </label>
                        <label className="gallery-export-option">
                            <input type="radio" name="gallery-export-quality" value="original"
                                checked={downloadQuality === "original"}
                                onChange={() => setDownloadQuality("original")} />
                            <span><strong>Original quality</strong>
                                <small>Full-resolution file for printing or editing.</small></span>
                        </label>
                        {downloadDialog.type === "all" && videos.length > 0 && (
                            <p className="gallery-export-note">Videos are always downloaded in their original quality.</p>
                        )}
                        <div className="gallery-export-actions">
                            <button type="button" className="gallery-export-cancel"
                                onClick={() => setDownloadDialog(null)}>Cancel</button>
                            <button type="button" className="gallery-export-confirm"
                                onClick={confirmDownloadChoice}><BiDownload aria-hidden="true" /> Download</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox */}
            {selectedMedia && (
                <div
                    className="gallery-lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Gallery media viewer"
                    onMouseDown={(event) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            setSelectedMedia(null);
                        }
                    }}
                >
                    <div className="gallery-lightbox-toolbar">
                        <div className="gallery-lightbox-title">
                            <span>
                                {selectedIndex + 1} /{" "}
                                {media.length}
                            </span>

                            <strong>
                                {selectedMedia.file_name ||
                                    getMediaLabel(
                                        selectedMedia
                                    )}
                            </strong>
                        </div>

                        <div className="gallery-lightbox-actions">
                            {gallery.allow_downloads &&
                                selectedMedia.is_downloadable ===
                                true && (
                                    <button
                                        type="button"
                                        className="gallery-lightbox-button"
                                        onClick={() =>
                                            openDownloadChoice(
                                                selectedMedia
                                            )
                                        }
                                        disabled={
                                            downloadingId ===
                                            selectedMedia.media_id ||
                                            downloadingAll
                                        }
                                        title="Download"
                                        aria-label="Download media"
                                    >
                                        {downloadingId ===
                                            selectedMedia.media_id ? (
                                            <span className="gallery-download-spinner" />
                                        ) : (
                                            <BiDownload aria-hidden="true" />
                                        )}
                                    </button>
                                )}

                            <button
                                type="button"
                                className="gallery-lightbox-button"
                                onClick={() =>
                                    setSelectedMedia(null)
                                }
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
                                onClick={() =>
                                    navigateMedia(-1)
                                }
                                aria-label="Previous media"
                            >
                                <BiChevronLeft aria-hidden="true" />
                            </button>

                            <button
                                type="button"
                                className="gallery-lightbox-nav next"
                                onClick={() =>
                                    navigateMedia(1)
                                }
                                aria-label="Next media"
                            >
                                <BiChevronRight aria-hidden="true" />
                            </button>
                        </>
                    )}

                    <div className="gallery-lightbox-content">
                        {isVideoMedia(
                            selectedMedia
                        ) ? (
                            <video
                                className="gallery-lightbox-video"
                                src={
                                    selectedMedia.previewUrl
                                }
                                controls
                                autoPlay
                                playsInline
                            />
                        ) : selectedMedia.previewUrl ? (
                            <img
                                className="gallery-lightbox-image"
                                src={
                                    selectedMedia.previewUrl
                                }
                                alt={
                                    selectedMedia.file_name ||
                                    "Gallery photo"
                                }
                            />
                        ) : (
                            <div className="gallery-lightbox-unavailable">
                                <div>
                                    {getMediaIcon(
                                        selectedMedia
                                    )}
                                </div>

                                <p>
                                    Preview unavailable
                                </p>
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

export default GalleryDetails;
