import { BiImage, BiCheck, BiInfoCircle, BiImages, BiSearch, BiCalendar, BiDownload } from "react-icons/bi";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetClientGalleries } from "../../services/clientGalleriesApi";
import { useAuth } from "../../context/AuthContext";
import "./Galleries.css";

function formatDate(date) {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function formatMediaCount(count) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function getGalleryAccessLabel(gallery) {
  return gallery.allow_downloads ? "Downloads enabled" : "View only";
}

function getGalleryAccessClass(gallery) {
  return gallery.allow_downloads ? "enabled" : "disabled";
}

export default function Galleries() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [galleries, setGalleries] = useState([]);
  const [media, setMedia] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [accessFilter, setAccessFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadGalleries() {
      if (!user?.id) {
        if (isMounted) {
          setLoading(false);
        }

        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        // Verified JWT and RLS ownership checks run inside Express.
        // Private thumbnail URLs are signed on the server.
        const result = await apiGetClientGalleries();
        if (!isMounted) return;
        setGalleries(result.data?.galleries || []);
        setMedia(result.data?.media || []);
      } catch (error) {
        console.error("Error loading client galleries:", error);

        if (isMounted) {
          setErrorMessage(
            error?.message ||
              "Unable to load your galleries. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadGalleries();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // -------------------------------------------------------------
  // Media counts
  // -------------------------------------------------------------

  const mediaCountMap = useMemo(() => {
    const map = new Map();

    media.forEach((item) => {
      const currentCount = map.get(item.gallery_id) || 0;
      map.set(item.gallery_id, currentCount + 1);
    });

    return map;
  }, [media]);

  const photoCountMap = useMemo(() => {
    const map = new Map();

    media.forEach((item) => {
      if (item.media_type === "image") {
        const currentCount = map.get(item.gallery_id) || 0;
        map.set(item.gallery_id, currentCount + 1);
      }
    });

    return map;
  }, [media]);

  const videoCountMap = useMemo(() => {
    const map = new Map();

    media.forEach((item) => {
      if (item.media_type === "video") {
        const currentCount = map.get(item.gallery_id) || 0;
        map.set(item.gallery_id, currentCount + 1);
      }
    });

    return map;
  }, [media]);

  // -------------------------------------------------------------
  // Enrich galleries
  // -------------------------------------------------------------

  const enrichedGalleries = useMemo(() => {
    return galleries.map((gallery) => ({
      ...gallery,
      mediaCount:
        mediaCountMap.get(gallery.gallery_id) || 0,
      photoCount:
        photoCountMap.get(gallery.gallery_id) || 0,
      videoCount:
        videoCountMap.get(gallery.gallery_id) || 0,
    }));
  }, [
    galleries,
    mediaCountMap,
    photoCountMap,
    videoCountMap,
  ]);

  // -------------------------------------------------------------
  // Filter galleries
  // -------------------------------------------------------------

  const filteredGalleries = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return enrichedGalleries.filter((gallery) => {
      const matchesAccess =
        accessFilter === "all" ||
        (accessFilter === "downloads" &&
          gallery.allow_downloads) ||
        (accessFilter === "view-only" &&
          !gallery.allow_downloads);

      if (!matchesAccess) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchableText = [
        gallery.name,
        gallery.description,
        gallery.booking?.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(search);
    });
  }, [
    enrichedGalleries,
    searchTerm,
    accessFilter,
  ]);

  // -------------------------------------------------------------
  // Summary statistics
  // -------------------------------------------------------------

  const totalGalleries = galleries.length;

  const galleriesWithDownloads = galleries.filter(
    (gallery) => gallery.allow_downloads
  ).length;

  const viewOnlyGalleries = galleries.filter(
    (gallery) => !gallery.allow_downloads
  ).length;

  const totalMedia = media.length;

  // -------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------

  const handleViewGallery = (galleryId) => {
    navigate(`/client/galleries/${galleryId}`);
  };

  // -------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------

  if (loading) {
    return (
      <div className="galleries-page client-galleries-page">
        <div className="galleries-loading">
          <div className="galleries-spinner"></div>
          <p>Loading your galleries...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------

  if (errorMessage) {
    return (
      <div className="galleries-page client-galleries-page">
        <header className="galleries-header">
          <div>
            <p className="galleries-eyebrow">
              Your photography
            </p>

            <h1>Galleries</h1>

            <p className="galleries-description">
              View and access your delivered photography.
            </p>
          </div>
        </header>

        <div className="galleries-message error-message">
          <strong>Unable to load your galleries</strong>

          <span>{errorMessage}</span>

          <button
            type="button"
            className="galleries-retry-button"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="galleries-page client-galleries-page">
      {/* ========================================================
          HEADER
      ======================================================== */}

      <header className="galleries-header">
        <div>
          <p className="galleries-eyebrow">
            Your photography
          </p>

          <h1>Galleries</h1>

          <p className="galleries-description">
            View your delivered photography, explore your galleries
            and download your favourite images and videos.
          </p>
        </div>
      </header>

      {/* ========================================================
          SUMMARY CARDS
      ======================================================== */}

      <section className="galleries-summary">
        <div className="gallery-summary-card">
          <div className="gallery-summary-icon">
            <BiImage aria-hidden="true" />
          </div>

          <div>
            <span>Your Galleries</span>
            <strong>{totalGalleries}</strong>
          </div>
        </div>

        <div className="gallery-summary-card">
          <div className="gallery-summary-icon published">
            <BiCheck aria-hidden="true" />
          </div>

          <div>
            <span>Downloads</span>
            <strong>{galleriesWithDownloads}</strong>
          </div>
        </div>

        <div className="gallery-summary-card">
          <div className="gallery-summary-icon unpublished">
            <BiInfoCircle aria-hidden="true" />
          </div>

          <div>
            <span>View Only</span>
            <strong>{viewOnlyGalleries}</strong>
          </div>
        </div>

        <div className="gallery-summary-card">
          <div className="gallery-summary-icon media">
            <BiImages aria-hidden="true" />
          </div>

          <div>
            <span>Total Media</span>
            <strong>{totalMedia}</strong>
          </div>
        </div>
      </section>

      {/* ========================================================
          TOOLBAR
      ======================================================== */}

      <section className="galleries-toolbar">
        <div className="galleries-search">
          <BiSearch aria-hidden="true" />

          <input
            type="text"
            placeholder="Search your galleries..."
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
          />

          {searchTerm && (
            <button
              type="button"
              className="galleries-clear-search"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="galleries-filter-tabs">
          <button
            type="button"
            className={
              accessFilter === "all"
                ? "gallery-filter active"
                : "gallery-filter"
            }
            onClick={() => setAccessFilter("all")}
          >
            All
            <span>{totalGalleries}</span>
          </button>

          <button
            type="button"
            className={
              accessFilter === "downloads"
                ? "gallery-filter active"
                : "gallery-filter"
            }
            onClick={() =>
              setAccessFilter("downloads")
            }
          >
            Downloads
            <span>{galleriesWithDownloads}</span>
          </button>

          <button
            type="button"
            className={
              accessFilter === "view-only"
                ? "gallery-filter active"
                : "gallery-filter"
            }
            onClick={() =>
              setAccessFilter("view-only")
            }
          >
            View Only
            <span>{viewOnlyGalleries}</span>
          </button>
        </div>
      </section>

      {/* ========================================================
          RESULTS
      ======================================================== */}

      <section className="galleries-content">
        {filteredGalleries.length === 0 ? (
          <div className="galleries-empty">
            <div className="galleries-empty-icon">
              <BiImage aria-hidden="true" />
            </div>

            <h2>
              {searchTerm ||
              accessFilter !== "all"
                ? "No galleries found"
                : "No galleries yet"}
            </h2>

            <p>
              {searchTerm ||
              accessFilter !== "all"
                ? "Try changing your search or filter."
                : "Your photographer has not published any galleries for you yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="galleries-results-heading">
              <div>
                <h2>Your Galleries</h2>

                <span>
                  Showing {filteredGalleries.length}{" "}
                  {filteredGalleries.length === 1
                    ? "gallery"
                    : "galleries"}
                </span>
              </div>
            </div>

            <div className="galleries-grid">
              {filteredGalleries.map((gallery) => {
                const bookingDate =
                  gallery.booking?.booking_date;

                return (
                  <article
                    className="gallery-card"
                    key={gallery.gallery_id}
                  >
                    {/* ------------------------------------------------
                        CARD PREVIEW
                    ------------------------------------------------ */}

                    <div
                      className={`gallery-card-preview ${
                        gallery.thumbnail
                          ? "has-thumbnail"
                          : ""
                      }`}
                    >
                      {gallery.thumbnail?.url ? (
                        <img
                          src={gallery.thumbnail.url}
                          alt={`${gallery.name} gallery`}
                          className="gallery-card-thumbnail"
                          loading="lazy"
                        />
                      ) : (
                        <div className="gallery-preview-placeholder">
                          <BiImage aria-hidden="true" />

                          <span>
                            {gallery.mediaCount > 0
                              ? `${gallery.mediaCount} media`
                              : "No media yet"}
                          </span>
                        </div>
                      )}

                      {/* Media count */}

                      {gallery.mediaCount > 0 && (
                        <span className="gallery-thumbnail-count">
                          {gallery.mediaCount}{" "}
                          {gallery.mediaCount === 1
                            ? "item"
                            : "items"}
                        </span>
                      )}

                      {/* Access status */}

                      <span
                        className={`gallery-status ${getGalleryAccessClass(
                          gallery
                        )}`}
                      >
                        <span className="gallery-status-dot"></span>

                        {getGalleryAccessLabel(
                          gallery
                        )}
                      </span>
                    </div>

                    {/* ------------------------------------------------
                        CARD CONTENT
                    ------------------------------------------------ */}

                    <div className="gallery-card-content">
                      <div className="gallery-card-heading">
                        <div>
                          <h3>{gallery.name}</h3>

                          {gallery.description && (
                            <p>
                              {gallery.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Booking */}

                      <div className="gallery-client">
                        <div className="gallery-client-avatar">
                          <BiCalendar aria-hidden="true" />
                        </div>

                        <div>
                          <span>Photography Session</span>

                          <strong>
                            {bookingDate
                              ? formatDate(
                                  bookingDate
                                )
                              : "Date unavailable"}
                          </strong>
                        </div>
                      </div>

                      {/* Gallery metadata */}

                      <div className="gallery-meta">
                        <div className="gallery-meta-item">
                          <BiImages aria-hidden="true" />

                          <div>
                            <span>Media</span>

                            <strong>
                              {formatMediaCount(
                                gallery.mediaCount
                              )}
                            </strong>
                          </div>
                        </div>

                        <div className="gallery-meta-item">
                          <BiDownload aria-hidden="true" />

                          <div>
                            <span>Access</span>

                            <strong>
                              {gallery.allow_downloads
                                ? "Downloads"
                                : "View only"}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Media breakdown */}

                      <div className="gallery-media-breakdown">
                        <span>
                          <strong>
                            {gallery.photoCount}
                          </strong>{" "}
                          {gallery.photoCount === 1
                            ? "photo"
                            : "photos"}
                        </span>

                        <span className="gallery-breakdown-divider">
                          •
                        </span>

                        <span>
                          <strong>
                            {gallery.videoCount}
                          </strong>{" "}
                          {gallery.videoCount === 1
                            ? "video"
                            : "videos"}
                        </span>
                      </div>

                      {/* Download status */}

                      <div
                        className={`gallery-download-status ${
                          gallery.allow_downloads
                            ? "enabled"
                            : "disabled"
                        }`}
                      >
                        <BiDownload aria-hidden="true" />

                        <span>
                          Downloads{" "}
                          <strong>
                            {gallery.allow_downloads
                              ? "available"
                              : "not available"}
                          </strong>
                        </span>
                      </div>

                      {/* Action */}

                      <div className="gallery-card-actions client-actions">
                        <button
                          type="button"
                          className="gallery-view-button"
                          onClick={() =>
                            handleViewGallery(
                              gallery.gallery_id
                            )
                          }
                        >
                          View Gallery
                        </button>
                      </div>
                    </div>

                    {/* Footer */}

                    <div className="gallery-card-footer">
                      Updated{" "}
                      {formatDate(gallery.updated_at)}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
