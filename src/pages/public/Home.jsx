import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authStore";
import "./Home.css";
import brandLogo from "../../assets/images/Lensflow_brand_logo-transparent.png";

export default function Home() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  /*
   * If a user is already authenticated, send them
   * directly to the appropriate dashboard.
   */
  useEffect(() => {
    if (!user || !profile?.role) {
      return;
    }

    if (profile.role === "photographer") {
      navigate("/photographer", { replace: true });
    }

    if (profile.role === "client") {
      navigate("/client", { replace: true });
    }
  }, [user, profile, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  /*
   * While authentication/profile information is being
   * resolved, avoid displaying the public landing page
   * momentarily to an already authenticated user.
   */
  if (user) {
    return (
      <div className="home-loading">
        <div className="home-loading-mark">
          LF
        </div>

        <p>Loading LensFlow...</p>

        <button
          type="button"
          className="home-loading-logout"
          onClick={handleLogout}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <main className="home-page">

      {/* =====================================================
          Navigation
      ===================================================== */}

      <nav className="home-nav">

        <button
          type="button"
          className="home-logo"
          onClick={() => navigate("/")}
        >
          <span >
            <img className="home-logo-img" src={brandLogo} alt="LensFlow" />
          </span>
          
        </button>

        <button
          type="button"
          className="home-login-link"
          onClick={() => navigate("/login")}
        >
          Sign In
        </button>

      </nav>

      {/* =====================================================
          Hero
      ===================================================== */}

      <section className="home-hero">

        <div className="home-hero-content">

          <p className="home-eyebrow">
            Photography Business Management
          </p>

          <h1>
            Your photography
            <br />
            business, <em>beautifully</em>
            <br />
            organised.
          </h1>

          <p className="home-hero-description">
            LensFlow brings your clients, bookings,
            invoices and photography galleries together
            in one simple workspace.
          </p>

          <div className="home-hero-actions">

            <button
              type="button"
              className="home-primary-button"
              onClick={() => navigate("/signup/photographer")}
            >
              Create Photographer Account
              <span>→</span>
            </button>

            <button
              type="button"
              className="home-secondary-button"
              onClick={() => navigate("/signup")}
            >
              Client Sign Up
            </button>

          </div>

        </div>

        {/* =================================================
            Product Preview
        ================================================= */}

        <div className="home-preview">

          <div className="preview-window">

            <div className="preview-topbar">

              <div className="preview-brand">
                LensFlow
              </div>

              <div className="preview-dots">
                <span />
                <span />
                <span />
              </div>

            </div>

            <div className="preview-content">

              <div className="preview-sidebar">

                <div className="preview-sidebar-logo">
                  LF
                </div>

                <div className="preview-nav-item active">
                  Dashboard
                </div>

                <div className="preview-nav-item">
                  Bookings
                </div>

                <div className="preview-nav-item">
                  Clients
                </div>

                <div className="preview-nav-item">
                  Invoices
                </div>

                <div className="preview-nav-item">
                  Galleries
                </div>

              </div>

              <div className="preview-dashboard">

                <div className="preview-heading">
                  <span>Good morning</span>
                  <strong>
                    Your business at a glance.
                  </strong>
                </div>

                <div className="preview-stats">

                  <div className="preview-stat">
                    <span>Bookings</span>
                    <strong>12</strong>
                  </div>

                  <div className="preview-stat">
                    <span>Clients</span>
                    <strong>28</strong>
                  </div>

                  <div className="preview-stat">
                    <span>Upcoming</span>
                    <strong>5</strong>
                  </div>

                </div>

                <div className="preview-bookings">

                  <div className="preview-section-title">
                    Upcoming bookings
                  </div>

                  <div className="preview-booking">
                    <span className="preview-date">
                      14
                    </span>

                    <div>
                      <strong>
                        Wedding Photography
                      </strong>

                      <small>
                        Sarah & James
                      </small>
                    </div>

                    <span className="preview-status">
                      Confirmed
                    </span>
                  </div>

                  <div className="preview-booking">
                    <span className="preview-date">
                      21
                    </span>

                    <div>
                      <strong>
                        Family Portrait
                      </strong>

                      <small>
                        The Wilson Family
                      </small>
                    </div>

                    <span className="preview-status">
                      Confirmed
                    </span>
                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =====================================================
          Features
      ===================================================== */}

      <section className="home-features">

        <div className="home-section-heading">

          <p className="home-eyebrow">
            Everything in one place
          </p>

          <h2>
            Spend less time
            <br />
            managing your business.
          </h2>

        </div>

        <div className="home-feature-grid">

          <article className="home-feature">

            <span className="feature-number">
              01
            </span>

            <h3>
              Bookings
            </h3>

            <p>
              Keep track of upcoming photography
              sessions, dates, services and booking
              details from one place.
            </p>

          </article>

          <article className="home-feature">

            <span className="feature-number">
              02
            </span>

            <h3>
              Clients
            </h3>

            <p>
              Maintain client information and view
              their complete booking history without
              searching through separate systems.
            </p>

          </article>

          <article className="home-feature">

            <span className="feature-number">
              03
            </span>

            <h3>
              Invoices
            </h3>

            <p>
              Manage photography invoices and keep
              track of amounts associated with each
              client and booking.
            </p>

          </article>

          <article className="home-feature">

            <span className="feature-number">
              04
            </span>

            <h3>
              Galleries
            </h3>

            <p>
              Organise photography galleries and
              provide clients with a simple way to
              access their finished work.
            </p>

          </article>

        </div>

      </section>

      {/* =====================================================
          Footer
      ===================================================== */}

      <footer className="home-footer">

        <div className="home-footer-brand">
          LensFlow
        </div>

        <p>
          Photography business management,
          thoughtfully designed.
        </p>

        <button
          type="button"
          onClick={() => navigate("/login")}
        >
          Sign In
        </button>

      </footer>

    </main>
  );
}