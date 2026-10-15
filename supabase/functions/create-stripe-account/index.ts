import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceRoleKey ||
      !stripeSecretKey
    ) {
      console.error("Required environment variables are missing.");

      return jsonResponse(
        { error: "Server configuration error." },
        500
      );
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ error: "Authentication required." }, 401);
    }

    // User-scoped client.
    // Used only to establish the identity of the caller.
    const supabaseUser = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      console.error("Authentication failed:", userError?.message);

      return jsonResponse(
        { error: "Invalid or expired session." },
        401
      );
    }

    // Trusted server-side client.
    // Never expose this key to React.
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );

    // Resolve the authenticated user to their photographer profile.
    const {
      data: photographer,
      error: photographerError,
    } = await supabaseAdmin
      .from("photographer_profiles")
      .select(
        "photographer_id, user_id, business_name, email"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (photographerError) {
      console.error(
        "Photographer lookup failed:",
        photographerError.message
      );

      return jsonResponse(
        { error: "Could not verify photographer account." },
        500
      );
    }

    if (!photographer) {
      return jsonResponse(
        { error: "Only photographer accounts can connect Stripe." },
        403
      );
    }

    // Prevent duplicate Stripe accounts.
    const {
      data: existingStripeAccount,
      error: existingError,
    } = await supabaseAdmin
      .from("photographer_stripe_accounts")
      .select(
        "stripe_account_id, charges_enabled, payouts_enabled, details_submitted"
      )
      .eq("photographer_id", photographer.photographer_id)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Stripe account lookup failed:",
        existingError.message
      );

      return jsonResponse(
        { error: "Could not check Stripe connection." },
        500
      );
    }

    if (existingStripeAccount) {
      return jsonResponse({
        already_exists: true,
        stripe_account_id:
          existingStripeAccount.stripe_account_id,
        charges_enabled:
          existingStripeAccount.charges_enabled,
        payouts_enabled:
          existingStripeAccount.payouts_enabled,
        details_submitted:
          existingStripeAccount.details_submitted,
      });
    }

    /*
     * Create the connected merchant using Stripe Accounts v2.
     *
     * LensFlow V1:
     * - New Zealand merchants
     * - NZD
     * - Direct payments
     * - Stripe collects processing fees
     * - Stripe handles negative balance responsibility
     * - Photographer gets full Stripe Dashboard access
     */
    const stripeResponse = await fetch(
      "https://api.stripe.com/v2/core/accounts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/json",

          // Current Accounts v2 version from Stripe documentation.
          "Stripe-Version": "2026-07-29.dahlia",

          // Stable key prevents duplicate Stripe accounts
          // if this request is safely retried.
          "Idempotency-Key":
            `lensflow-photographer-${photographer.photographer_id}`,
        },
        body: JSON.stringify({
          contact_email: photographer.email,
          display_name: photographer.business_name,

          identity: {
            country: "nz",
          },

          configuration: {
            merchant: {
              capabilities: {
                card_payments: {
                  requested: true,
                },
              },
            },
          },

          defaults: {
            currency: "nzd",

            locales: ["en-NZ"],

            responsibilities: {
              fees_collector: "stripe",
              losses_collector: "stripe",
            },
          },

          dashboard: "full",

          include: [
            "configuration.merchant",
            "identity",
            "defaults",
            "requirements",
          ],
        }),
      }
    );

    const stripeData = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error(
        "Stripe account creation failed:",
        JSON.stringify(stripeData)
      );

      return jsonResponse(
        {
          error: "Stripe account creation failed.",
          stripe_error:
            stripeData?.error?.message ??
            "Unknown Stripe error.",
        },
        400
      );
    }

    if (!stripeData.id) {
      console.error(
        "Stripe returned no account ID:",
        JSON.stringify(stripeData)
      );

      return jsonResponse(
        { error: "Stripe returned an invalid account response." },
        500
      );
    }

    /*
     * Do not trust the browser to write this record.
     * The service-role client records the Stripe-generated account ID.
     *
     * The status fields start false until Stripe onboarding/status
     * confirms otherwise.
     */
    const {
      data: savedAccount,
      error: saveError,
    } = await supabaseAdmin
      .from("photographer_stripe_accounts")
      .insert({
        photographer_id: photographer.photographer_id,
        stripe_account_id: stripeData.id,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      })
      .select(
        "stripe_account_id, charges_enabled, payouts_enabled, details_submitted"
      )
      .single();

    if (saveError) {
      console.error(
        "Could not save Stripe account:",
        saveError.message
      );

      /*
       * The Stripe account may already exist at this point.
       * The stable Stripe idempotency key means a retry will return
       * the same account instead of intentionally creating another.
       */
      return jsonResponse(
        {
          error:
            "Stripe account was created but could not be saved.",
        },
        500
      );
    }

    return jsonResponse(
      {
        success: true,
        already_exists: false,
        stripe_account_id: savedAccount.stripe_account_id,
        charges_enabled: savedAccount.charges_enabled,
        payouts_enabled: savedAccount.payouts_enabled,
        details_submitted: savedAccount.details_submitted,
      },
      201
    );
  } catch (error) {
    console.error("Unexpected error:", error);

    return jsonResponse(
      { error: "Unexpected server error." },
      500
    );
  }
});