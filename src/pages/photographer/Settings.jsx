import {
  useEffect,
  useState,
} from "react";

import {
  BiBell,
  BiBuilding,
  BiCalendar,
  BiCheckCircle,
  BiCreditCard,
  BiGlobe,
  BiLockAlt,
  BiLogOut,
  BiRefresh,
  BiReceipt,
  BiSave,
  BiShield,
  BiUser,
} from "react-icons/bi";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import {
  apiGetPhotographerSettings,
  apiSavePhotographerAccount,
  apiSavePhotographerBusiness,
  apiSavePhotographerTax,
  apiSavePhotographerBank,
} from "../../services/photographerSettingsApi";

import "./Settings.css";


const SETTINGS_SECTIONS = [
  {
    id: "account",
    label: "Account",
    icon: BiUser,
  },
  {
    id: "business",
    label: "Business Profile",
    icon: BiBuilding,
  },
  {
    id: "tax",
    label: "Tax & GST",
    icon: BiReceipt,
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: BiBell,
  },
  {
    id: "payments",
    label: "Payments",
    icon: BiCreditCard,
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: BiCalendar,
  },
  {
    id: "security",
    label: "Security",
    icon: BiShield,
  },
  {
    id: "website",
    label: "Website",
    icon: BiGlobe,
  },
];


export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    signOut,
  } = useAuth();


  /* =========================================================
     Page state
     ========================================================= */

  const [activeSection, setActiveSection] =
    useState(() => {
      const requestedSection =
        searchParams.get("tab");

      return SETTINGS_SECTIONS.some(
        (section) =>
          section.id === requestedSection
      )
        ? requestedSection
        : "account";
    });

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");


  /* =========================================================
     Account state
     ========================================================= */

  const [accountForm, setAccountForm] =
    useState({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
    });

  const [originalEmail, setOriginalEmail] =
    useState("");

  const [savingAccount, setSavingAccount] =
    useState(false);

  const [accountMessage, setAccountMessage] =
    useState("");

  const [accountError, setAccountError] =
    useState("");


  /* =========================================================
     Photographer / business state
     ========================================================= */

  const [businessForm, setBusinessForm] =
    useState({
      business_name: "",
      email: "",
      phone: "",
      address: "",
      website_url: "",
      description: "",
    });

  const [savingBusiness, setSavingBusiness] =
    useState(false);

  const [businessMessage, setBusinessMessage] =
    useState("");

  const [businessError, setBusinessError] =
    useState("");


  /* =========================================================
     Tax state
     ========================================================= */

  const [taxForm, setTaxForm] =
    useState({
      gst_tax_number: "",
      default_tax_rate: "15",
    });

  const [savingTax, setSavingTax] =
    useState(false);

  const [taxMessage, setTaxMessage] =
    useState("");

  const [taxError, setTaxError] =
    useState("");


  /* =========================================================
     Payment details state
     ========================================================= */

  const [paymentForm, setPaymentForm] =
    useState({
      bank_account_name: "",
      bank_name: "",
      bank_account_number: "",
      bank_payment_instructions: "",
    });

  const [savingPayments, setSavingPayments] =
    useState(false);

  const [paymentMessage, setPaymentMessage] =
    useState("");

  const [paymentError, setPaymentError] =
    useState("");


  /* =========================================================
     Stripe Connect state
     ========================================================= */

  const [stripeAccount, setStripeAccount] =
    useState(null);

  const [connectingStripe, setConnectingStripe] =
    useState(false);

  const [startingStripeOnboarding, setStartingStripeOnboarding] =
    useState(false);

  const [syncingStripeStatus, setSyncingStripeStatus] =
    useState(false);

  const [stripeMessage, setStripeMessage] =
    useState("");

  const [stripeError, setStripeError] =
    useState("");


  /* =========================================================
     Calendar state
     ========================================================= */

  const [calendarIntegration, setCalendarIntegration] =
    useState(null);


  /* =========================================================
     Security state
     ========================================================= */

  const [passwordForm, setPasswordForm] =
    useState({
      password: "",
      confirmPassword: "",
    });

  const [savingPassword, setSavingPassword] =
    useState(false);

  const [securityMessage, setSecurityMessage] =
    useState("");

  const [securityError, setSecurityError] =
    useState("");


  /* =========================================================
     Load settings
     ========================================================= */

  async function loadSettings() {
    try {
      setLoading(true);
      setLoadError("");
      const { profile, business, payment, stripe, calendar } = await apiGetPhotographerSettings();
      const authEmail = profile.email || "";
      setAccountForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        email: authEmail,
        phone: profile.phone || "",
      });
      setOriginalEmail(authEmail);
      setBusinessForm({
        business_name: business.business_name || "",
        email: business.email || "",
        phone: business.phone || "",
        address: business.address || "",
        website_url: business.website_url || "",
        description: business.description || "",
      });
      setTaxForm({
        gst_tax_number: payment?.gst_tax_number || "",
        default_tax_rate: String(payment?.default_tax_rate ?? 15),
      });
      setPaymentForm({
        bank_account_name: payment?.bank_account_name || "",
        bank_name: payment?.bank_name || "",
        bank_account_number: payment?.bank_account_number || "",
        bank_payment_instructions: payment?.bank_payment_instructions || "",
      });
      setStripeAccount(stripe || null);
      setCalendarIntegration(calendar || null);
    } catch (error) {
      console.error("Unable to load photographer settings:", error);
      setLoadError(error.message || "Unable to load your settings.");
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadSettings();
  }, []);


  /* =========================================================
     Settings URL / Stripe return handling
     ========================================================= */

  useEffect(() => {
    // Wait until the normal Settings data has loaded before
    // performing a Stripe return sync. This prevents the initial
    // database read from overwriting freshly synchronised status.
    if (loading) {
      return;
    }

    const requestedSection =
      searchParams.get("tab");

    const isValidSection =
      SETTINGS_SECTIONS.some(
        (section) =>
          section.id === requestedSection
      );

    if (isValidSection) {
      setActiveSection(requestedSection);
    }

    const stripeReturn =
      searchParams.get("stripe");

    if (stripeReturn === "return") {
      setActiveSection("payments");
      setStripeError("");
      setStripeMessage(
        "You have returned from Stripe successfully. Checking your Stripe account status..."
      );

      // Synchronise the authoritative account state from Stripe.
      handleSyncStripeStatus({
        returningFromStripe: true,
      });

      // Remove one-time return parameters so refreshing the
      // Settings page does not repeat the return action.
      navigate(
        "/photographer/settings",
        { replace: true }
      );

    } else if (stripeReturn === "refresh") {
      setActiveSection("payments");
      setStripeMessage("");
      setStripeError(
        "Your Stripe setup link expired or could not be reused. Select Continue Stripe Setup to create a new secure onboarding link."
      );

      navigate(
        "/photographer/settings",
        { replace: true }
      );
    }
  }, [loading, navigate, searchParams]);


  /* =========================================================
     Account handlers
     ========================================================= */

  function handleAccountChange(event) {
    const {
      name,
      value,
    } = event.target;

    setAccountForm(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

    setAccountMessage("");
    setAccountError("");
  }


  async function handleSaveAccount(event) {
    event.preventDefault();
    const firstName = accountForm.first_name.trim();
    const lastName = accountForm.last_name.trim();
    const email = accountForm.email.trim().toLowerCase();
    const phone = accountForm.phone.trim();
    if (!firstName || !lastName) { setAccountError("First name and last name are required."); return; }
    if (!email) { setAccountError("Email address is required."); return; }
    try {
      setSavingAccount(true);
      setAccountMessage(""); setAccountError("");
      // Profile fields now go through Express. Auth email remains managed by Supabase Auth.
      await apiSavePhotographerAccount({ first_name: firstName, last_name: lastName, phone });
      if (email !== originalEmail.toLowerCase()) {
        const { data, error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        if (data?.user?.email?.toLowerCase() === email) {
          await apiSavePhotographerAccount({ first_name: firstName, last_name: lastName, phone, email });
          setOriginalEmail(email);
          setAccountMessage("Account details updated successfully.");
        } else {
          setAccountMessage("Your account details were saved. Check your email to confirm the new email address.");
        }
      } else {
        setAccountMessage("Account details updated successfully.");
      }
      setAccountForm(current => ({ ...current, first_name: firstName, last_name: lastName, email, phone }));
    } catch (error) {
      console.error("Unable to update account settings:", error);
      setAccountError(error.message || "Your account could not be updated.");
    } finally { setSavingAccount(false); }
  }


  /* =========================================================
     Business handlers
     ========================================================= */

  function handleBusinessChange(event) {
    const {
      name,
      value,
    } = event.target;

    setBusinessForm(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

    setBusinessMessage("");
    setBusinessError("");
  }


  async function handleSaveBusiness(event) {
    event.preventDefault();
    const payload = {
      business_name: businessForm.business_name.trim(),
      email: businessForm.email.trim().toLowerCase(),
      phone: businessForm.phone.trim(),
      address: businessForm.address.trim(),
      website_url: businessForm.website_url.trim(),
      description: businessForm.description.trim(),
    };
    if (!payload.business_name || !payload.email) {
      setBusinessError("Business name and email are required."); return;
    }
    if (payload.website_url) {
      try { const url = new URL(payload.website_url); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
      catch { setBusinessError("Website URL must be a valid http:// or https:// address."); return; }
    }
    try {
      setSavingBusiness(true); setBusinessMessage(""); setBusinessError("");
      await apiSavePhotographerBusiness(payload);
      setBusinessForm(payload);
      setBusinessMessage("Business profile updated successfully.");
    } catch (error) {
      console.error("Unable to update business profile:", error);
      setBusinessError(error.message || "Your business profile could not be updated.");
    } finally { setSavingBusiness(false); }
  }


  /* =========================================================
     Tax handlers
     ========================================================= */

  function handleTaxChange(event) {
    const {
      name,
      value,
    } = event.target;

    setTaxForm(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

    setTaxMessage("");
    setTaxError("");
  }


  async function handleSaveTax(event) {
    event.preventDefault();
    const gstTaxNumber = taxForm.gst_tax_number.trim();
    const defaultTaxRate = Number(taxForm.default_tax_rate);
    if (taxForm.default_tax_rate === "" || !Number.isFinite(defaultTaxRate) || defaultTaxRate < 0 || defaultTaxRate > 100) {
      setTaxError("The default tax rate must be between 0% and 100%."); return;
    }
    try {
      setSavingTax(true); setTaxMessage(""); setTaxError("");
      await apiSavePhotographerTax({ gst_tax_number: gstTaxNumber, default_tax_rate: defaultTaxRate });
      setTaxForm({ gst_tax_number: gstTaxNumber, default_tax_rate: String(Number(defaultTaxRate.toFixed(2))) });
      setTaxMessage("Tax settings updated successfully.");
    } catch (error) {
      console.error("Unable to update tax settings:", error);
      setTaxError(error.message || "Your tax settings could not be updated.");
    } finally { setSavingTax(false); }
  }


  /* =========================================================
     Payment details handlers
     ========================================================= */

  function handlePaymentChange(event) {
    const {
      name,
      value,
    } = event.target;

    setPaymentForm(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

    setPaymentMessage("");
    setPaymentError("");
  }


  async function handleSavePayments(event) {
    event.preventDefault();
    const paymentDetails = {
      bank_account_name: paymentForm.bank_account_name.trim(),
      bank_name: paymentForm.bank_name.trim(),
      bank_account_number: paymentForm.bank_account_number.trim(),
      bank_payment_instructions: paymentForm.bank_payment_instructions.trim(),
    };
    const hasPaymentDetails = Object.values(paymentDetails).some(Boolean);
    if (hasPaymentDetails && (!paymentDetails.bank_account_name || !paymentDetails.bank_account_number)) {
      setPaymentError("Enter both an account name and account number, or leave all bank fields blank."); return;
    }
    try {
      setSavingPayments(true); setPaymentMessage(""); setPaymentError("");
      await apiSavePhotographerBank(paymentDetails);
      setPaymentForm(paymentDetails);
      setPaymentMessage(hasPaymentDetails ? "Bank account details updated successfully." : "Bank account details removed successfully.");
    } catch (error) {
      console.error("Unable to update bank account details:", error);
      setPaymentError(error.message || "Your bank account details could not be updated.");
    } finally { setSavingPayments(false); }
  }


  /* =========================================================
     Stripe Connect handlers
     ========================================================= */

  async function handleConnectStripe() {
    try {
      setConnectingStripe(true);
      setStripeMessage("");
      setStripeError("");

      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "create-stripe-account",
        {
          method: "POST",
        }
      );

      if (error) {
        let message =
          error.message ||
          "Unable to connect Stripe.";

        try {
          if (error.context) {
            const errorBody =
              await error.context.json();

            message =
              errorBody?.stripe_error ||
              errorBody?.error ||
              message;
          }
        } catch {
          // Keep the original Supabase function error message.
        }

        throw new Error(message);
      }

      if (!data?.stripe_account_id) {
        throw new Error(
          "Stripe did not return a connected account ID."
        );
      }

      setStripeAccount({
        stripe_account_id:
          data.stripe_account_id,
        charges_enabled:
          Boolean(data.charges_enabled),
        payouts_enabled:
          Boolean(data.payouts_enabled),
        details_submitted:
          Boolean(data.details_submitted),
      });

      setStripeMessage(
        data.already_exists
          ? "Your existing Stripe account was found successfully."
          : "Your Stripe connected account was created successfully."
      );

    } catch (error) {
      console.error(
        "Unable to create Stripe connected account:",
        error
      );

      setStripeError(
        error.message ||
        "Your Stripe account could not be created."
      );

    } finally {
      setConnectingStripe(false);
    }
  }


  async function handleSyncStripeStatus({
    returningFromStripe = false,
  } = {}) {
    try {
      setSyncingStripeStatus(true);
      setStripeError("");

      if (!returningFromStripe) {
        setStripeMessage(
          "Checking your Stripe account status..."
        );
      }

      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "sync-stripe-account-status",
        {
          method: "POST",
        }
      );

      if (error) {
        let message =
          error.message ||
          "Unable to synchronise Stripe account status.";

        try {
          if (error.context) {
            const errorBody =
              await error.context.json();

            message =
              errorBody?.stripe_error ||
              errorBody?.error ||
              message;
          }
        } catch {
          // Keep the original Supabase function error message.
        }

        throw new Error(message);
      }

      if (
        typeof data?.charges_enabled !== "boolean" ||
        typeof data?.payouts_enabled !== "boolean" ||
        typeof data?.details_submitted !== "boolean"
      ) {
        throw new Error(
          "Stripe returned an unexpected account status."
        );
      }

      setStripeAccount((currentAccount) => ({
        ...currentAccount,
        stripe_account_id:
          data.stripe_account_id ||
          currentAccount?.stripe_account_id ||
          "",
        charges_enabled:
          data.charges_enabled,
        payouts_enabled:
          data.payouts_enabled,
        details_submitted:
          data.details_submitted,
      }));

      if (
        data.charges_enabled &&
        data.payouts_enabled &&
        data.details_submitted
      ) {
        setStripeMessage(
          "Stripe status updated successfully. Card payments and payouts are enabled."
        );
      } else if (data.details_submitted) {
        setStripeMessage(
          "Stripe details have been submitted. Stripe is still reviewing or activating one or more payment features."
        );
      } else {
        setStripeMessage(
          "Stripe status updated. Additional onboarding information is still required."
        );
      }

    } catch (error) {
      console.error(
        "Unable to synchronise Stripe account status:",
        error
      );

      setStripeMessage("");
      setStripeError(
        error.message ||
        "Your Stripe account status could not be synchronised."
      );

    } finally {
      setSyncingStripeStatus(false);
    }
  }


  async function handleStartStripeOnboarding() {
    if (!stripeAccount?.stripe_account_id) {
      setStripeError(
        "Create your Stripe connected account before starting onboarding."
      );
      return;
    }

    try {
      setStartingStripeOnboarding(true);
      setStripeMessage("");
      setStripeError("");

      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "create-stripe-onboarding-link",
        {
          method: "POST",
        }
      );

      if (error) {
        let message =
          error.message ||
          "Unable to start Stripe onboarding.";

        try {
          if (error.context) {
            const errorBody =
              await error.context.json();

            message =
              errorBody?.stripe_error ||
              errorBody?.error ||
              message;
          }
        } catch {
          // Keep the original Supabase function error message.
        }

        throw new Error(message);
      }

      if (!data?.url) {
        throw new Error(
          "Stripe did not return an onboarding URL."
        );
      }

      // Stripe Account Links are temporary and single-use.
      // Redirect immediately rather than storing the URL.
      window.location.assign(data.url);

    } catch (error) {
      console.error(
        "Unable to start Stripe onboarding:",
        error
      );

      setStripeError(
        error.message ||
        "Stripe onboarding could not be started."
      );

      setStartingStripeOnboarding(false);
    }
  }


  /* =========================================================
     Security handlers
     ========================================================= */

  function handlePasswordChange(event) {
    const {
      name,
      value,
    } = event.target;

    setPasswordForm(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

    setSecurityMessage("");
    setSecurityError("");
  }


  async function handleUpdatePassword(event) {
    event.preventDefault();

    if (
      passwordForm.password.length < 8
    ) {
      setSecurityError(
        "Your new password must contain at least 8 characters."
      );

      return;
    }


    if (
      passwordForm.password !==
      passwordForm.confirmPassword
    ) {
      setSecurityError(
        "The passwords do not match."
      );

      return;
    }


    try {
      setSavingPassword(true);

      setSecurityMessage("");
      setSecurityError("");


      const {
        error: passwordError,
      } = await supabase.auth.updateUser({
        password:
          passwordForm.password,
      });


      if (passwordError) {
        throw passwordError;
      }


      setPasswordForm({
        password: "",
        confirmPassword: "",
      });


      setSecurityMessage(
        "Your password has been updated successfully."
      );

    } catch (error) {
      console.error(
        "Unable to update password:",
        error
      );

      setSecurityError(
        error.message ||
        "Your password could not be updated."
      );

    } finally {
      setSavingPassword(false);
    }
  }


  async function handleSignOut() {
    try {
      if (signOut) {
        await signOut();
      } else {
        await supabase.auth.signOut();
      }

      navigate(
        "/login",
        {
          replace: true,
        }
      );

    } catch (error) {
      console.error(
        "Unable to sign out:",
        error
      );

      setSecurityError(
        error.message ||
        "Unable to sign out."
      );
    }
  }


  /* =========================================================
     Helpers
     ========================================================= */

  function formatCalendarDate(value) {
    if (!value) {
      return "Not available";
    }

    return new Date(value).toLocaleString(
      "en-NZ",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  }


  function renderStatusMessage(
    message,
    error
  ) {
    if (error) {
      return (
        <div className="settings-status settings-status--error">
          {error}
        </div>
      );
    }

    if (message) {
      return (
        <div className="settings-status settings-status--success">
          <BiCheckCircle
            aria-hidden="true"
          />

          <span>
            {message}
          </span>
        </div>
      );
    }

    return null;
  }


  /* =========================================================
     Loading state
     ========================================================= */

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <span className="settings-spinner" />

          <p>
            Loading settings...
          </p>
        </div>
      </div>
    );
  }


  /* =========================================================
     Load error
     ========================================================= */

  if (loadError) {
    return (
      <div className="settings-page">
        <div className="settings-load-error">
          <BiShield
            aria-hidden="true"
          />

          <h2>
            Unable to load settings
          </h2>

          <p>
            {loadError}
          </p>

          <button
            type="button"
            onClick={
              loadSettings
            }
          >
            <BiRefresh
              aria-hidden="true"
            />

            Try again
          </button>
        </div>
      </div>
    );
  }


  /* =========================================================
     Section content
     ========================================================= */

  function renderAccountSection() {
    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Personal details
            </span>

            <h2>
              Account
            </h2>

            <p>
              Manage the personal information associated
              with your LensFlow account.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiUser
              aria-hidden="true"
            />
          </div>
        </div>


        <form
          className="settings-form"
          onSubmit={
            handleSaveAccount
          }
        >
          <div className="settings-form-grid">

            <div className="settings-field">
              <label htmlFor="settings-first-name">
                First name
              </label>

              <input
                id="settings-first-name"
                name="first_name"
                type="text"
                autoComplete="given-name"
                value={
                  accountForm.first_name
                }
                onChange={
                  handleAccountChange
                }
                required
              />
            </div>


            <div className="settings-field">
              <label htmlFor="settings-last-name">
                Last name
              </label>

              <input
                id="settings-last-name"
                name="last_name"
                type="text"
                autoComplete="family-name"
                value={
                  accountForm.last_name
                }
                onChange={
                  handleAccountChange
                }
                required
              />
            </div>


            <div className="settings-field settings-field--full">
              <label htmlFor="settings-account-email">
                Account email
              </label>

              <input
                id="settings-account-email"
                name="email"
                type="email"
                autoComplete="email"
                value={
                  accountForm.email
                }
                onChange={
                  handleAccountChange
                }
                required
              />

              <span className="settings-field-help">
                Changing your login email may require
                confirmation through Supabase Auth.
              </span>
            </div>


            <div className="settings-field settings-field--full">
              <label htmlFor="settings-account-phone">
                Phone
              </label>

              <input
                id="settings-account-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={
                  accountForm.phone
                }
                onChange={
                  handleAccountChange
                }
                placeholder="Optional"
              />
            </div>

          </div>


          {renderStatusMessage(
            accountMessage,
            accountError
          )}


          <div className="settings-form-actions">
            <button
              type="submit"
              className="settings-primary-button"
              disabled={
                savingAccount
              }
            >
              <BiSave
                aria-hidden="true"
              />

              {savingAccount
                ? "Saving..."
                : "Save Account"}
            </button>
          </div>
        </form>
      </>
    );
  }


  function renderBusinessSection() {
    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Business details
            </span>

            <h2>
              Business Profile
            </h2>

            <p>
              Manage the core contact and business
              information used throughout LensFlow.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiBuilding
              aria-hidden="true"
            />
          </div>
        </div>


        <form
          className="settings-form"
          onSubmit={
            handleSaveBusiness
          }
        >
          <div className="settings-form-grid">

            <div className="settings-field settings-field--full">
              <label htmlFor="settings-business-name">
                Business name
              </label>

              <input
                id="settings-business-name"
                name="business_name"
                type="text"
                value={
                  businessForm.business_name
                }
                onChange={
                  handleBusinessChange
                }
                required
              />
            </div>


            <div className="settings-field">
              <label htmlFor="settings-business-email">
                Business email
              </label>

              <input
                id="settings-business-email"
                name="email"
                type="email"
                value={
                  businessForm.email
                }
                onChange={
                  handleBusinessChange
                }
                required
              />
            </div>


            <div className="settings-field">
              <label htmlFor="settings-business-phone">
                Business phone
              </label>

              <input
                id="settings-business-phone"
                name="phone"
                type="tel"
                value={
                  businessForm.phone
                }
                onChange={
                  handleBusinessChange
                }
                placeholder="Optional"
              />
            </div>


            <div className="settings-field settings-field--full">
              <label htmlFor="settings-business-address">
                Address
              </label>

              <textarea
                id="settings-business-address"
                name="address"
                rows="3"
                value={
                  businessForm.address
                }
                onChange={
                  handleBusinessChange
                }
                placeholder="Business address"
              />
            </div>


            <div className="settings-field settings-field--full">
              <label htmlFor="settings-business-website">
                Website URL
              </label>

              <input
                id="settings-business-website"
                name="website_url"
                type="url"
                value={
                  businessForm.website_url
                }
                onChange={
                  handleBusinessChange
                }
                placeholder="https://example.com"
              />
            </div>


            <div className="settings-field settings-field--full">
              <label htmlFor="settings-business-description">
                Business description
              </label>

              <textarea
                id="settings-business-description"
                name="description"
                rows="6"
                value={
                  businessForm.description
                }
                onChange={
                  handleBusinessChange
                }
                placeholder="Tell clients about your photography business..."
              />
            </div>

          </div>


          {renderStatusMessage(
            businessMessage,
            businessError
          )}


          <div className="settings-form-actions">
            <button
              type="submit"
              className="settings-primary-button"
              disabled={
                savingBusiness
              }
            >
              <BiSave
                aria-hidden="true"
              />

              {savingBusiness
                ? "Saving..."
                : "Save Business Profile"}
            </button>
          </div>
        </form>
      </>
    );
  }


  function renderTaxSection() {
    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Invoice defaults
            </span>

            <h2>
              Tax &amp; GST
            </h2>

            <p>
              Set the tax registration number shown on
              invoices and the default tax rate used for
              new invoices.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiReceipt aria-hidden="true" />
          </div>
        </div>

        <form
          className="settings-form"
          onSubmit={handleSaveTax}
        >
          <div className="settings-form-grid">
            <div className="settings-field settings-field--full">
              <label htmlFor="settings-gst-tax-number">
                GST / Tax number
              </label>

              <input
                id="settings-gst-tax-number"
                name="gst_tax_number"
                type="text"
                value={taxForm.gst_tax_number}
                onChange={handleTaxChange}
                maxLength="100"
                placeholder="For example, 123-456-789"
              />

              <span className="settings-field-help">
                This number is copied onto each new invoice.
                Leave it blank if your business is not tax
                registered.
              </span>
            </div>

            <div className="settings-field">
              <label htmlFor="settings-default-tax-rate">
                Default tax rate (%)
              </label>

              <input
                id="settings-default-tax-rate"
                name="default_tax_rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxForm.default_tax_rate}
                onChange={handleTaxChange}
                required
              />

              <span className="settings-field-help">
                New invoices will start with this rate. You
                can still change it on an individual invoice.
              </span>
            </div>
          </div>

          {renderStatusMessage(
            taxMessage,
            taxError
          )}

          <div className="settings-form-actions">
            <button
              type="submit"
              className="settings-primary-button"
              disabled={savingTax}
            >
              <BiSave aria-hidden="true" />

              {savingTax
                ? "Saving..."
                : "Save Tax Settings"}
            </button>
          </div>
        </form>
      </>
    );
  }


  function renderNotificationsSection() {
    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Alerts
            </span>

            <h2>
              Notifications
            </h2>

            <p>
              Review the notification features currently
              available in LensFlow.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiBell
              aria-hidden="true"
            />
          </div>
        </div>


        <div className="settings-option-list">

          <div className="settings-option-card">
            <div className="settings-option-icon">
              <BiBell
                aria-hidden="true"
              />
            </div>

            <div className="settings-option-content">
              <div className="settings-option-title">
                <div>
                  <h3>
                    In-app message notifications
                  </h3>

                  <p>
                    Unread client messages are displayed
                    using the notification bell in the
                    LensFlow header.
                  </p>
                </div>

                <span className="settings-status-pill settings-status-pill--active">
                  Enabled
                </span>
              </div>
            </div>
          </div>


          <div className="settings-option-card">
            <div className="settings-option-icon">
              <BiBell
                aria-hidden="true"
              />
            </div>

            <div className="settings-option-content">
              <div className="settings-option-title">
                <div>
                  <h3>
                    Email notifications
                  </h3>

                  <p>
                    Email alerts for new messages,
                    bookings and other LensFlow activity
                    will be added in a future integration.
                  </p>
                </div>

                <span className="settings-status-pill">
                  Coming soon
                </span>
              </div>
            </div>
          </div>

        </div>
      </>
    );
  }


  function renderPaymentsSection() {
    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Payment processing
            </span>

            <h2>
              Payments
            </h2>

            <p>
              Manage payment integrations used for
              bookings and invoices.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiCreditCard
              aria-hidden="true"
            />
          </div>
        </div>


        <form
          className="settings-form"
          onSubmit={handleSavePayments}
        >
          <div className="settings-form-grid">
            <div className="settings-field">
              <label htmlFor="settings-bank-account-name">
                Account name
              </label>

              <input
                id="settings-bank-account-name"
                name="bank_account_name"
                type="text"
                maxLength="150"
                value={paymentForm.bank_account_name}
                onChange={handlePaymentChange}
                placeholder="LensFlow Photography Ltd"
              />
            </div>

            <div className="settings-field">
              <label htmlFor="settings-bank-name">
                Bank name
              </label>

              <input
                id="settings-bank-name"
                name="bank_name"
                type="text"
                maxLength="150"
                value={paymentForm.bank_name}
                onChange={handlePaymentChange}
                placeholder="Your bank"
              />
            </div>

            <div className="settings-field settings-field--full">
              <label htmlFor="settings-bank-account-number">
                Account number
              </label>

              <input
                id="settings-bank-account-number"
                name="bank_account_number"
                type="text"
                maxLength="100"
                value={paymentForm.bank_account_number}
                onChange={handlePaymentChange}
                placeholder="00-0000-0000000-00"
              />

              <span className="settings-field-help">
                The account name and number will be shown on new invoices.
              </span>
            </div>

            <div className="settings-field settings-field--full">
              <label htmlFor="settings-bank-payment-instructions">
                Payment instructions
              </label>

              <textarea
                id="settings-bank-payment-instructions"
                name="bank_payment_instructions"
                rows="4"
                value={paymentForm.bank_payment_instructions}
                onChange={handlePaymentChange}
                placeholder="For example, use the invoice number as your payment reference."
              />
            </div>
          </div>

          {renderStatusMessage(
            paymentMessage,
            paymentError
          )}

          <div className="settings-form-actions">
            <button
              type="submit"
              className="settings-primary-button"
              disabled={savingPayments}
            >
              <BiSave aria-hidden="true" />

              {savingPayments
                ? "Saving..."
                : "Save Bank Details"}
            </button>
          </div>
        </form>


        <div className="settings-integration-card">
          <div className="settings-integration-top">
            <div className="settings-integration-icon">
              <BiCreditCard
                aria-hidden="true"
              />
            </div>

            <div>
              <span className="settings-integration-label">
                Payment provider
              </span>

              <h3>
                Stripe
              </h3>
            </div>

            <span
              className={`settings-status-pill ${
                stripeAccount?.stripe_account_id
                  ? "settings-status-pill--active"
                  : ""
              }`}
            >
              {stripeAccount?.stripe_account_id
                ? "Account created"
                : "Not connected"}
            </span>
          </div>


          <p className="settings-integration-description">
            Connect Stripe so clients can securely pay
            LensFlow invoices online. Stripe securely
            collects the business, identity and payout
            details required to activate payments.
          </p>


          {stripeAccount?.stripe_account_id ? (
            <div className="settings-detail-list">
              <div className="settings-detail-row">
                <span>
                  Stripe account
                </span>

                <strong>
                  {stripeAccount.stripe_account_id}
                </strong>
              </div>

              <div className="settings-detail-row">
                <span>
                  Card payments
                </span>

                <strong>
                  {stripeAccount.charges_enabled
                    ? "Enabled"
                    : "Not enabled"}
                </strong>
              </div>

              <div className="settings-detail-row">
                <span>
                  Payouts
                </span>

                <strong>
                  {stripeAccount.payouts_enabled
                    ? "Enabled"
                    : "Not enabled"}
                </strong>
              </div>

              <div className="settings-detail-row">
                <span>
                  Stripe details
                </span>

                <strong>
                  {stripeAccount.details_submitted
                    ? "Submitted"
                    : "Onboarding required"}
                </strong>
              </div>
            </div>
          ) : null}


          {renderStatusMessage(
            stripeMessage,
            stripeError
          )}


          <div className="settings-integration-actions">
            {stripeAccount?.stripe_account_id ? (
              <button
                type="button"
                className="settings-secondary-button"
                onClick={() =>
                  handleSyncStripeStatus()
                }
                disabled={
                  syncingStripeStatus ||
                  startingStripeOnboarding
                }
              >
                <BiRefresh aria-hidden="true" />

                {syncingStripeStatus
                  ? "Checking..."
                  : "Refresh Stripe Status"}
              </button>
            ) : null}

            <button
              type="button"
              className="settings-primary-button"
              onClick={
                stripeAccount?.stripe_account_id
                  ? handleStartStripeOnboarding
                  : handleConnectStripe
              }
              disabled={
                connectingStripe ||
                startingStripeOnboarding ||
                syncingStripeStatus
              }
            >
              <BiCreditCard aria-hidden="true" />

              {connectingStripe
                ? "Connecting..."
                : startingStripeOnboarding
                  ? "Opening Stripe..."
                  : stripeAccount?.stripe_account_id
                    ? "Continue Stripe Setup"
                    : "Connect Stripe"}
            </button>
          </div>
        </div>
      </>
    );
  }


  function renderCalendarSection() {
    const isConnected =
      Boolean(
        calendarIntegration &&
        calendarIntegration.is_active
      );

    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Scheduling
            </span>

            <h2>
              Calendar
            </h2>

            <p>
              Review your Google Calendar integration
              status.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiCalendar
              aria-hidden="true"
            />
          </div>
        </div>


        <div className="settings-integration-card">

          <div className="settings-integration-top">
            <div className="settings-integration-icon">
              <BiCalendar
                aria-hidden="true"
              />
            </div>

            <div>
              <span className="settings-integration-label">
                Calendar provider
              </span>

              <h3>
                Google Calendar
              </h3>
            </div>

            <span
              className={`settings-status-pill ${
                isConnected
                  ? "settings-status-pill--active"
                  : ""
              }`}
            >
              {isConnected
                ? "Connected"
                : "Not connected"}
            </span>
          </div>


          {calendarIntegration ? (
            <div className="settings-detail-list">

              <div className="settings-detail-row">
                <span>
                  Calendar ID
                </span>

                <strong>
                  {calendarIntegration.calendar_id ||
                    "Not assigned"}
                </strong>
              </div>


              <div className="settings-detail-row">
                <span>
                  Integration status
                </span>

                <strong>
                  {calendarIntegration.is_active
                    ? "Active"
                    : "Inactive"}
                </strong>
              </div>


              <div className="settings-detail-row">
                <span>
                  Provider
                </span>

                <strong>
                  Google
                </strong>
              </div>


              <div className="settings-detail-row">
                <span>
                  Last updated
                </span>

                <strong>
                  {formatCalendarDate(
                    calendarIntegration.updated_at
                  )}
                </strong>
              </div>

            </div>
          ) : (
            <div className="settings-empty-integration">
              <BiCalendar
                aria-hidden="true"
              />

              <h3>
                Google Calendar is not connected
              </h3>

              <p>
                Calendar authentication will allow
                LensFlow bookings to synchronize with
                your Google Calendar.
              </p>

              <span>
                OAuth integration coming soon
              </span>
            </div>
          )}

        </div>
      </>
    );
  }


  function renderSecuritySection() {
    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Account protection
            </span>

            <h2>
              Security
            </h2>

            <p>
              Update your password or manage your
              current LensFlow session.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiShield
              aria-hidden="true"
            />
          </div>
        </div>


        <div className="settings-security-grid">

          <form
            className="settings-security-card"
            onSubmit={
              handleUpdatePassword
            }
          >
            <div className="settings-security-card-heading">
              <BiLockAlt
                aria-hidden="true"
              />

              <div>
                <h3>
                  Change password
                </h3>

                <p>
                  Choose a strong password with at
                  least 8 characters.
                </p>
              </div>
            </div>


            <div className="settings-field">
              <label htmlFor="settings-password">
                New password
              </label>

              <input
                id="settings-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={
                  passwordForm.password
                }
                onChange={
                  handlePasswordChange
                }
                minLength="8"
                required
              />
            </div>


            <div className="settings-field">
              <label htmlFor="settings-confirm-password">
                Confirm new password
              </label>

              <input
                id="settings-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={
                  passwordForm.confirmPassword
                }
                onChange={
                  handlePasswordChange
                }
                minLength="8"
                required
              />
            </div>


            {renderStatusMessage(
              securityMessage,
              securityError
            )}


            <button
              type="submit"
              className="settings-primary-button"
              disabled={
                savingPassword
              }
            >
              <BiLockAlt
                aria-hidden="true"
              />

              {savingPassword
                ? "Updating..."
                : "Update Password"}
            </button>
          </form>


          <div className="settings-security-card">
            <div className="settings-security-card-heading">
              <BiLogOut
                aria-hidden="true"
              />

              <div>
                <h3>
                  Sign out
                </h3>

                <p>
                  End your current LensFlow session on
                  this device.
                </p>
              </div>
            </div>


            <div className="settings-security-session">
              <span>
                Signed in as
              </span>

              <strong>
                {accountForm.email}
              </strong>
            </div>


            <button
              type="button"
              className="settings-secondary-button settings-signout-button"
              onClick={
                handleSignOut
              }
            >
              <BiLogOut
                aria-hidden="true"
              />

              Sign Out
            </button>
          </div>

        </div>
      </>
    );
  }


  function renderWebsiteSection() {
    return (
      <>
        <div className="settings-section-heading">
          <div>
            <span className="settings-section-eyebrow">
              Public presence
            </span>

            <h2>
              Website
            </h2>

            <p>
              Manage your public LensFlow photography
              website.
            </p>
          </div>

          <div className="settings-heading-icon">
            <BiGlobe
              aria-hidden="true"
            />
          </div>
        </div>


        <div className="settings-website-card">

          <div className="settings-website-icon">
            <BiGlobe
              aria-hidden="true"
            />
          </div>


          <div className="settings-website-content">
            <span>
              LensFlow Website Builder
            </span>

            <h3>
              Manage your photography website
            </h3>

            <p>
              Configure your hero section, portfolio,
              About content, services, reviews, contact
              details, typography and other public
              website options from the Website Builder.
            </p>


            <button
              type="button"
              className="settings-primary-button"
              onClick={() =>
                navigate(
                  "/photographer/website"
                )
              }
            >
              <BiGlobe
                aria-hidden="true"
              />

              Open Website Builder
            </button>
          </div>

        </div>
      </>
    );
  }


  function renderActiveSection() {
    switch (activeSection) {
      case "business":
        return renderBusinessSection();

      case "tax":
        return renderTaxSection();

      case "notifications":
        return renderNotificationsSection();

      case "payments":
        return renderPaymentsSection();

      case "calendar":
        return renderCalendarSection();

      case "security":
        return renderSecuritySection();

      case "website":
        return renderWebsiteSection();

      case "account":
      default:
        return renderAccountSection();
    }
  }


  /* =========================================================
     Page
     ========================================================= */

  return (
    <div className="settings-page">

      {/* =====================================================
          Header
          ===================================================== */}

      <section className="settings-page-header">

        <span className="settings-page-eyebrow">
          Preferences
        </span>

        <h1>
          Settings
        </h1>

        <p>
          Manage your LensFlow account, business
          information, integrations and security.
        </p>

      </section>


      {/* =====================================================
          Settings layout
          ===================================================== */}

      <section className="settings-layout">

        {/* Navigation */}

        <aside className="settings-navigation">

          <div className="settings-navigation-heading">
            <span>
              Settings
            </span>
          </div>


          <nav
            className="settings-navigation-list"
            aria-label="Settings sections"
          >
            {SETTINGS_SECTIONS.map(
              (section) => {
                const Icon =
                  section.icon;

                const isActive =
                  activeSection ===
                  section.id;

                return (
                  <button
                    key={
                      section.id
                    }
                    type="button"
                    className={
                      isActive
                        ? "settings-nav-button is-active"
                        : "settings-nav-button"
                    }
                    onClick={() =>
                      setActiveSection(
                        section.id
                      )
                    }
                  >
                    <Icon
                      aria-hidden="true"
                    />

                    <span>
                      {section.label}
                    </span>
                  </button>
                );
              }
            )}
          </nav>

        </aside>


        {/* Main panel */}

        <div className="settings-panel">
          {renderActiveSection()}
        </div>

      </section>

    </div>
  );
}
