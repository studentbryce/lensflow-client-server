import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient"; // Storage operations only
import { apiGetPortfolioOptions, apiCreatePortfolioItem } from "../../services/photographerWebsiteApi";
import "./NewPortfolioItem.css";

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "",
  published: true,
};

function getFileExtension(fileName = "") {
  const parts = fileName.split(".");

  if (parts.length < 2) {
    return "jpg";
  }

  const extension = parts.pop()?.toLowerCase();

  const allowedExtensions = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
  ];

  return allowedExtensions.includes(extension)
    ? extension
    : "jpg";
}

function getTitleFromFileName(fileName = "") {
  const withoutExtension = fileName.replace(
    /\.[^/.]+$/,
    ""
  );

  const cleaned = withoutExtension
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Portfolio Image";
  }

  return cleaned
    .split(" ")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
    )
    .join(" ");
}

function formatFileName(fileName = "") {
  return fileName.length > 42
    ? `${fileName.substring(0, 39)}...`
    : fileName;
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    ),
    units.length - 1
  );

  const size =
    bytes / Math.pow(1024, index);

  return `${size.toFixed(
    index === 0 ? 0 : 1
  )} ${units[index]}`;
}

export default function NewPortfolioItem() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [photographerId, setPhotographerId] =
    useState(null);

  const [galleries, setGalleries] = useState([]);
  const [media, setMedia] = useState([]);

  const [selectedGalleryId, setSelectedGalleryId] =
    useState("all");

  const [selectedMedia, setSelectedMedia] =
    useState(null);

  const [formData, setFormData] =
    useState(EMPTY_FORM);

  /*
   * ---------------------------------------------------------
   * Load photographer profile + galleries + gallery images
   * ---------------------------------------------------------
   */

  useEffect(() => {
    let active = true;

    async function loadPortfolioData() {
      try {
        const options = await apiGetPortfolioOptions();
        if (!active) return;

        const currentPhotographerId = options.photographer_id;
        setPhotographerId(currentPhotographerId);
        const loadedGalleries = options.galleries;
        setGalleries(loadedGalleries);
        if (loadedGalleries.length === 0) {
          setMedia([]);
          return;
        }
        const mediaData = options.media;

        // Signed URLs are still created only for the existing portfolio
        // options, using the same private client-media Storage bucket.
        const mediaWithUrls = await Promise.all(
          (mediaData || []).map(async (item) => {
            const { data: signedUrlData, error: signedUrlError } =
              await supabase.storage
                .from("client-media")
                .createSignedUrl(item.storage_path, 60 * 60);

            if (signedUrlError) {
              console.warn(
                `Could not create preview URL for ${item.file_name}:`,
                signedUrlError
              );
              return { ...item, preview_url: null };
            }

            return {
              ...item,
              preview_url: signedUrlData?.signedUrl || null,
            };
          })
        );

        if (active) setMedia(mediaWithUrls);
      } catch (err) {
        if (!active) return;
        console.error("Error loading portfolio data:", err);
        setError(
          err?.message ||
            "Unable to load your portfolio media. Please try again."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPortfolioData();
    return () => { active = false; };
  }, []);

  /*
   * ---------------------------------------------------------
   * Gallery lookup
   * ---------------------------------------------------------
   */

  const galleryMap = useMemo(() => {
    return galleries.reduce(
      (map, gallery) => {
        map[gallery.gallery_id] =
          gallery.name;

        return map;
      },
      {}
    );
  }, [galleries]);

  function getGalleryName(galleryId) {
    return (
      galleryMap[galleryId] ||
      "Unknown Gallery"
    );
  }

  /*
   * ---------------------------------------------------------
   * Filter media by selected gallery
   * ---------------------------------------------------------
   */

  const filteredMedia = useMemo(() => {
    if (selectedGalleryId === "all") {
      return media;
    }

    return media.filter(
      (item) =>
        item.gallery_id ===
        selectedGalleryId
    );
  }, [
    media,
    selectedGalleryId,
  ]);

  /*
   * ---------------------------------------------------------
   * Form handling
   * ---------------------------------------------------------
   */

  function handleInputChange(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));
  }

  /*
   * ---------------------------------------------------------
   * Image selection
   * ---------------------------------------------------------
   */

  function handleMediaSelect(item) {
    setSelectedMedia(item);

    /*
     * Automatically generate a sensible title
     * when the title field is currently empty.
     */

    setFormData((previous) => ({
      ...previous,
      title:
        previous.title.trim() === ""
          ? getTitleFromFileName(
              item.file_name
            )
          : previous.title,
    }));

    setError("");
    setSuccess("");
  }

  /*
   * ---------------------------------------------------------
   * Remove current selection
   * ---------------------------------------------------------
   */

  function clearSelectedMedia() {
    setSelectedMedia(null);
  }

  /*
   * ---------------------------------------------------------
   * Get next portfolio display order
   *
   * New portfolio items are automatically added
   * to the end of the portfolio.
   *
   * Existing ordering remains controlled from
   * Portfolio.jsx using drag-and-drop.
   * ---------------------------------------------------------
   */

  // Display order is assigned by the Express API on creation.

  /*
   * ---------------------------------------------------------
   * Submit
   *
   * 1. Validate selected image
   * 2. Determine next portfolio order
   * 3. Download private gallery image
   * 4. Upload copy to portfolio-media
   * 5. Get public URL
   * 6. Insert portfolio_items row
   * 7. Store source_media_id
   * 8. Clean up copied storage file if DB insert fails
   * ---------------------------------------------------------
   */

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!photographerId) {
      setError(
        "Your photographer profile could not be identified."
      );

      return;
    }

    if (!selectedMedia) {
      setError(
        "Please select an image for your portfolio."
      );

      return;
    }

    if (!formData.title.trim()) {
      setError(
        "Please enter a portfolio title."
      );

      return;
    }

    setSaving(true);

    let portfolioStoragePath =
      null;

    try {
      /*
       * -------------------------------------------------------
       * Step 1: Determine the next display position.
       *
       * This automatically places the new item at
       * the end of the existing portfolio.
       * -------------------------------------------------------
       */

      // Express assigns the next display order after validating ownership.
      /*
       * -------------------------------------------------------
       * Step 2: Download the original image from
       * private client-media storage.
       * -------------------------------------------------------
       */

      const {
        data: originalFile,
        error: downloadError,
      } = await supabase.storage
        .from("client-media")
        .download(
          selectedMedia.storage_path
        );

      if (downloadError) {
        throw downloadError;
      }

      if (!originalFile) {
        throw new Error(
          "The selected gallery image could not be downloaded."
        );
      }

      /*
       * -------------------------------------------------------
       * Step 3: Create a unique portfolio storage path.
       *
       * Example:
       *
       * photographer-id/
       *   portfolio/
       *     uuid.jpg
       * -------------------------------------------------------
       */

      const extension =
        getFileExtension(
          selectedMedia.file_name
        );

      const uniqueFileName = `${crypto.randomUUID()}.${extension}`;

      portfolioStoragePath = [
        photographerId,
        "portfolio",
        uniqueFileName,
      ].join("/");

      /*
       * -------------------------------------------------------
       * Step 4: Upload the copy to portfolio-media.
       * -------------------------------------------------------
       */

      const {
        error: portfolioUploadError,
      } = await supabase.storage
        .from("portfolio-media")
        .upload(
          portfolioStoragePath,
          originalFile,
          {
            cacheControl: "3600",
            upsert: false,
            contentType:
              selectedMedia.mime_type ||
              originalFile.type ||
              "image/jpeg",
          }
        );

      if (portfolioUploadError) {
        throw portfolioUploadError;
      }

      /*
       * -------------------------------------------------------
       * Step 5: Get the public URL for the copied
       * portfolio image.
       * -------------------------------------------------------
       */

      const {
        data: { publicUrl },
      } = supabase.storage
        .from("portfolio-media")
        .getPublicUrl(
          portfolioStoragePath
        );

      if (!publicUrl) {
        throw new Error(
          "The portfolio image was uploaded, but a public URL could not be generated."
        );
      }

      /*
       * -------------------------------------------------------
       * Step 6: Insert portfolio database record.
       * -------------------------------------------------------
       */

      let insertError = null;
      try {
        await apiCreatePortfolioItem({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          media_url: publicUrl,
          thumbnail_url: publicUrl,
          category: formData.category.trim() || null,
          published: formData.published,
          source_media_id: selectedMedia.media_id,
        });
      } catch (error) { insertError = error; }

      /*
       * -------------------------------------------------------
       * Step 7: If the database insert failed,
       * remove the copied storage file.
       * -------------------------------------------------------
       */

      if (insertError) {
        try {
          await supabase.storage
            .from("portfolio-media")
            .remove([
              portfolioStoragePath,
            ]);
        } catch (cleanupError) {
          console.error(
            "Portfolio storage cleanup failed:",
            cleanupError
          );
        }

        portfolioStoragePath = null;

        throw insertError;
      }

      /*
       * Everything succeeded.
       */

      setSuccess(
        "Portfolio item created successfully."
      );

      /*
       * Give the success message a moment
       * before returning to the portfolio.
       */

      setTimeout(() => {
        navigate(
          "/photographer/portfolio"
        );
      }, 700);
    } catch (err) {
      console.error(
        "Error creating portfolio item:",
        err
      );

      /*
       * Extra cleanup protection.
       */

      if (portfolioStoragePath) {
        try {
          await supabase.storage
            .from("portfolio-media")
            .remove([
              portfolioStoragePath,
            ]);
        } catch (cleanupError) {
          console.error(
            "Failed to clean up portfolio storage file:",
            cleanupError
          );
        }
      }

      setError(
        err?.message ||
          "Unable to create the portfolio item. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * Loading state
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="new-portfolio-page">
        <div className="new-portfolio-container">
          <div className="new-portfolio-media-loading">
            <div className="new-portfolio-spinner" />

            <p>
              Loading your gallery images...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * Render
   * ---------------------------------------------------------
   */

  return (
    <div className="new-portfolio-page">
      <div className="new-portfolio-container">

        {/* =========================
            HEADER
        ========================== */}

        <div className="new-portfolio-header">
          <div>
            <button
              type="button"
              className="new-portfolio-back"
              onClick={() =>
                navigate(
                  "/photographer/portfolio"
                )
              }
            >
              ← Back to Portfolio
            </button>

            <h1>
              Add Portfolio Item
            </h1>

            <p>
              Choose an image from one of
              your client galleries to add
              to your public portfolio.
            </p>
          </div>
        </div>

        {/* =========================
            ERROR
        ========================== */}

        {error && (
          <div
            className="new-portfolio-alert new-portfolio-alert-error"
            role="alert"
          >
            <span className="new-portfolio-alert-icon">
              !
            </span>

            <div>
              <strong>
                Something went wrong
              </strong>

              <p>{error}</p>
            </div>
          </div>
        )}

        {/* =========================
            SUCCESS
        ========================== */}

        {success && (
          <div
            className="new-portfolio-alert new-portfolio-alert-success"
            role="status"
          >
            <span className="new-portfolio-alert-icon">
              ✓
            </span>

            <div>
              <strong>
                Success
              </strong>

              <p>{success}</p>
            </div>
          </div>
        )}

        <form
          className="new-portfolio-form"
          onSubmit={handleSubmit}
        >

          {/* =================================================
              MEDIA SELECTION
          ================================================= */}

          <section className="new-portfolio-section">

            <div className="new-portfolio-section-header">
              <div>
                <span className="new-portfolio-section-eyebrow">
                  Step 1
                </span>

                <h2>
                  Choose an image
                </h2>

                <p>
                  Select an image from your
                  existing client galleries.
                </p>
              </div>

              <div className="new-portfolio-media-count">
                {filteredMedia.length}{" "}
                {filteredMedia.length === 1
                  ? "image"
                  : "images"}
              </div>
            </div>

            {/* =========================
                GALLERY FILTER
            ========================== */}

            {galleries.length > 0 && (
              <div className="new-portfolio-gallery-filter">

                <div className="new-portfolio-filter-field">

                  <label htmlFor="gallery-filter">
                    Filter by gallery
                  </label>

                  <select
                    id="gallery-filter"
                    value={selectedGalleryId}
                    onChange={(event) =>
                      setSelectedGalleryId(
                        event.target.value
                      )
                    }
                  >
                    <option value="all">
                      All galleries (
                      {media.length})
                    </option>

                    {galleries.map(
                      (gallery) => {
                        const galleryImageCount =
                          media.filter(
                            (item) =>
                              item.gallery_id ===
                              gallery.gallery_id
                          ).length;

                        return (
                          <option
                            key={
                              gallery.gallery_id
                            }
                            value={
                              gallery.gallery_id
                            }
                          >
                            {gallery.name} (
                            {
                              galleryImageCount
                            }
                            )
                          </option>
                        );
                      }
                    )}
                  </select>
                </div>

                {selectedGalleryId !==
                  "all" && (
                  <button
                    type="button"
                    className="new-portfolio-clear-filter"
                    onClick={() =>
                      setSelectedGalleryId(
                        "all"
                      )
                    }
                  >
                    Show all galleries
                  </button>
                )}

              </div>
            )}

            {/* =========================
                NO GALLERIES
            ========================== */}

            {galleries.length === 0 && (
              <div className="new-portfolio-empty">

                <div className="new-portfolio-empty-icon">
                  ▧
                </div>

                <h3>
                  No galleries available
                </h3>

                <p>
                  Create a gallery and upload
                  some images before adding
                  portfolio items.
                </p>

                <button
                  type="button"
                  className="new-portfolio-secondary-button"
                  onClick={() =>
                    navigate(
                      "/photographer/galleries"
                    )
                  }
                >
                  Go to Galleries
                </button>

              </div>
            )}

            {/* =========================
                NO IMAGES
            ========================== */}

            {galleries.length > 0 &&
              media.length === 0 && (
                <div className="new-portfolio-empty">

                  <div className="new-portfolio-empty-icon">
                    ◫
                  </div>

                  <h3>
                    No gallery images found
                  </h3>

                  <p>
                    Upload some images to your
                    client galleries before
                    adding them to your
                    portfolio.
                  </p>

                  <button
                    type="button"
                    className="new-portfolio-secondary-button"
                    onClick={() =>
                      navigate(
                        "/photographer/galleries"
                      )
                    }
                  >
                    Go to Galleries
                  </button>

                </div>
              )}

            {/* =========================
                SELECTED GALLERY EMPTY
            ========================== */}

            {galleries.length > 0 &&
              media.length > 0 &&
              filteredMedia.length === 0 && (
                <div className="new-portfolio-empty">

                  <div className="new-portfolio-empty-icon">
                    ◫
                  </div>

                  <h3>
                    No images in this gallery
                  </h3>

                  <p>
                    Choose another gallery or
                    show all galleries.
                  </p>

                  <button
                    type="button"
                    className="new-portfolio-secondary-button"
                    onClick={() =>
                      setSelectedGalleryId(
                        "all"
                      )
                    }
                  >
                    Show All Images
                  </button>

                </div>
              )}

            {/* =========================
                IMAGE GRID
            ========================== */}

            {filteredMedia.length > 0 && (
              <div className="new-portfolio-media-grid">

                {filteredMedia.map(
                  (item) => {
                    const isSelected =
                      selectedMedia?.media_id ===
                      item.media_id;

                    return (
                      <button
                        type="button"
                        key={item.media_id}
                        className={`new-portfolio-media-card ${
                          isSelected
                            ? "new-portfolio-media-selected"
                            : ""
                        }`}
                        onClick={() =>
                          handleMediaSelect(
                            item
                          )
                        }
                        aria-pressed={
                          isSelected
                        }
                        title={
                          item.file_name
                        }
                      >

                        <div className="new-portfolio-media-image-wrapper">

                          {item.preview_url ? (
                            <img
                              src={
                                item.preview_url
                              }
                              alt={
                                item.file_name
                              }
                              className="new-portfolio-media-image"
                              loading="lazy"
                            />
                          ) : (
                            <div className="new-portfolio-media-unavailable">
                              <span>
                                Preview unavailable
                              </span>
                            </div>
                          )}

                          {isSelected && (
                            <div className="new-portfolio-media-selected-overlay">

                              <span className="new-portfolio-media-check">
                                ✓
                              </span>

                            </div>
                          )}

                          <div className="new-portfolio-media-hover-info">
                            <span>
                              {formatFileName(
                                item.file_name
                              )}
                            </span>
                          </div>

                        </div>

                      </button>
                    );
                  }
                )}

              </div>
            )}

          </section>

          {/* =================================================
              SELECTED IMAGE
          ================================================= */}

          {selectedMedia && (
            <section className="new-portfolio-section new-portfolio-selected">

              <div className="new-portfolio-selected-header">

                <div>
                  <span className="new-portfolio-section-eyebrow">
                    Selected image
                  </span>

                  <h2>
                    Portfolio preview
                  </h2>
                </div>

                <button
                  type="button"
                  className="new-portfolio-remove-selection"
                  onClick={
                    clearSelectedMedia
                  }
                >
                  Change image
                </button>

              </div>

              <div className="new-portfolio-selected-content">

                <div className="new-portfolio-selected-preview">

                  {selectedMedia.preview_url ? (
                    <img
                      src={
                        selectedMedia.preview_url
                      }
                      alt={
                        selectedMedia.file_name
                      }
                    />
                  ) : (
                    <div className="new-portfolio-media-unavailable">
                      Preview unavailable
                    </div>
                  )}

                </div>

                <div className="new-portfolio-selected-details">

                  <span className="new-portfolio-selected-label">
                    Source gallery
                  </span>

                  <strong>
                    {getGalleryName(
                      selectedMedia.gallery_id
                    )}
                  </strong>

                  <span className="new-portfolio-selected-label">
                    Original file
                  </span>

                  <strong
                    className="new-portfolio-selected-file"
                    title={
                      selectedMedia.file_name
                    }
                  >
                    {selectedMedia.file_name}
                  </strong>

                  {selectedMedia.file_size && (
                    <>
                      <span className="new-portfolio-selected-label">
                        File size
                      </span>

                      <strong>
                        {formatFileSize(
                          selectedMedia.file_size
                        )}
                      </strong>
                    </>
                  )}

                  <div className="new-portfolio-copy-notice">

                    <span>✓</span>

                    <p>
                      A copy of this image
                      will be stored in your
                      public portfolio. Your
                      original client gallery
                      image will remain private
                      and unchanged.
                    </p>

                  </div>

                </div>

              </div>

            </section>
          )}

          {/* =================================================
              PORTFOLIO DETAILS
          ================================================= */}

          {selectedMedia && (
            <section className="new-portfolio-section">

              <div className="new-portfolio-section-header">

                <div>
                  <span className="new-portfolio-section-eyebrow">
                    Step 2
                  </span>

                  <h2>
                    Portfolio details
                  </h2>

                  <p>
                    Add information that will
                    be displayed with this
                    portfolio item.
                  </p>
                </div>

              </div>

              <div className="new-portfolio-fields">

                {/* TITLE */}

                <div className="new-portfolio-field new-portfolio-field-full">

                  <label htmlFor="title">
                    Title{" "}
                    <span>*</span>
                  </label>

                  <input
                    id="title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={
                      handleInputChange
                    }
                    placeholder="e.g. Summer Wedding"
                    maxLength={150}
                    required
                  />

                </div>

                {/* DESCRIPTION */}

                <div className="new-portfolio-field new-portfolio-field-full">

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
                      handleInputChange
                    }
                    placeholder="Describe this portfolio image..."
                    rows={5}
                    maxLength={1000}
                  />

                  <span className="new-portfolio-field-help">
                    Optional description for
                    visitors viewing your
                    portfolio.
                  </span>

                </div>

                {/* CATEGORY */}

                <div className="new-portfolio-field">

                  <label htmlFor="category">
                    Category
                  </label>

                  <input
                    id="category"
                    name="category"
                    type="text"
                    value={
                      formData.category
                    }
                    onChange={
                      handleInputChange
                    }
                    placeholder="e.g. Weddings"
                    maxLength={100}
                  />

                </div>

              </div>

              {/* =========================
                  PUBLISHED
              ========================== */}

              <label className="new-portfolio-published-toggle">

                <input
                  type="checkbox"
                  name="published"
                  checked={
                    formData.published
                  }
                  onChange={
                    handleInputChange
                  }
                />

                <span className="new-portfolio-toggle">
                  <span />
                </span>

                <span className="new-portfolio-toggle-text">

                  <strong>
                    Publish this portfolio item
                  </strong>

                  <small>
                    When enabled, visitors can
                    see this image on your public
                    portfolio.
                  </small>

                </span>

              </label>

            </section>
          )}

          {/* =================================================
              ACTIONS
          ================================================= */}

          {selectedMedia && (
            <div className="new-portfolio-actions">

              <button
                type="button"
                className="new-portfolio-cancel-button"
                onClick={() =>
                  navigate(
                    "/photographer/portfolio"
                  )
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="new-portfolio-submit-button"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="new-portfolio-button-spinner" />
                    Adding to Portfolio...
                  </>
                ) : (
                  <>
                    Add to Portfolio
                    <span>→</span>
                  </>
                )}
              </button>

            </div>
          )}

        </form>
      </div>
    </div>
  );
}