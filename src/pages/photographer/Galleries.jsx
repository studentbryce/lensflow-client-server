import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BiCalendar,
  BiCheckCircle,
  BiChevronRight,
  BiDownload,
  BiEdit,
  BiImage,
  BiImages,
  BiLockAlt,
  BiPlus,
  BiSearch,
  BiX,
} from "react-icons/bi";
import { supabase } from "../../lib/supabaseClient";
import { apiListPhotographerGalleries } from "../../services/photographerGalleriesApi";
import { useAuth } from "../../context/authStore";
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

function getClientName(profile) {
  if (!profile) return "Unknown client";

  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || profile.email || "Unknown client";
}

function formatMediaCount(count) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function getInitials(name) {
  if (!name || name === "Unknown client") return "?";

  const parts = name.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(
    0
  )}`.toUpperCase();
}

function getGalleryStatus(isPublished) {
  return isPublished ? "Published" : "Unpublished";
}

export default function Galleries() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [galleries, setGalleries] = useState([]);
  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [media, setMedia] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

        // Photographer-owned gallery data now comes from Express (JWT + RLS).
        const payload = await apiListPhotographerGalleries();
        const loadedGalleries = payload.galleries || [];
        const loadedClients = payload.clients || [];
        const loadedProfiles = payload.profiles || [];
        const loadedBookings = payload.bookings || [];
        const loadedMedia = payload.media || [];

        // -------------------------------------------------------
        // 7. Generate signed thumbnail URLs
        //
        // client-media is PRIVATE, so we cannot use getPublicUrl().
        //
        // We use the first image uploaded to each gallery.
        // Videos are intentionally ignored for the gallery thumbnail.
        // -------------------------------------------------------

        const thumbnailMap = new Map();

        const galleryImageMedia = loadedMedia.filter(
          (item) => item.media_type === "image" && (item.storage_path || item.thumbnail_path)
        );

        await Promise.all(
          galleryImageMedia.map(async (mediaItem) => {
            // Only use the first image for each gallery.
            if (thumbnailMap.has(mediaItem.gallery_id)) {
              return;
            }

            const { data: signedUrlData, error: signedUrlError } =
              await supabase.storage
                .from("client-media")
                .createSignedUrl(mediaItem.storage_path || mediaItem.thumbnail_path, 60 * 60);

            if (signedUrlError) {
              console.warn(
                `Unable to create thumbnail URL for gallery ${mediaItem.gallery_id}:`,
                signedUrlError
              );

              return;
            }

            if (signedUrlData?.signedUrl) {
              thumbnailMap.set(mediaItem.gallery_id, {
                url: signedUrlData.signedUrl,
                mediaId: mediaItem.media_id,
                fileName: mediaItem.file_name,
              });
            }
          })
        );

        if (!isMounted) return;

        setGalleries(loadedGalleries);
        setClients(loadedClients);
        setProfiles(loadedProfiles);
        setBookings(loadedBookings);
        setMedia(loadedMedia);

        // Store thumbnail information directly on the gallery records.
        setGalleries(
          loadedGalleries.map((gallery) => ({
            ...gallery,
            thumbnail: thumbnailMap.get(gallery.gallery_id) || null,
          }))
        );
      } catch (error) {
        console.error("Error loading galleries:", error);

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
  // Create lookup maps
  // -------------------------------------------------------------

  const clientMap = useMemo(() => {
    const map = new Map();

    clients.forEach((client) => {
      const profile = profiles.find(
        (item) => item.user_id === client.user_id
      );

      map.set(client.client_id, {
        ...client,
        profile,
      });
    });

    return map;
  }, [clients, profiles]);

  const bookingMap = useMemo(() => {
    const map = new Map();

    bookings.forEach((booking) => {
      map.set(booking.booking_id, booking);
    });

    return map;
  }, [bookings]);

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
      if (item.media_type !== "video") {
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
  // Enhance gallery records
  // -------------------------------------------------------------

  const enrichedGalleries = useMemo(() => {
    return galleries.map((gallery) => {
      const client = clientMap.get(gallery.client_id);
      const booking = bookingMap.get(gallery.booking_id);

      const clientName = getClientName(client?.profile);

      return {
        ...gallery,
        clientName,
        clientEmail: client?.profile?.email || "",
        booking,
        mediaCount: mediaCountMap.get(gallery.gallery_id) || 0,
        photoCount: photoCountMap.get(gallery.gallery_id) || 0,
        videoCount: videoCountMap.get(gallery.gallery_id) || 0,
      };
    });
  }, [
    galleries,
    clientMap,
    bookingMap,
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
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" && gallery.is_published) ||
        (statusFilter === "unpublished" && !gallery.is_published);

      if (!matchesStatus) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchableText = [
        gallery.name,
        gallery.description,
        gallery.clientName,
        gallery.clientEmail,
        gallery.booking?.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(search);
    });
  }, [enrichedGalleries, searchTerm, statusFilter]);

  // -------------------------------------------------------------
  // Summary statistics
  // -------------------------------------------------------------

  const totalGalleries = galleries.length;

  const publishedGalleries = galleries.filter(
    (gallery) => gallery.is_published
  ).length;

  const unpublishedGalleries = galleries.filter(
    (gallery) => !gallery.is_published
  ).length;

  const totalMedia = media.length;

  // -------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------

  const handleCreateGallery = () => {
    navigate("/photographer/galleries/new");
  };

  const handleViewGallery = (galleryId) => {
    navigate(`/photographer/galleries/${galleryId}`);
  };

  const handleEditGallery = (galleryId) => {
    navigate(`/photographer/galleries/${galleryId}/edit`);
  };

  // -------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------

  if (loading) {
    return (
      <div className="galleries-page">
        <div className="galleries-container">
          <div className="galleries-loading">
            <div className="galleries-spinner" aria-hidden="true"></div>
            <p>Loading galleries...</p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------

  if (errorMessage) {
    return (
      <div className="galleries-page">
        <div className="galleries-container">
          <header className="galleries-header">
            <div className="galleries-header-main">
              <span className="galleries-eyebrow">Client delivery</span>
              <h1>Galleries</h1>
              <p className="galleries-description">
                Manage your client galleries, delivered media and download access.
              </p>
            </div>
          </header>

          <div className="galleries-message error-message" role="alert">
            <strong>Unable to load galleries</strong>
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
      </div>
    );
  }

  return (
    <div className="galleries-page">
      <div className="galleries-container">
        {/* ========================================================
            HEADER
        ======================================================== */}

        <header className="galleries-header">
          <div className="galleries-header-main">
            <span className="galleries-eyebrow">Client delivery</span>
            <h1>Galleries</h1>
            <p className="galleries-description">
              Manage your client galleries, delivered media and download access.
            </p>
          </div>

          <button
            type="button"
            className="galleries-primary-button"
            onClick={handleCreateGallery}
          >
            <BiPlus aria-hidden="true" />
            New Gallery
          </button>
        </header>

        {/* ========================================================
            SUMMARY CARDS
        ======================================================== */}

        <section className="galleries-summary" aria-label="Gallery summary">
          <div className="gallery-summary-card">
            <div className="gallery-summary-icon">
              <BiImages aria-hidden="true" />
            </div>
            <div>
              <span>Total galleries</span>
              <strong>{totalGalleries}</strong>
            </div>
          </div>

          <div className="gallery-summary-card">
            <div className="gallery-summary-icon published">
              <BiCheckCircle aria-hidden="true" />
            </div>
            <div>
              <span>Published</span>
              <strong>{publishedGalleries}</strong>
            </div>
          </div>

          <div className="gallery-summary-card">
            <div className="gallery-summary-icon unpublished">
              <BiLockAlt aria-hidden="true" />
            </div>
            <div>
              <span>Unpublished</span>
              <strong>{unpublishedGalleries}</strong>
            </div>
          </div>

          <div className="gallery-summary-card">
            <div className="gallery-summary-icon media">
              <BiImage aria-hidden="true" />
            </div>
            <div>
              <span>Total media</span>
              <strong>{totalMedia}</strong>
            </div>
          </div>
        </section>

        {/* ========================================================
            SEARCH + FILTERS
        ======================================================== */}

        <section className="galleries-toolbar" aria-label="Gallery filters">
          <div className="galleries-search">
            <BiSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Search galleries or clients..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search galleries"
            />

            {searchTerm && (
              <button
                type="button"
                className="galleries-clear-search"
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
              >
                <BiX aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="galleries-filter-tabs" aria-label="Gallery status filter">
            <button
              type="button"
              className={statusFilter === "all" ? "gallery-filter active" : "gallery-filter"}
              onClick={() => setStatusFilter("all")}
              aria-pressed={statusFilter === "all"}
            >
              All
              <span>{totalGalleries}</span>
            </button>

            <button
              type="button"
              className={statusFilter === "published" ? "gallery-filter active" : "gallery-filter"}
              onClick={() => setStatusFilter("published")}
              aria-pressed={statusFilter === "published"}
            >
              Published
              <span>{publishedGalleries}</span>
            </button>

            <button
              type="button"
              className={statusFilter === "unpublished" ? "gallery-filter active" : "gallery-filter"}
              onClick={() => setStatusFilter("unpublished")}
              aria-pressed={statusFilter === "unpublished"}
            >
              Unpublished
              <span>{unpublishedGalleries}</span>
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
                <BiImages aria-hidden="true" />
              </div>

              <h2>
                {searchTerm || statusFilter !== "all"
                  ? "No galleries found"
                  : "No galleries yet"}
              </h2>

              <p>
                {searchTerm || statusFilter !== "all"
                  ? "Try changing your search or filter."
                  : "Create your first client gallery to start delivering photography."}
              </p>

              {!searchTerm && statusFilter === "all" && (
                <button
                  type="button"
                  className="galleries-primary-button"
                  onClick={handleCreateGallery}
                >
                  <BiPlus aria-hidden="true" />
                  Create Your First Gallery
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="galleries-results-heading">
                <div>
                  <span className="galleries-results-eyebrow">Gallery library</span>
                  <h2>Your Galleries</h2>
                </div>

                <span className="galleries-results-count">
                  Showing {filteredGalleries.length}{" "}
                  {filteredGalleries.length === 1 ? "gallery" : "galleries"}
                </span>
              </div>

              <div className="galleries-grid">
                {filteredGalleries.map((gallery) => {
                  const clientName = gallery.clientName;
                  const bookingDate = gallery.booking?.booking_date;

                  return (
                    <article className="gallery-card" key={gallery.gallery_id}>
                      <div
                        className={`gallery-card-preview ${gallery.thumbnail ? "has-thumbnail" : ""}`}
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

                        {gallery.mediaCount > 0 && (
                          <span className="gallery-thumbnail-count">
                            <BiImages aria-hidden="true" />
                            {gallery.mediaCount}
                          </span>
                        )}

                        <span
                          className={
                            gallery.is_published
                              ? "gallery-status published"
                              : "gallery-status unpublished"
                          }
                        >
                          <span className="gallery-status-dot" aria-hidden="true"></span>
                          {getGalleryStatus(gallery.is_published)}
                        </span>
                      </div>

                      <div className="gallery-card-content">
                        <div className="gallery-card-heading">
                          <h3>{gallery.name}</h3>
                          <p>{gallery.description || "No gallery description added."}</p>
                        </div>

                        <div className="gallery-client">
                          <div className="gallery-client-avatar" aria-hidden="true">
                            {getInitials(clientName)}
                          </div>
                          <div>
                            <span>Client</span>
                            <strong>{clientName}</strong>
                          </div>
                        </div>

                        <div className="gallery-meta">
                          <div className="gallery-meta-item">
                            <BiCalendar aria-hidden="true" />
                            <div>
                              <span>Booking</span>
                              <strong>
                                {bookingDate ? formatDate(bookingDate) : "No booking"}
                              </strong>
                            </div>
                          </div>

                          <div className="gallery-meta-item">
                            <BiImages aria-hidden="true" />
                            <div>
                              <span>Media</span>
                              <strong>{formatMediaCount(gallery.mediaCount)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="gallery-media-breakdown" aria-label="Media breakdown">
                          <span>
                            <strong>{gallery.photoCount}</strong>{" "}
                            {gallery.photoCount === 1 ? "photo" : "photos"}
                          </span>
                          <span className="gallery-breakdown-divider" aria-hidden="true">•</span>
                          <span>
                            <strong>{gallery.videoCount}</strong>{" "}
                            {gallery.videoCount === 1 ? "video" : "videos"}
                          </span>
                        </div>

                        <div
                          className={`gallery-download-status ${gallery.allow_downloads ? "enabled" : "disabled"}`}
                        >
                          <BiDownload aria-hidden="true" />
                          <span>
                            Client downloads <strong>{gallery.allow_downloads ? "enabled" : "disabled"}</strong>
                          </span>
                        </div>

                        <div className="gallery-card-actions">
                          <button
                            type="button"
                            className="gallery-view-button"
                            onClick={() => handleViewGallery(gallery.gallery_id)}
                          >
                            <span>View Gallery</span>
                            <BiChevronRight aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            className="gallery-edit-button"
                            onClick={() => handleEditGallery(gallery.gallery_id)}
                            aria-label={`Edit ${gallery.name}`}
                            title="Edit gallery"
                          >
                            <BiEdit aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="gallery-card-footer">
                        Updated {formatDate(gallery.updated_at)}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
