import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BiImageAdd,
  BiCheckCircle,
  BiLinkExternal,
  BiSave,
  BiStar,
  BiTrash,
} from "react-icons/bi";

import { useAuth } from "../../context/authStore";
import { supabase } from "../../lib/supabaseClient"; // Storage uploads only
import { apiGetPhotographerWebsite, apiSavePhotographerWebsite } from "../../services/photographerWebsiteApi";
import {
  websiteDefaults,
  websiteFonts,
  validSlug,
  safeImageUrl,
  safeColour,
} from "../../lib/website";

import "./WebsiteBuilder.css";

const WEBSITE_MEDIA_BUCKET = "photographer-website-media";

const MAX_IMAGE_SIZE = 50 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export default function WebsiteBuilder() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);

  const [settings, setSettings] = useState(websiteDefaults);

  const [about, setAbout] = useState({
    title: "About me",
    content: "",
    image_url: "",
  });

  const [aboutId, setAboutId] = useState(null);

  const [slug, setSlug] = useState("");
  const [published, setPublished] = useState(false);

  const [approvedReviews, setApprovedReviews] = useState([]);
  const [featuredReviewIds, setFeaturedReviewIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");

  const [retry, setRetry] = useState(0);

  const saveLock = useRef(false);
  const uploadLock = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadWebsite() {
      setLoading(true);
      setLoadError("");
      setError("");
      setMessage("");

      try {
        if (!user?.id) {
          throw new Error("Please sign in.");
        }

        const response = await apiGetPhotographerWebsite();
        const owner = response.profile;
        const config = { data: response.settings };
        const content = { data: response.about };
        const publicReviews = { data: response.approved_reviews };
        const featuredReviews = { data: response.featured_review_ids.map(review_id => ({ review_id })) };

        if (!active) {
          return;
        }

        setProfile(owner);
        setSlug(owner.slug || "");
        setPublished(Boolean(owner.published));

        setSettings(
          Object.fromEntries(
            Object.entries(websiteDefaults).map(
              ([key, fallback]) => [
                key,
                config.data?.[key] ?? fallback,
              ]
            )
          )
        );

        setAboutId(content.data?.content_id || null);

        setAbout({
          title: content.data?.title || "About me",
          content: content.data?.content || "",
          image_url: content.data?.image_url || "",
        });

        setApprovedReviews(publicReviews.data || []);
        setFeaturedReviewIds(
          (featuredReviews.data || []).map((item) => item.review_id)
        );
      } catch (loadWebsiteError) {
        console.error(
          "Website builder load error:",
          loadWebsiteError
        );

        if (active) {
          setLoadError(
            "Unable to load your website. Please try again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadWebsite();

    return () => {
      active = false;
    };
  }, [user?.id, retry]);

  function clearStatus() {
    setError("");
    setMessage("");
  }

  async function uploadImage(event, section) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (
      !file ||
      !profile ||
      uploadLock.current ||
      saveLock.current
    ) {
      return;
    }

    clearStatus();

    const extension =
      ALLOWED_IMAGE_TYPES[file.type];

    if (!extension) {
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

    if (file.size > MAX_IMAGE_SIZE) {
      setError(
        "Please choose an image no larger than 50 MB."
      );
      return;
    }

    uploadLock.current = true;
    setUploading(section);

    try {
      const uniqueId =
        crypto.randomUUID();

      const storagePath = [
        profile.photographer_id,
        section,
        `${uniqueId}.${extension}`,
      ].join("/");

      const bucket =
        supabase.storage.from(
          WEBSITE_MEDIA_BUCKET
        );

      const {
        error: uploadError,
      } = await bucket.upload(
        storagePath,
        file,
        {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        }
      );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: publicUrlData,
      } = bucket.getPublicUrl(
        storagePath
      );

      const publicUrl =
        publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error(
          "Unable to create the public image URL."
        );
      }

      if (section === "hero") {
        setSettings((current) => ({
          ...current,
          hero_image_url: publicUrl,
        }));
      }

      if (section === "about") {
        setAbout((current) => ({
          ...current,
          image_url: publicUrl,
        }));
      }

      setMessage(
        "Image uploaded. Select Save Website to apply it to your website."
      );
    } catch (uploadError) {
      console.error(
        "Website image upload failed:",
        uploadError
      );

      setError(
        "Unable to upload the image. Please try again."
      );
    } finally {
      uploadLock.current = false;
      setUploading("");
    }
  }

  function removeImage(section) {
    clearStatus();

    if (section === "hero") {
      setSettings((current) => ({
        ...current,
        hero_image_url: "",
      }));

      setMessage(
        "Hero image removed from the website. Select Save Website to apply the change."
      );

      return;
    }

    setAbout((current) => ({
      ...current,
      image_url: "",
    }));

    setMessage(
      "About image removed from the website. Select Save Website to apply the change."
    );
  }

  function toggleFeaturedReview(reviewId) {
    clearStatus();

    setFeaturedReviewIds((current) => {
      if (current.includes(reviewId)) {
        return current.filter((id) => id !== reviewId);
      }

      if (current.length >= 3) {
        setError(
          "You can feature up to 3 reviews on your website."
        );
        return current;
      }

      return [...current, reviewId];
    });
  }

  async function save(event) {
    event.preventDefault();

    if (
      saveLock.current ||
      uploadLock.current ||
      !profile
    ) {
      return;
    }

    clearStatus();

    const nextSlug = slug
      .trim()
      .toLowerCase();

    if (!validSlug(nextSlug)) {
      setError(
        "Use a unique slug of up to 100 lowercase letters, numbers and single hyphens. App routes such as client, photographer and login are reserved."
      );
      return;
    }

    const heroUrl =
      settings.hero_image_url?.trim() ||
      "";

    const aboutUrl =
      about.image_url?.trim() ||
      "";

    if (
      [heroUrl, aboutUrl].some(
        (url) =>
          url &&
          !safeImageUrl(url)
      )
    ) {
      setError(
        "One of the website images has an invalid HTTPS URL."
      );
      return;
    }

    saveLock.current = true;
    setSaving(true);

    try {
      const saved = await apiSavePhotographerWebsite({
        slug: nextSlug,
        published,
        settings: {
          ...settings,
          hero_image_url: heroUrl || null,
          heading_font: settings.heading_font || websiteDefaults.heading_font,
          body_font: settings.body_font || websiteDefaults.body_font,
          navigation_font: settings.navigation_font || websiteDefaults.navigation_font,
        },
        about: {
          title: about.title.trim() || "About me",
          content: about.content.trim(),
          image_url: aboutUrl || null,
        },
        about_id: aboutId,
        featured_review_ids: featuredReviewIds,
      });
      const savedProfile = saved.profile;
      setAboutId(saved.about_id);

      setProfile(savedProfile);
      setSlug(nextSlug);

      setSettings((current) => ({
        ...current,
        hero_image_url: heroUrl,
      }));

      setAbout((current) => ({
        ...current,

        title:
          current.title.trim() ||
          "About me",

        content:
          current.content.trim(),

        image_url: aboutUrl,
      }));

      setMessage(
        published
          ? "Website saved and published."
          : "Website saved. It is not publicly visible."
      );
    } catch (saveError) {
      console.error(
        "Website save error:",
        saveError
      );

      // Show the API's safe validation/conflict message instead of hiding it.
      // The Express global error handler sanitises unexpected server errors.
      setError(
        saveError.message ||
        "Unable to finish saving. Some settings may have saved. Please try again."
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function editSettings(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setSettings((current) => ({
      ...current,

      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));

    setMessage("");
  }

  const heroPreview =
    safeImageUrl(
      settings.hero_image_url
    );

  const aboutPreview =
    safeImageUrl(
      about.image_url
    );

  const websiteUrl =
    profile?.slug
      ? `${window.location.origin}/${profile.slug}`
      : "";

  if (loading) {
    return (
      <div className="website-builder">
        <div className="wb-state">
          <span className="wb-spinner" />

          <p role="status">
            Loading your website…
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="website-builder">
        <div className="wb-state wb-state--error">
          <h2>
            Unable to load website
          </h2>

          <p role="alert">
            {loadError}
          </p>

          <button
            type="button"
            className="wb-secondary-button"
            onClick={() =>
              setRetry(
                (value) =>
                  value + 1
              )
            }
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="website-builder">
      <header className="wb-header">
        <div>
          <p className="wb-eyebrow">
            Your online presence
          </p>

          <h1>
            Website Builder
          </h1>

          <p className="wb-header-description">
            Make a home for your
            photography, your story and
            your client reviews.
          </p>
        </div>

        {profile?.published &&
          profile?.slug && (
            <a
              className="wb-preview-link"
              href={`/${profile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View live website

              <BiLinkExternal
                aria-hidden="true"
              />
            </a>
          )}
      </header>

      <form
        onSubmit={save}
        onChange={() =>
          setMessage("")
        }
      >
        <fieldset
          disabled={
            saving ||
            Boolean(uploading)
          }
          className="wb-fields"
        >
          <section className="wb-card">
            <div className="wb-card-heading">
              <div>
                <p className="wb-card-eyebrow">
                  Address
                </p>

                <h2>
                  Website address
                </h2>
              </div>
            </div>

            <label htmlFor="wb-slug">
              Website slug
            </label>

            <div className="wb-slug-field">
              <span>
                {window.location.origin}/
              </span>

              <input
                id="wb-slug"
                maxLength={100}
                required
                value={slug}
                autoComplete="off"
                spellCheck="false"
                onChange={(event) =>
                  setSlug(
                    event.target.value
                  )
                }
              />
            </div>

            <small>
              Use lowercase letters,
              numbers and hyphens.
            </small>

            <div className="wb-publish-row">
              <div>
                <strong>
                  Publish website
                </strong>

                <p>
                  Make your website
                  available to visitors.
                </p>
              </div>

              <label className="wb-switch">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(event) =>
                    setPublished(
                      event.target
                        .checked
                    )
                  }
                />

                <span className="wb-switch-track">
                  <span className="wb-switch-thumb" />
                </span>

                <span className="wb-sr-only">
                  Publish website
                </span>
              </label>
            </div>

            {websiteUrl && (
              <div className="wb-current-address">
                <span>
                  Saved address
                </span>

                <strong>
                  {websiteUrl}
                </strong>
              </div>
            )}

            <p className="wb-help-copy">
              Changing your slug changes
              your public website
              address.
            </p>
          </section>

          <section className="wb-card">
            <div className="wb-card-heading">
              <div>
                <p className="wb-card-eyebrow">
                  Hero
                </p>

                <h2>
                  Welcome section
                </h2>
              </div>
            </div>

            <label htmlFor="wb-title">
              Headline
            </label>

            <input
              id="wb-title"
              name="hero_title"
              maxLength={150}
              value={
                settings.hero_title
              }
              onChange={
                editSettings
              }
              placeholder="Capturing the moments that matter"
            />

            <label htmlFor="wb-description">
              Introduction
            </label>

            <textarea
              id="wb-description"
              name="hero_description"
              rows={4}
              value={
                settings.hero_description
              }
              onChange={
                editSettings
              }
              placeholder="Introduce your photography business and style."
            />

            <div className="wb-image-field">
              <div className="wb-image-field-heading">
                <div>
                  <label>
                    Hero banner
                  </label>

                  <p>
                    The main image shown
                    at the top of your
                    website.
                  </p>
                </div>
              </div>

              {heroPreview ? (
                <div className="wb-image-preview-wrap wb-image-preview-wrap--hero">
                  <img
                    className="wb-image-preview"
                    src={heroPreview}
                    alt="Hero banner preview"
                  />

                  <div className="wb-image-overlay">
                    <button
                      type="button"
                      className="wb-image-remove"
                      onClick={() =>
                        removeImage(
                          "hero"
                        )
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
                <div className="wb-image-empty wb-image-empty--hero">
                  <BiImageAdd
                    aria-hidden="true"
                  />

                  <strong>
                    Add a hero banner
                  </strong>

                  <span>
                    A wide landscape
                    image works best.
                  </span>
                </div>
              )}

              <div className="wb-image-controls">
                <label
                  htmlFor="wb-hero-upload"
                  className="wb-upload-button"
                >
                  <BiImageAdd
                    aria-hidden="true"
                  />

                  {uploading === "hero"
                    ? "Uploading…"
                    : heroPreview
                      ? "Replace image"
                      : "Choose image"}
                </label>

                <input
                  id="wb-hero-upload"
                  className="wb-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    uploadImage(
                      event,
                      "hero"
                    )
                  }
                />
              </div>

              <small>
                JPEG, PNG or WebP.
                Maximum 50 MB. A wide
                landscape image is
                recommended.
              </small>
            </div>
          </section>

          <section className="wb-card">
            <div className="wb-card-heading">
              <div>
                <p className="wb-card-eyebrow">
                  Story
                </p>

                <h2>
                  About you
                </h2>
              </div>
            </div>

            <label htmlFor="wb-about-title">
              Section title
            </label>

            <input
              id="wb-about-title"
              maxLength={150}
              value={about.title}
              onChange={(event) =>
                setAbout(
                  (current) => ({
                    ...current,
                    title:
                      event.target
                        .value,
                  })
                )
              }
            />

            <label htmlFor="wb-about">
              Your story
            </label>

            <textarea
              id="wb-about"
              rows={7}
              value={
                about.content
              }
              onChange={(event) =>
                setAbout(
                  (current) => ({
                    ...current,
                    content:
                      event.target
                        .value,
                  })
                )
              }
              placeholder="Tell visitors about yourself, your photography style and what makes your business special."
            />

            <div className="wb-image-field">
              <div className="wb-image-field-heading">
                <div>
                  <label>
                    About image
                  </label>

                  <p>
                    Add a portrait,
                    workspace photo or
                    another image that
                    represents you.
                  </p>
                </div>
              </div>

              {aboutPreview ? (
                <div className="wb-image-preview-wrap wb-image-preview-wrap--about">
                  <img
                    className="wb-image-preview"
                    src={aboutPreview}
                    alt="About preview"
                  />

                  <div className="wb-image-overlay">
                    <button
                      type="button"
                      className="wb-image-remove"
                      onClick={() =>
                        removeImage(
                          "about"
                        )
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
                <div className="wb-image-empty wb-image-empty--about">
                  <BiImageAdd
                    aria-hidden="true"
                  />

                  <strong>
                    Add an About image
                  </strong>

                  <span>
                    Portrait or square
                    images work well.
                  </span>
                </div>
              )}

              <div className="wb-image-controls">
                <label
                  htmlFor="wb-about-upload"
                  className="wb-upload-button"
                >
                  <BiImageAdd
                    aria-hidden="true"
                  />

                  {uploading === "about"
                    ? "Uploading…"
                    : aboutPreview
                      ? "Replace image"
                      : "Choose image"}
                </label>

                <input
                  id="wb-about-upload"
                  className="wb-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    uploadImage(
                      event,
                      "about"
                    )
                  }
                />
              </div>

              <small>
                JPEG, PNG or WebP.
                Maximum 50 MB.
              </small>
            </div>
          </section>

          <section className="wb-card">
            <div className="wb-card-heading">
              <div>
                <p className="wb-card-eyebrow">
                  Style
                </p>

                <h2>
                  Appearance & sections
                </h2>
              </div>
            </div>

            <div className="wb-typography">
              <p className="wb-section-label">
                Typography
              </p>

              <div className="wb-font-grid">
                <div>
                  <label htmlFor="wb-heading-font">
                    Heading font
                  </label>

                  <select
                    id="wb-heading-font"
                    name="heading_font"
                    value={
                      settings.heading_font ||
                      websiteDefaults.heading_font
                    }
                    onChange={editSettings}
                  >
                    {websiteFonts.map(
                      (font) => (
                        <option
                          key={
                            font.value
                          }
                          value={
                            font.value
                          }
                        >
                          {font.label}
                        </option>
                      )
                    )}
                  </select>

                  <small>
                    Used for page titles,
                    section headings and
                    service names.
                  </small>
                </div>

                <div>
                  <label htmlFor="wb-body-font">
                    Body font
                  </label>

                  <select
                    id="wb-body-font"
                    name="body_font"
                    value={
                      settings.body_font ||
                      websiteDefaults.body_font
                    }
                    onChange={editSettings}
                  >
                    {websiteFonts.map(
                      (font) => (
                        <option
                          key={
                            font.value
                          }
                          value={
                            font.value
                          }
                        >
                          {font.label}
                        </option>
                      )
                    )}
                  </select>

                  <small>
                    Used for paragraphs,
                    descriptions and client
                    reviews.
                  </small>
                </div>

                <div>
                  <label htmlFor="wb-navigation-font">
                    Navigation font
                  </label>

                  <select
                    id="wb-navigation-font"
                    name="navigation_font"
                    value={
                      settings.navigation_font ||
                      websiteDefaults.navigation_font
                    }
                    onChange={editSettings}
                  >
                    {websiteFonts.map(
                      (font) => (
                        <option
                          key={
                            font.value
                          }
                          value={
                            font.value
                          }
                        >
                          {font.label}
                        </option>
                      )
                    )}
                  </select>

                  <small>
                    Used for menus,
                    buttons and small
                    labels.
                  </small>
                </div>
              </div>
            </div>

            <div className="wb-style-divider" />

            <p className="wb-section-label">
              Colours
            </p>

            <div className="wb-colour-grid">
              <div>
                <label htmlFor="wb-primary">
                  Accent colour
                </label>

                <div className="wb-colour-control">
                  <input
                    id="wb-primary"
                    type="color"
                    name="primary_colour"
                    value={safeColour(
                      settings.primary_colour,
                      websiteDefaults.primary_colour
                    )}
                    onChange={
                      editSettings
                    }
                  />

                  <span>
                    {safeColour(
                      settings.primary_colour,
                      websiteDefaults.primary_colour
                    )}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="wb-background">
                  Background colour
                </label>

                <div className="wb-colour-control">
                  <input
                    id="wb-background"
                    type="color"
                    name="secondary_colour"
                    value={safeColour(
                      settings.secondary_colour,
                      websiteDefaults.secondary_colour
                    )}
                    onChange={
                      editSettings
                    }
                  />

                  <span>
                    {safeColour(
                      settings.secondary_colour,
                      websiteDefaults.secondary_colour
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="wb-style-divider" />

            <div className="wb-section-options">
              <p className="wb-section-label">
                Website sections
              </p>

              {[
                [
                  "show_about",
                  "About",
                  "Introduce yourself and your photography.",
                ],
                [
                  "show_services",
                  "Services",
                  "Show active photography services.",
                ],
                [
                  "show_portfolio",
                  "Portfolio",
                  "Display your published portfolio images.",
                ],
                [
                  "show_reviews",
                  "Reviews",
                  "Show approved client reviews.",
                ],
                [
                  "show_contact",
                  "Contact",
                  "Give visitors a way to get in touch.",
                ],
              ].map(
                ([
                  name,
                  label,
                  description,
                ]) => (
                  <label
                    className="wb-option-row"
                    key={name}
                  >
                    <div>
                      <strong>
                        {label}
                      </strong>

                      <span>
                        {description}
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      name={name}
                      checked={Boolean(
                        settings[name]
                      )}
                      onChange={
                        editSettings
                      }
                    />
                  </label>
                )
              )}
            </div>

            <div className="wb-portfolio-note">
              <p>
                Published items from your{" "}
                <Link to="/photographer/portfolio">
                  portfolio
                </Link>{" "}
                appear automatically. Choose up to three approved
                client reviews below to feature on your website.
              </p>
            </div>
          </section>

          <section className="wb-card wb-reviews-card">
            <div className="wb-card-heading wb-review-heading">
              <div>
                <p className="wb-card-eyebrow">
                  Client reviews
                </p>

                <h2>
                  Featured reviews
                </h2>

                <p className="wb-review-intro">
                  Choose up to three approved reviews to feature on
                  your website homepage.
                </p>
              </div>

              <span className="wb-review-count">
                {featuredReviewIds.length} of 3 selected
              </span>
            </div>

            {!settings.show_reviews && (
              <div className="wb-review-section-warning">
                The Reviews website section is currently turned off.
                You can still choose featured reviews now, but they
                will not appear until Reviews is enabled above.
              </div>
            )}

            {approvedReviews.length === 0 ? (
              <div className="wb-review-empty">
                <BiStar aria-hidden="true" />
                <strong>No approved reviews yet</strong>
                <span>
                  Approved client reviews will appear here and can
                  then be selected for your website.
                </span>
              </div>
            ) : (
              <div className="wb-review-options">
                {approvedReviews.map((review) => {
                  const selected = featuredReviewIds.includes(
                    review.review_id
                  );
                  const selectionNumber =
                    featuredReviewIds.indexOf(review.review_id) + 1;
                  const selectionLimitReached =
                    featuredReviewIds.length >= 3 && !selected;

                  return (
                    <button
                      key={review.review_id}
                      type="button"
                      className={`wb-review-option ${
                        selected ? "is-selected" : ""
                      }`}
                      aria-pressed={selected}
                      disabled={selectionLimitReached}
                      onClick={() =>
                        toggleFeaturedReview(review.review_id)
                      }
                    >
                      <div className="wb-review-option-top">
                        <div
                          className="wb-review-stars"
                          aria-label={`${review.rating} out of 5 stars`}
                        >
                          {[1, 2, 3, 4, 5].map((star) => (
                            <BiStar
                              key={star}
                              className={
                                star <= Number(review.rating)
                                  ? "is-filled"
                                  : ""
                              }
                              aria-hidden="true"
                            />
                          ))}
                        </div>

                        <span className="wb-review-selection">
                          {selected ? (
                            <>
                              <BiCheckCircle aria-hidden="true" />
                              Featured {selectionNumber}
                            </>
                          ) : selectionLimitReached ? (
                            "3 selected"
                          ) : (
                            "Select"
                          )}
                        </span>
                      </div>

                      {review.comment ? (
                        <p className="wb-review-comment">
                          “{review.comment}”
                        </p>
                      ) : (
                        <p className="wb-review-comment wb-review-comment--empty">
                          Rating submitted without a written comment.
                        </p>
                      )}

                      <div className="wb-review-meta">
                        <strong>{review.display_name}</strong>
                        <span>Approved review</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {approvedReviews.length > 0 && (
              <p className="wb-review-help">
                The selection order becomes the display order on your
                homepage. Deselect a review and select it again to move
                it to the end. Select Save Website to apply changes.
              </p>
            )}
          </section>
        </fieldset>

        <div className="wb-footer">
          <div className="wb-feedback">
            {error && (
              <p
                className="wb-error"
                role="alert"
              >
                {error}
              </p>
            )}

            {message && (
              <p
                className="wb-success"
                role="status"
              >
                {message}
              </p>
            )}

            {uploading && (
              <p
                className="wb-upload-status"
                role="status"
              >
                <span className="wb-spinner wb-spinner--small" />

                Uploading{" "}
                {uploading === "hero"
                  ? "hero banner"
                  : "About image"}
                …
              </p>
            )}
          </div>

          <button
            className="wb-save"
            disabled={
              saving ||
              Boolean(uploading)
            }
            type="submit"
          >
            {saving ? (
              <span className="wb-spinner wb-spinner--button" />
            ) : (
              <BiSave
                aria-hidden="true"
              />
            )}

            {saving
              ? "Saving…"
              : "Save Website"}
          </button>
        </div>
      </form>
    </div>
  );
}