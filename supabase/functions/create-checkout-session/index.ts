import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";


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
    "Vary": "Origin",
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


function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}


/*
 * Convert a PostgreSQL numeric money value into
 * Stripe's smallest currency unit.
 *
 * NZD uses cents:
 *
 * 500.00 -> 50000
 * 49.95  -> 4995
 *
 * This avoids trusting an amount supplied by React.
 */
function toMinorUnits(value: unknown): number {
  const raw = String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(
      "Invoice total is not a valid monetary amount."
    );
  }

  const [wholePart, fractionPart = ""] =
    raw.split(".");

  /*
   * LensFlow invoices use two-decimal currency.
   *
   * Extra database decimal places are accepted only
   * when they are zero.
   */
  if (
    fractionPart.length > 2 &&
    /[1-9]/.test(fractionPart.slice(2))
  ) {
    throw new Error(
      "Invoice total has unsupported decimal precision."
    );
  }

  const cents =
    (BigInt(wholePart) * 100n) +
    BigInt(
      (fractionPart + "00").slice(0, 2)
    );

  if (
    cents <= 0n ||
    cents > 99999999n
  ) {
    throw new Error(
      "Invoice total is outside the supported payment range."
    );
  }

  return Number(cents);
}


async function retrieveCheckoutSession(
  stripeSecretKey: string,
  stripeAccountId: string,
  sessionId: string
) {
  const response =
    await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${
        encodeURIComponent(sessionId)
      }`,
      {
        method: "GET",
        headers: {
          "Authorization":
            `Bearer ${stripeSecretKey}`,

          /*
           * This tells Stripe that the request is being
           * made on behalf of this photographer's
           * connected Stripe account.
           */
          "Stripe-Account":
            stripeAccountId,
        },
      }
    );

  const data =
    await response.json();

  return {
    response,
    data,
  };
}


Deno.serve(async (req) => {

  const origin =
    req.headers.get("Origin");

  const corsHeaders =
    getCorsHeaders(origin);


  /*
   * =====================================================
   * CORS
   * =====================================================
   */

  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }


  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed.",
      },
      405,
      corsHeaders
    );
  }


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
     * Environment
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
        "Required server environment variables are missing."
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
     * Request body
     * =====================================================
     *
     * The browser supplies ONLY invoice_id.
     *
     * It does NOT supply:
     *
     * amount
     * client_id
     * photographer_id
     * Stripe account ID
     */

    let requestBody;

    try {
      requestBody =
        await req.json();
    } catch {
      return jsonResponse(
        {
          error:
            "Invalid request body.",
        },
        400,
        corsHeaders
      );
    }


    const invoiceId =
      requestBody?.invoice_id;


    if (!isUuid(invoiceId)) {
      return jsonResponse(
        {
          error:
            "A valid invoice ID is required.",
        },
        400,
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
     * Trusted server client
     * =====================================================
     */

    const supabaseAdmin =
      createClient(
        supabaseUrl,
        supabaseServiceRoleKey
      );


    /*
     * =====================================================
     * Resolve authenticated user -> client
     * =====================================================
     */

    const {
      data: client,
      error: clientError,
    } =
      await supabaseAdmin
        .from("clients")
        .select(
          `
          client_id,
          photographer_id
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();


    if (clientError) {
      console.error(
        "Client lookup failed:",
        clientError.message
      );

      return jsonResponse(
        {
          error:
            "Could not verify client account.",
        },
        500,
        corsHeaders
      );
    }


    if (!client) {
      return jsonResponse(
        {
          error:
            "Only client accounts can pay invoices.",
        },
        403,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Retrieve authoritative invoice
     * =====================================================
     *
     * The invoice must belong to the authenticated
     * LensFlow client.
     */

    const {
      data: invoice,
      error: invoiceError,
    } =
      await supabaseAdmin
        .from("invoices")
        .select(
          `
          invoice_id,
          photographer_id,
          client_id,
          invoice_number,
          total_amount,
          status
          `
        )
        .eq(
          "invoice_id",
          invoiceId
        )
        .eq(
          "client_id",
          client.client_id
        )
        .maybeSingle();


    if (invoiceError) {
      console.error(
        "Invoice lookup failed:",
        invoiceError.message
      );

      return jsonResponse(
        {
          error:
            "Could not retrieve invoice.",
        },
        500,
        corsHeaders
      );
    }


    /*
     * Return the same response whether the invoice does
     * not exist or belongs to somebody else.
     *
     * This avoids leaking invoice ownership.
     */
    if (!invoice) {
      return jsonResponse(
        {
          error:
            "Invoice is unavailable.",
        },
        404,
        corsHeaders
      );
    }


    /*
     * Defence in depth:
     *
     * Verify that the photographer relationship on the
     * invoice matches the authenticated client's
     * photographer.
     */
    if (
      invoice.photographer_id !==
      client.photographer_id
    ) {
      console.error(
        "Invoice photographer/client relationship mismatch."
      );

      return jsonResponse(
        {
          error:
            "Invoice is unavailable.",
        },
        404,
        corsHeaders
      );
    }


    /*
     * Only sent and overdue invoices are payable.
     *
     * draft     -> photographer has not issued it
     * paid      -> already paid
     * cancelled -> no longer payable
     */

    if (
      !["sent", "overdue"].includes(
        invoice.status
      )
    ) {
      return jsonResponse(
        {
          error:
            invoice.status === "paid"
              ? "This invoice has already been paid."
              : "This invoice is not currently payable.",
        },
        409,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Authoritative amount
     * =====================================================
     */

    let amountMinorUnits;

    try {
      amountMinorUnits =
        toMinorUnits(
          invoice.total_amount
        );
    } catch (error) {
      console.error(
        "Invalid invoice total:",
        error
      );

      return jsonResponse(
        {
          error:
            "This invoice has an invalid payment total.",
        },
        400,
        corsHeaders
      );
    }


    /*
     * LensFlow V1 currently uses NZD.
     */
    const currency =
      "nzd";


    /*
     * =====================================================
     * Check for an already successful payment
     * =====================================================
     */

    const {
      data: successfulPayment,
      error: successfulPaymentError,
    } =
      await supabaseAdmin
        .from("payments")
        .select(
          "payment_id"
        )
        .eq(
          "invoice_id",
          invoice.invoice_id
        )
        .eq(
          "status",
          "successful"
        )
        .limit(1)
        .maybeSingle();


    if (successfulPaymentError) {
      console.error(
        "Successful payment check failed:",
        successfulPaymentError.message
      );

      return jsonResponse(
        {
          error:
            "Could not verify invoice payment status.",
        },
        500,
        corsHeaders
      );
    }


    if (successfulPayment) {
      return jsonResponse(
        {
          error:
            "This invoice has already been paid.",
        },
        409,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Retrieve photographer Stripe account
     * =====================================================
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
          `
          stripe_account_id,
          charges_enabled
          `
        )
        .eq(
          "photographer_id",
          invoice.photographer_id
        )
        .maybeSingle();


    if (stripeConnectionError) {
      console.error(
        "Stripe account lookup failed:",
        stripeConnectionError.message
      );

      return jsonResponse(
        {
          error:
            "Could not verify the photographer's payment account.",
        },
        500,
        corsHeaders
      );
    }


    if (!stripeConnection) {
      return jsonResponse(
        {
          error:
            "Online payment is not available for this photographer.",
        },
        409,
        corsHeaders
      );
    }


    if (
      !stripeConnection
        .charges_enabled
    ) {
      return jsonResponse(
        {
          error:
            "The photographer's Stripe account is not currently enabled for card payments.",
        },
        409,
        corsHeaders
      );
    }


    const stripeAccountId =
      stripeConnection
        .stripe_account_id;


    /*
     * =====================================================
     * Photographer business name
     * =====================================================
     */

    const {
      data: photographer,
    } =
      await supabaseAdmin
        .from(
          "photographer_profiles"
        )
        .select(
          "business_name"
        )
        .eq(
          "photographer_id",
          invoice.photographer_id
        )
        .maybeSingle();


    const businessName =
      photographer
        ?.business_name ||
      "Photography services";


    /*
     * =====================================================
     * Reuse existing pending payment if appropriate
     * =====================================================
     */

    const {
      data: existingPending,
      error: pendingError,
    } =
      await supabaseAdmin
        .from("payments")
        .select(
          `
          payment_id,
          stripe_account_id,
          stripe_checkout_session_id
          `
        )
        .eq(
          "invoice_id",
          invoice.invoice_id
        )
        .eq(
          "status",
          "pending"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();


    if (pendingError) {
      console.error(
        "Pending payment lookup failed:",
        pendingError.message
      );

      return jsonResponse(
        {
          error:
            "Could not prepare invoice payment.",
        },
        500,
        corsHeaders
      );
    }


    let payment =
      existingPending;


    /*
     * A payment attempt must remain tied to the same
     * connected Stripe account.
     */
    if (
      payment?.stripe_account_id &&
      payment.stripe_account_id !==
        stripeAccountId
    ) {
      console.error(
        "Existing payment is associated with a different Stripe account."
      );

      return jsonResponse(
        {
          error:
            "The existing payment attempt cannot be reused.",
        },
        409,
        corsHeaders
      );
    }


    /*
     * If an open Stripe Checkout Session already exists,
     * return its URL instead of creating another one.
     */

    if (
      payment
        ?.stripe_checkout_session_id
    ) {
      const {
        response,
        data: stripeSession,
      } =
        await retrieveCheckoutSession(
          stripeSecretKey,
          stripeAccountId,
          payment
            .stripe_checkout_session_id
        );


      if (!response.ok) {
        console.error(
          "Existing Checkout Session retrieval failed:",
          JSON.stringify(
            stripeSession
          )
        );

        /*
         * Do not create a duplicate payment if Stripe
         * cannot tell us what happened to the first one.
         */
        return jsonResponse(
          {
            error:
              "The existing Stripe payment session could not be verified. Please try again shortly.",
          },
          502,
          corsHeaders
        );
      }


      if (
        stripeSession.status ===
          "open" &&
        stripeSession.payment_status ===
          "unpaid" &&
        stripeSession.url
      ) {
        return jsonResponse(
          {
            success: true,
            reused: true,

            payment_id:
              payment.payment_id,

            checkout_session_id:
              stripeSession.id,

            url:
              stripeSession.url,
          },
          200,
          corsHeaders
        );
      }


      /*
       * An expired Checkout Session can safely become a
       * failed LensFlow payment attempt. A later request
       * can then create a new attempt.
       */
      if (
        stripeSession.status ===
        "expired"
      ) {
        const {
          error: expireUpdateError,
        } =
          await supabaseAdmin
            .from("payments")
            .update({
              status: "failed",
            })
            .eq(
              "payment_id",
              payment.payment_id
            )
            .eq(
              "status",
              "pending"
            );


        if (expireUpdateError) {
          console.error(
            "Unable to mark expired payment:",
            expireUpdateError.message
          );

          return jsonResponse(
            {
              error:
                "Could not prepare a new payment attempt.",
            },
            500,
            corsHeaders
          );
        }


        payment =
          null;
      } else {

        /*
         * A complete Session may be waiting for our
         * webhook to update LensFlow.
         *
         * Never create a second payment in that state.
         */
        return jsonResponse(
          {
            error:
              "This payment has already been submitted to Stripe and is awaiting confirmation.",
          },
          409,
          corsHeaders
        );
      }
    }


    /*
     * =====================================================
     * Create trusted LensFlow payment record
     * =====================================================
     */

    if (!payment) {

      const {
        data: newPayment,
        error: paymentInsertError,
      } =
        await supabaseAdmin
          .from("payments")
          .insert({
            invoice_id:
              invoice.invoice_id,

            client_id:
              client.client_id,

            amount:
              invoice.total_amount,

            currency:
              "NZD",

            status:
              "pending",

            stripe_account_id:
              stripeAccountId,
          })
          .select(
            `
            payment_id,
            stripe_account_id,
            stripe_checkout_session_id
            `
          )
          .single();


      if (paymentInsertError) {

        /*
         * The partial unique pending-payment index also
         * protects us against two requests arriving at
         * nearly the same time.
         */
        if (
          paymentInsertError.code ===
          "23505"
        ) {
          const {
            data: racedPayment,
            error: racedPaymentError,
          } =
            await supabaseAdmin
              .from("payments")
              .select(
                `
                payment_id,
                stripe_account_id,
                stripe_checkout_session_id
                `
              )
              .eq(
                "invoice_id",
                invoice.invoice_id
              )
              .eq(
                "status",
                "pending"
              )
              .limit(1)
              .maybeSingle();


          if (
            racedPaymentError ||
            !racedPayment
          ) {
            console.error(
              "Concurrent payment lookup failed:",
              racedPaymentError
                ?.message
            );

            return jsonResponse(
              {
                error:
                  "A payment attempt is already being prepared. Please try again.",
              },
              409,
              corsHeaders
            );
          }


          payment =
            racedPayment;

        } else {

          console.error(
            "Payment record creation failed:",
            paymentInsertError.message
          );

          return jsonResponse(
            {
              error:
                "Could not create the payment attempt.",
            },
            500,
            corsHeaders
          );
        }

      } else {
        payment =
          newPayment;
      }
    }


    /*
     * =====================================================
     * Create Stripe Checkout Session
     * =====================================================
     *
     * The amount, client, photographer and connected
     * account have all been determined server-side.
     */

    const successUrl =
      `${origin}/client/invoices/${
        invoice.invoice_id
      }?payment=success&session_id={CHECKOUT_SESSION_ID}`;


    const cancelUrl =
      `${origin}/client/invoices/${
        invoice.invoice_id
      }?payment=cancelled`;


    const params =
      new URLSearchParams();


    params.set(
      "mode",
      "payment"
    );


    params.set(
      "success_url",
      successUrl
    );


    params.set(
      "cancel_url",
      cancelUrl
    );


    /*
     * V1 LensFlow accepts card payments.
     */
    params.set(
      "payment_method_types[0]",
      "card"
    );


    /*
     * Reference LensFlow's invoice in Stripe.
     */
    params.set(
      "client_reference_id",
      invoice.invoice_id
    );


    if (user.email) {
      params.set(
        "customer_email",
        user.email
      );
    }


    /*
     * One Stripe line item represents the authoritative
     * LensFlow invoice total.
     *
     * LensFlow remains responsible for displaying the
     * detailed invoice items in its own invoice UI/PDF.
     */
    params.set(
      "line_items[0][price_data][currency]",
      currency
    );


    params.set(
      "line_items[0][price_data][product_data][name]",
      `Invoice ${invoice.invoice_number}`
    );


    params.set(
      "line_items[0][price_data][product_data][description]",
      `${businessName} photography services`
    );


    params.set(
      "line_items[0][price_data][unit_amount]",
      String(amountMinorUnits)
    );


    params.set(
      "line_items[0][quantity]",
      "1"
    );


    /*
     * Metadata gives the future webhook trusted
     * reconciliation identifiers.
     *
     * The webhook will still verify these against the
     * LensFlow database rather than blindly trusting
     * metadata alone.
     */

    params.set(
      "metadata[payment_id]",
      payment.payment_id
    );

    params.set(
      "metadata[invoice_id]",
      invoice.invoice_id
    );

    params.set(
      "metadata[client_id]",
      client.client_id
    );

    params.set(
      "metadata[photographer_id]",
      invoice.photographer_id
    );


    /*
     * Also copy the key LensFlow identifiers to the
     * PaymentIntent created by Checkout.
     */
    params.set(
      "payment_intent_data[metadata][payment_id]",
      payment.payment_id
    );

    params.set(
      "payment_intent_data[metadata][invoice_id]",
      invoice.invoice_id
    );

    params.set(
      "payment_intent_data[metadata][photographer_id]",
      invoice.photographer_id
    );


    params.set(
      "payment_intent_data[description]",
      `LensFlow invoice ${invoice.invoice_number}`
    );


    const stripeResponse =
      await fetch(
        "https://api.stripe.com/v1/checkout/sessions",
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${stripeSecretKey}`,

            "Content-Type":
              "application/x-www-form-urlencoded",

            /*
             * DIRECT CHARGE:
             *
             * Create the Checkout Session on the
             * photographer's connected Stripe account.
             */
            "Stripe-Account":
              stripeAccountId,

            /*
             * Safely retry the same Stripe creation
             * request without creating a duplicate
             * Session.
             */
            "Idempotency-Key":
              `lensflow-checkout-${payment.payment_id}`,
          },

          body:
            params.toString(),
        }
      );


    const stripeSession =
      await stripeResponse.json();


    if (!stripeResponse.ok) {

      console.error(
        "Stripe Checkout Session creation failed:",
        JSON.stringify(
          stripeSession
        )
      );


      /*
       * Do NOT mark this payment failed here.
       *
       * Stripe idempotency means a later retry using
       * this same payment_id can safely retry the
       * request if the outcome was uncertain.
       */

      return jsonResponse(
        {
          error:
            "Stripe could not create the payment session.",

          stripe_error:
            stripeSession
              ?.error
              ?.message ??
            "Unknown Stripe error.",
        },
        400,
        corsHeaders
      );
    }


    if (
      !stripeSession?.id ||
      !stripeSession?.url
    ) {
      console.error(
        "Stripe returned an incomplete Checkout Session."
      );

      return jsonResponse(
        {
          error:
            "Stripe returned an incomplete payment session.",
        },
        502,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Store Checkout Session ID
     * =====================================================
     */

    const {
      error: paymentUpdateError,
    } =
      await supabaseAdmin
        .from("payments")
        .update({
          stripe_checkout_session_id:
            stripeSession.id,
        })
        .eq(
          "payment_id",
          payment.payment_id
        )
        .eq(
          "status",
          "pending"
        );


    if (paymentUpdateError) {

      console.error(
        "Checkout Session was created but could not be saved:",
        paymentUpdateError.message
      );


      /*
       * Do not create another Stripe Session.
       *
       * The same payment_id/idempotency key can recover
       * this Session on a later retry.
       */
      return jsonResponse(
        {
          error:
            "The Stripe payment session was created but could not be saved. Please try again.",
        },
        500,
        corsHeaders
      );
    }


    /*
     * =====================================================
     * Safe response to React
     * =====================================================
     */

    return jsonResponse(
      {
        success: true,
        reused: false,

        payment_id:
          payment.payment_id,

        checkout_session_id:
          stripeSession.id,

        url:
          stripeSession.url,
      },
      200,
      corsHeaders
    );


  } catch (error) {

    console.error(
      "Unexpected Checkout Session error:",
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