import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://lensflow-lac.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function getCorsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && allowedOrigins.has(origin)
      ? origin
      : "https://lensflow-lac.vercel.app";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed." },
      405,
      corsHeaders
    );
  }

  // Prevent an authenticated request from using this
  // endpoint as an arbitrary redirect generator.
  if (!origin || !allowedOrigins.has(origin)) {
    return jsonResponse(
      { error: "Origin not allowed." },
      403,
      corsHeaders
    );
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY");

    const supabaseServiceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const stripeSecretKey =
      Deno.env.get("STRIPE_SECRET_KEY");

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceRoleKey ||
      !stripeSecretKey
    ) {
      console.error(
        "Required environment variables are missing."
      );

      return jsonResponse(
        { error: "Server configuration error." },
        500,
        corsHeaders
      );
    }

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(
        { error: "Authentication required." },
        401,
        corsHeaders
      );
    }

    /*
     * User-scoped Supabase client.
     * Used to securely identify the caller.
     */
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
      console.error(
        "Authentication failed:",
        userError?.message
      );

      return jsonResponse(
        { error: "Invalid or expired session." },
        401,
        corsHeaders
      );
    }

    /*
     * Trusted server-side Supabase client.
     */
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );

    /*
     * Resolve authenticated user to photographer.
     */
    const {
      data: photographer,
      error: photographerError,
    } = await supabaseAdmin
      .from("photographer_profiles")
      .select("photographer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (photographerError) {
      console.error(
        "Photographer lookup failed:",
        photographerError.message
      );

      return jsonResponse(
        {
          error:
            "Could not verify photographer account.",
        },
        500,
        corsHeaders
      );
    }

    if (!photographer) {
      return jsonResponse(
        {
          error:
            "Only photographer accounts can connect Stripe.",
        },
        403,
        corsHeaders
      );
    }

    /*
     * Find this photographer's Stripe account.
     *
     * IMPORTANT:
     * We never accept stripe_account_id from React.
     */
    const {
      data: stripeAccount,
      error: stripeAccountError,
    } = await supabaseAdmin
      .from("photographer_stripe_accounts")
      .select("stripe_account_id")
      .eq(
        "photographer_id",
        photographer.photographer_id
      )
      .maybeSingle();

    if (stripeAccountError) {
      console.error(
        "Stripe account lookup failed:",
        stripeAccountError.message
      );

      return jsonResponse(
        {
          error:
            "Could not retrieve Stripe connection.",
        },
        500,
        corsHeaders
      );
    }

    if (!stripeAccount) {
      return jsonResponse(
        {
          error:
            "Create your Stripe account before starting onboarding.",
        },
        400,
        corsHeaders
      );
    }

    /*
     * LensFlow Settings page.
     *
     * These URLs work for both:
     * - localhost development
     * - production Vercel deployment
     *
     * because origin has already been allow-listed.
     */
    const returnUrl =
      `${origin}/photographer/settings?tab=payments&stripe=return`;

    const refreshUrl =
      `${origin}/photographer/settings?tab=payments&stripe=refresh`;

    /*
     * Create an Accounts v2 hosted onboarding link.
     *
     * The connected account already has the merchant
     * configuration requested by create-stripe-account.
     */
    const stripeResponse = await fetch(
      "https://api.stripe.com/v2/core/account_links",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${stripeSecretKey}`,

          "Content-Type":
            "application/json",

          /*
           * Keep this consistent with the Accounts v2
           * version already used successfully by LensFlow.
           */
          "Stripe-Version":
            "2026-07-29.dahlia",
        },

        body: JSON.stringify({
          account:
            stripeAccount.stripe_account_id,

          use_case: {
            type: "account_onboarding",

            account_onboarding: {
              configurations: [
                "merchant",
              ],

              refresh_url:
                refreshUrl,

              return_url:
                returnUrl,
            },
          },
        }),
      }
    );

    const stripeData =
      await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error(
        "Stripe onboarding link failed:",
        JSON.stringify(stripeData)
      );

      return jsonResponse(
        {
          error:
            "Could not start Stripe onboarding.",

          stripe_error:
            stripeData?.error?.message ??
            "Unknown Stripe error.",
        },
        400,
        corsHeaders
      );
    }

    if (!stripeData.url) {
      console.error(
        "Stripe returned no onboarding URL:",
        JSON.stringify(stripeData)
      );

      return jsonResponse(
        {
          error:
            "Stripe returned an invalid onboarding response.",
        },
        500,
        corsHeaders
      );
    }

    /*
     * Account Links are temporary and single-use.
     * Return the URL to the authenticated browser.
     * Do not store it in the database.
     */
    return jsonResponse(
      {
        success: true,
        url: stripeData.url,
      },
      200,
      corsHeaders
    );

  } catch (error) {
    console.error(
      "Unexpected Stripe onboarding error:",
      error
    );

    return jsonResponse(
      {
        error:
          "Unexpected server error.",
      },
      500,
      corsHeaders
    );
  }
});