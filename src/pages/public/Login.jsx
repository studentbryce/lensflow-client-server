import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/authStore";
import "./Login.css";
import brandLogo from "../../assets/images/Lensflow_brand_logo-transparent.png";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordResetComplete = Boolean(location.state?.passwordReset);

  const from =
    location.state?.from?.pathname
      ? `${location.state.from.pathname}${location.state.from.search || ""}`
      : "/";

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) throw signInError;

      navigate(from, {
        replace: true,
      });
    } catch (err) {
      console.error(err);

      setError(
        err.message ||
        "Unable to sign in. Please check your details."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">

      {/* =====================================================
          Brand
      ===================================================== */}

      <button
        type="button"
        className="login-logo"
        onClick={() => navigate("/")}
      >
        <span >
          <img className="login-logo-img" src={brandLogo} alt="LensFlow" />
        </span>

      </button>

      {/* =====================================================
          Login Card
      ===================================================== */}

      <section className="login-card">

        <div className="login-heading">

          <p className="login-eyebrow">
            Welcome back
          </p>

          <h1>
            Sign in to LensFlow
          </h1>

          <p>
            Manage your photography business
            from one place.
          </p>

        </div>

        <form
          className="login-form"
          onSubmit={handleSubmit}
        >

          {/* Email */}

          <div className="login-field">

            <label htmlFor="email">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              placeholder="you@example.com"
              required
            />

          </div>

          {/* Password */}

          <div className="login-field">

            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />

          </div>

          {/* Error */}

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <div className="login-password-help">
            <Link to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          {passwordResetComplete && !error && (
            <div className="login-success" role="status">
              Your password has been updated. Sign in with your new password.
            </div>
          )}

          {/* Submit */}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading
              ? "Signing in..."
              : "Sign In"}

            {!loading && <span>→</span>}
          </button>

        </form>
        <div className="login-account-links">
          <p>
            New photographer? <Link to="/signup/photographer">Create a photographer account</Link>
          </p>
          <p>
            Photography client? <Link to="/signup" state={location.state}>Create a client account</Link>
          </p>
        </div>

        <button
          type="button"
          className="login-back"
          onClick={() => navigate("/")}
        >
          ← Back to LensFlow
        </button>

      </section>

      <p className="login-footer">
        LensFlow · Photography Business Management
      </p>

    </main>
  );
}
