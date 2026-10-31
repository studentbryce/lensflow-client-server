import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BiImage,
  BiMenu,
  BiStar,
  BiX,
} from "react-icons/bi";

import { apiGetPublicWebsite } from "../../services/publicWebsiteApi";
import {
  websiteDefaults,
  safeImageUrl,
  safeColour,
  getWebsiteFont,
} from "../../lib/website";

import "./PhotographerWebsite.css";

// A new slug gets its own menu, review expansion and loading state.
export default function PhotographerWebsite() {
  const { photographerSlug } = useParams();
  return <PhotographerWebsiteContent key={photographerSlug} photographerSlug={photographerSlug} />;
}

function PhotographerWebsiteContent({ photographerSlug }) {
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadWebsite() {
      setLoading(true);
      setError("");
      setSite(null);

      try {
        const data = await apiGetPublicWebsite(photographerSlug);
        if (!active) return;
        if (!data) return; // Unpublished or unknown photographer => existing not-found UI.
        setSite({
          ...data,
          settings: { ...websiteDefaults, ...(data.settings || {}) },
        });
      } catch (loadError) {
        console.error(
          "Public photographer website load error:",
          loadError
        );

        if (active) {
          setError(
            "This website couldn't be loaded. Please try again."
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
  }, [photographerSlug, retry]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(
        "en-NZ",
        {
          style: "currency",
          currency: "NZD",
        }
      ),
    []
  );

  if (loading) {
    return (
      <main
        className="public-site-state"
        role="status"
      >
        <span className="public-site-spinner" />

        <p>Loading website…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main
        className="public-site-state public-site-state--error"
        role="alert"
      >
        <h1>
          Unable to load website
        </h1>

        <p>{error}</p>

        <button
          type="button"
          onClick={() =>
            setRetry(
              (value) => value + 1
            )
          }
        >
          Try again
        </button>
      </main>
    );
  }

  if (!site) {
    return (
      <main className="public-site-state">
        <h1>
          Website not available
        </h1>

        <p>
          This address may have changed
          or the website has not been
          published.
        </p>
      </main>
    );
  }

  const {
    profile,
    settings,
    about,
    portfolio,
    reviews,
    allReviews,
    services,
  } = site;

  const bookingUrl =
    `/client/bookings/new?photographer=${encodeURIComponent(
      profile.photographer_id
    )}`;

  /*
   * Keep this order identical to the
   * order the sections are rendered.
   *
   * Hero
   * Portfolio
   * About
   * Services
   * Reviews
   * Contact
   */
  const navigationSections = [
    [
      "portfolio",
      "Portfolio",
      settings.show_portfolio,
    ],
    [
      "about",
      "About",
      settings.show_about,
    ],
    [
      "services",
      "Services",
      settings.show_services,
    ],
    [
      "reviews",
      "Reviews",
      settings.show_reviews,
    ],
    [
      "contact",
      "Contact",
      settings.show_contact,
    ],
  ];

  const heroImage =
    safeImageUrl(
      settings.hero_image_url
    );

  return (
    <main
      className="public-photo-site"
      style={{
        "--site-accent": safeColour(
          settings.primary_colour,
          websiteDefaults.primary_colour
        ),

        "--site-background": safeColour(
          settings.secondary_colour,
          websiteDefaults.secondary_colour
        ),

        "--site-heading-font":
          getWebsiteFont(
            settings.heading_font,
            websiteDefaults.heading_font
          ),

        "--site-body-font":
          getWebsiteFont(
            settings.body_font,
            websiteDefaults.body_font
          ),

        "--site-navigation-font":
          getWebsiteFont(
            settings.navigation_font,
            websiteDefaults.navigation_font
          ),
      }}
    >
      {/* =====================================================
          Header / Navigation
          ===================================================== */}

      <header className="public-site-header">
        <a
          className="public-site-brand"
          href="#home"
          onClick={() =>
            setMenuOpen(false)
          }
        >
          {profile.business_name}
        </a>

        <button
          type="button"
          className="public-site-menu-button"
          aria-label={
            menuOpen
              ? "Close navigation"
              : "Open navigation"
          }
          aria-expanded={menuOpen}
          onClick={() =>
            setMenuOpen(
              (current) => !current
            )
          }
        >
          {menuOpen ? (
            <BiX aria-hidden="true" />
          ) : (
            <BiMenu aria-hidden="true" />
          )}
        </button>

        <nav
          className={
            menuOpen
              ? "public-site-nav public-site-nav--open"
              : "public-site-nav"
          }
          aria-label="Website sections"
        >
          {navigationSections
            .filter(
              ([, , show]) =>
                Boolean(show)
            )
            .map(([id, label]) => (
              <a
                href={`#${id}`}
                key={id}
                onClick={() =>
                  setMenuOpen(false)
                }
              >
                {label}
              </a>
            ))}

          <Link
            className="public-site-nav-book"
            to={bookingUrl}
            onClick={() =>
              setMenuOpen(false)
            }
          >
            Book a session
          </Link>
        </nav>
      </header>

      {/* =====================================================
          Hero
          ===================================================== */}

      <section
        id="home"
        className={
          heroImage
            ? "public-site-hero public-site-hero--image"
            : "public-site-hero public-site-hero--plain"
        }
      >
        {heroImage && (
          <>
            <img
              className="public-site-hero-image"
              src={heroImage}
              alt={`${profile.business_name} photography`}
            />

            <div className="public-site-hero-overlay" />
          </>
        )}

        <div className="public-site-hero-content">
          <p className="public-site-eyebrow">
            Photography by{" "}
            {profile.business_name}
          </p>

          <h1>
            {settings.hero_title ||
              profile.business_name}
          </h1>

          {(settings.hero_description ||
            profile.description) && (
              <p className="public-site-hero-description">
                {settings.hero_description ||
                  profile.description}
              </p>
            )}

          <Link
            className="public-book-button public-book-button--hero"
            to={bookingUrl}
          >
            Book a session
            <span aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      {/* =====================================================
          Portfolio
          ===================================================== */}

      {settings.show_portfolio && (
        <section
          id="portfolio"
          className="public-site-section public-site-portfolio-section"
        >
          <div className="public-site-section-heading">
            <p className="public-site-section-eyebrow">
              Selected work
            </p>

            <h2>
              Portfolio
            </h2>

            <p>
              A collection of recent
              photography and favourite
              moments.
            </p>
          </div>

          {portfolio.length ? (
            <div className="public-portfolio-grid">
              {portfolio.map(
                (item) => {
                  const image =
                    safeImageUrl(
                      item.thumbnail_url ||
                      item.media_url
                    );

                  return (
                    <figure
                      className="public-portfolio-item"
                      key={
                        item.portfolio_id
                      }
                    >
                      <div className="public-portfolio-image-wrap">
                        {image ? (
                          <img
                            src={image}
                            alt={
                              item.title ||
                              "Portfolio photograph"
                            }
                            loading="lazy"
                          />
                        ) : (
                          <div className="public-site-image-placeholder">
                            <BiImage
                              aria-hidden="true"
                            />
                          </div>
                        )}
                      </div>


                    </figure>
                  );
                }
              )}
            </div>
          ) : (
            <div className="public-site-empty">
              <BiImage
                aria-hidden="true"
              />

              <p>
                New work will be shared
                here soon.
              </p>
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          About
          ===================================================== */}

      {settings.show_about && (
        <section
          id="about"
          className="public-site-section public-site-about-section"
        >
          {about.length ? (
            about.map((item) => {
              const aboutImage =
                safeImageUrl(
                  item.image_url
                );

              return (
                <div
                  className={
                    aboutImage
                      ? "public-site-about"
                      : "public-site-about public-site-about--text-only"
                  }
                  key={
                    item.content_id
                  }
                >
                  {aboutImage && (
                    <div className="public-site-about-image-wrap">
                      <img
                        src={aboutImage}
                        alt={
                          item.title ||
                          `About ${profile.business_name}`
                        }
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="public-site-about-content">
                    <p className="public-site-section-eyebrow">
                      The photographer
                    </p>

                    <h2>
                      {item.title ||
                        "About me"}
                    </h2>

                    {item.content && (
                      <p className="public-site-about-copy">
                        {
                          item.content
                        }
                      </p>
                    )}

                    {settings.show_contact && (
                      <a
                        className="public-site-text-link"
                        href="#contact"
                      >
                        Get in touch
                        <span aria-hidden="true">
                          →
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="public-site-about public-site-about--text-only">
              <div className="public-site-about-content">
                <p className="public-site-section-eyebrow">
                  The photographer
                </p>

                <h2>
                  About
                </h2>

                <p className="public-site-about-copy">
                  {profile.description ||
                    "Get in touch to learn more about my photography."}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          Services
          ===================================================== */}

      {settings.show_services && (
        <section
          id="services"
          className="public-site-section public-site-services-section"
        >
          <div className="public-site-section-heading">
            <p className="public-site-section-eyebrow">
              Sessions
            </p>

            <h2>
              Services
            </h2>

            <p>
              Choose the photography
              session that suits you.
            </p>
          </div>

          {services.length ? (
            <div className="public-services-grid">
              {services.map(
                (
                  service,
                  index
                ) => {
                  const serviceImage =
                    safeImageUrl(
                      service.image_url
                    );

                  return (
                    <article
                      className="public-service-card"
                      key={
                        service.service_id
                      }
                    >
                      <div className="public-service-image-wrap">
                        {serviceImage ? (
                          <img
                            src={
                              serviceImage
                            }
                            alt={`${service.name} photography service`}
                            loading="lazy"
                          />
                        ) : (
                          <div className="public-service-image-placeholder">
                            <BiImage
                              aria-hidden="true"
                            />
                          </div>
                        )}

                        <span className="public-service-number public-service-number--image">
                          {String(
                            index + 1
                          ).padStart(
                            2,
                            "0"
                          )}
                        </span>
                      </div>

                      <div className="public-service-content">
                        <h3>
                          {service.name}
                        </h3>

                        {service.description && (
                          <p className="public-service-description">
                            {
                              service.description
                            }
                          </p>
                        )}

                        <div className="public-service-meta">
                          <span>
                            {
                              service.duration_minutes
                            }{" "}
                            minutes
                          </span>

                          <strong>
                            {currencyFormatter.format(
                              Number(
                                service.price
                              )
                            )}
                          </strong>
                        </div>

                        <Link
                          className="public-service-book-link"
                          to={`${bookingUrl}&service=${encodeURIComponent(
                            service.service_id
                          )}`}
                        >
                          Book this session

                          <span aria-hidden="true">
                            →
                          </span>
                        </Link>
                      </div>
                    </article>
                  );
                }
              )}
            </div>
          ) : (
            <div className="public-site-empty">
              <p>
                Please contact the
                photographer to arrange
                a session.
              </p>
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          Reviews
          ===================================================== */}

      {settings.show_reviews && (
        <section
          id="reviews"
          className="public-site-section public-site-reviews-section"
        >
          <div className="public-site-section-heading">
            <p className="public-site-section-eyebrow">
              Client stories
            </p>

            <h2>
              Kind words
            </h2>

            <p>
              A few words from people
              I've had the pleasure of
              photographing.
            </p>
          </div>

          {reviews.length ? (
            <>
              <div className="public-reviews-grid"
                style={{
                  "--review-columns": Math.min(
                    showAllReviews ? allReviews.length : reviews.length,
                    3
                  ),
                }}>
                {(showAllReviews ? allReviews : reviews).map(
                  (review) => (
                    <blockquote
                      className="public-review-card"
                      key={
                        review.review_id
                      }
                    >
                      <div
                        className="public-review-stars"
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        {Array.from(
                          {
                            length:
                              review.rating,
                          },
                          (_, index) => (
                            <BiStar
                              key={index}
                              aria-hidden="true"
                            />
                          )
                        )}
                      </div>

                      <p>
                        “
                        {review.comment ||
                          "A wonderful photography experience."}
                        ”
                      </p>

                      <cite>
                        {review.display_name || "Photography client"}
                      </cite>
                    </blockquote>
                  )
                )}
              </div>

              {allReviews.length > reviews.length && (
                <div className="public-reviews-actions">
                  <button
                    type="button"
                    className="public-reviews-toggle"
                    onClick={() => setShowAllReviews((current) => !current)}
                  >
                    {showAllReviews ? "Show featured reviews" : "Read all reviews"}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="public-site-empty">
              <p>
                Client reviews will
                appear here soon.
              </p>
            </div>
          )}
        </section>
      )}

      {/* =====================================================
          Contact
          ===================================================== */}

      {settings.show_contact && (
        <section
          id="contact"
          className="public-site-contact"
        >
          <div className="public-site-contact-inner">
            <p className="public-site-section-eyebrow">
              Let's work together
            </p>

            <h2>
              Let's create something
              together.
            </h2>

            <p className="public-site-contact-copy">
              Have a session in mind?
              Get in touch or book
              directly through LensFlow.
            </p>

            <div className="public-site-contact-actions">
              <Link
                className="public-book-button"
                to={bookingUrl}
              >
                Book a session
                <span aria-hidden="true">
                  →
                </span>
              </Link>

              <a
                className="public-contact-email"
                href={`mailto:${profile.email}`}
              >
                {profile.email}
              </a>
            </div>

            {profile.phone && (
              <a
                className="public-contact-phone"
                href={`tel:${profile.phone}`}
              >
                {profile.phone}
              </a>
            )}
          </div>
        </section>
      )}

      {/* =====================================================
          Footer
          ===================================================== */}

      <footer className="public-site-footer">
        <a href="#home">
          {profile.business_name}
        </a>

        <p>
          Photography · Powered by
          LensFlow
        </p>
      </footer>
    </main>
  );
}