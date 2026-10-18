import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const allowedOrigins = new Set([
  "https://lensflow-lac.vercel.app",
  "https://lensflow-project.vercel.app",
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

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    Vary: "Origin",
  };
}


function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>
) {
  return new Response(
    JSON.stringify(body),
    {
      status,

      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}


Deno.serve(async (req) => {

  const origin =
    req.headers.get("Origin");

  const corsHeaders =
    getCorsHeaders(origin);


  /*
   * Handle browser CORS preflight.
   */
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }


  /*
   * This function only accepts POST requests.
   */
  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed.",
      },
      405,
      corsHeaders
    );
  }


  /*
   * Only allow LensFlow frontend origins.
   */
  if (
    !origin ||
    !allowedOrigins.has(origin)
  ) {
    return jsonResponse(
      {
        error: "Origin not allowed.",
      },
      403,
      corsHeaders
    );
  }


  try {

    /*
     * =====================================================
     * Environment variables
     * =====================================================
     */

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY");

    const supabaseServiceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

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
        {
          error:
            "Server configuration error.",
        },
        500,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Authenticate LensFlow user
     * =====================================================
     */

    const authHeader =
      req.headers.get("Authorization");


    if (!authHeader) {
      return jsonResponse(
        {
          error:
            "Authentication required.",
        },
        401,
        corsHeaders
      );
    }


    /*
     * User-scoped Supabase client.
     *
     * This verifies the JWT belonging to the
     * LensFlow user who called the function.
     */
    const supabaseUser =
      createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
            },
          },
        }
      );


    const {
      data: {
        user,
      },
      error: userError,
    } =
      await supabaseUser
        .auth
        .getUser();


    if (
      userError ||
      !user
    ) {
      console.error(
        "Authentication failed:",
        userError?.message
      );

      return jsonResponse(
        {
          error:
            "Invalid or expired session.",
        },
        401,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Trusted server-side Supabase client
     * =====================================================
     */

    const supabaseAdmin =
      createClient(
        supabaseUrl,
        supabaseServiceRoleKey
      );


    /*
     * =====================================================
     * Resolve authenticated user → photographer
     * =====================================================
     */

    const {
      data: photographer,
      error: photographerError,
    } =
      await supabaseAdmin
        .from(
          "photographer_profiles"
        )
        .select(
          "photographer_id"
        )
        .eq(
          "user_id",
          user.id
        )
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
            "Only photographer accounts can synchronise Stripe.",
        },
        403,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Retrieve photographer's Stripe account ID
     * =====================================================
     *
     * IMPORTANT:
     *
     * stripe_account_id is NOT accepted from React.
     *
     * We resolve it server-side using the authenticated
     * photographer.
     */

    const {
      data: stripeConnection,
      error: stripeConnectionError,
    } =
      await supabaseAdmin
        .from(
          "photographer_stripe_accounts"
        )
        .select(
          "stripe_account_id"
        )
        .eq(
          "photographer_id",
          photographer.photographer_id
        )
        .maybeSingle();


    if (stripeConnectionError) {
      console.error(
        "Stripe connection lookup failed:",
        stripeConnectionError.message
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


    if (!stripeConnection) {
      return jsonResponse(
        {
          error:
            "No Stripe account is connected.",
        },
        400,
        corsHeaders
      );
    }


    const stripeAccountId =
      stripeConnection
        .stripe_account_id;


    /*
     * =====================================================
     * Retrieve authoritative status from Stripe
     * =====================================================
     *
     * LensFlow creates connected accounts with
     * Accounts v2.
     *
     * Stripe explicitly supports passing a v2 Account ID
     * to an Accounts v1 endpoint. The response is returned
     * in the v1 Account shape.
     *
     * This is useful here because LensFlow's existing
     * database columns correspond directly to:
     *
     * charges_enabled
     * payouts_enabled
     * details_submitted
     */

    const stripeResponse =
      await fetch(
        `https://api.stripe.com/v1/accounts/${encodeURIComponent(
          stripeAccountId
        )}`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${stripeSecretKey}`,
          },
        }
      );


    const stripeAccount =
      await stripeResponse.json();


    if (!stripeResponse.ok) {

      console.error(
        "Stripe account retrieval failed:",
        JSON.stringify(
          stripeAccount
        )
      );


      return jsonResponse(
        {
          error:
            "Could not retrieve Stripe account status.",

          stripe_error:
            stripeAccount
              ?.error
              ?.message ??
            "Unknown Stripe error.",
        },
        400,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Validate Stripe response
     * =====================================================
     *
     * Never silently convert a missing field to false.
     *
     * If Stripe's API response changes unexpectedly,
     * LensFlow should fail safely instead of overwriting
     * valid database state with incorrect values.
     */

    if (
      typeof stripeAccount
        .charges_enabled !== "boolean" ||

      typeof stripeAccount
        .payouts_enabled !== "boolean" ||

      typeof stripeAccount
        .details_submitted !== "boolean"
    ) {

      console.error(
        "Stripe returned an unexpected account status shape:",
        JSON.stringify({
          id:
            stripeAccount?.id,

          charges_enabled:
            stripeAccount
              ?.charges_enabled,

          payouts_enabled:
            stripeAccount
              ?.payouts_enabled,

          details_submitted:
            stripeAccount
              ?.details_submitted,
        })
      );


      return jsonResponse(
        {
          error:
            "Stripe returned an unexpected account status.",
        },
        502,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Synchronise Stripe → LensFlow database
     * =====================================================
     */

    const chargesEnabled =
      stripeAccount
        .charges_enabled;

    const payoutsEnabled =
      stripeAccount
        .payouts_enabled;

    const detailsSubmitted =
      stripeAccount
        .details_submitted;


    const {
      error: updateError,
    } =
      await supabaseAdmin
        .from(
          "photographer_stripe_accounts"
        )
        .update({
          charges_enabled:
            chargesEnabled,

          payouts_enabled:
            payoutsEnabled,

          details_submitted:
            detailsSubmitted,
        })
        .eq(
          "photographer_id",
          photographer.photographer_id
        )
        .eq(
          "stripe_account_id",
          stripeAccountId
        );


    if (updateError) {

      console.error(
        "Stripe status database update failed:",
        updateError.message
      );


      return jsonResponse(
        {
          error:
            "Stripe status was retrieved but could not be saved.",
        },
        500,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Safe response to React
     * =====================================================
     *
     * Only return the status information LensFlow needs.
     *
     * Do not return the complete Stripe Account object.
     */

    return jsonResponse(
      {
        success: true,

        stripe_account_id:
          stripeAccountId,

        charges_enabled:
          chargesEnabled,

        payouts_enabled:
          payoutsEnabled,

        details_submitted:
          detailsSubmitted,
      },
      200,
      corsHeaders
    );


  } catch (error) {

    console.error(
      "Unexpected Stripe status sync error:",
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