import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authStore";
import "./ForgotPassword.css";
import brandLogo from "../../assets/images/Lensflow_brand_logo-transparent.png";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const { error: resetError } = await requestPasswordReset(cleanEmail);

      if (resetError) {
        throw resetError;
      }

      // Keep this response deliberately generic so the page does not reveal
      // whether a LensFlow account exists for the submitted email address.
      setSuccess(
        "If an account exists for this email address, a password reset link has been sent. Please check your inbox and spam folder."
      );
    } catch (err) {
      console.error("Password reset request failed:", err);

      setError(
        "We could not process the password reset request right now. Please wait a moment and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="forgot-password-page">
      <button
        type="button"
        className="forgot-password-logo"
        onClick={() => navigate("/")}
        aria-label="Go to LensFlow home"
      >
        <img
          className="forgot-password-logo-img"
          src={brandLogo}
          alt="LensFlow"
        />
      </button>

      <section className="forgot-password-card">
        <div className="forgot-password-heading">
          <p className="forgot-password-eyebrow">Account recovery</p>
          <h1>Forgot your password?</h1>
          <p>
            Enter the email address linked to your LensFlow account and we will
            send you a secure password reset link.
          </p>
        </div>

        <form className="forgot-password-form" onSubmit={handleSubmit}>
          <div className="forgot-password-field">
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
                setSuccess("");
              }}
              autoComplete="email"
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="forgot-password-message forgot-password-error" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="forgot-password-message forgot-password-success" role="status">
              {success}
            </div>
          )}

          <button
            type="submit"
            className="forgot-password-submit"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send Reset Link"}
            {!loading && <span>→</span>}
          </button>
        </form>

        <button
          type="button"
          className="forgot-password-back"
          onClick={() => navigate("/login")}
          disabled={loading}
        >
          ← Back to Sign In
        </button>
      </section>

      <p className="forgot-password-footer">
        LensFlow · Photography Business Management
      </p>
    </main>
  );
}
