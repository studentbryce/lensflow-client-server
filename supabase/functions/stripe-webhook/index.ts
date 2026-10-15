import Stripe from "npm:stripe@^22";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function toMinorUnits(value: unknown): number {
  const raw = String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("Invalid monetary amount.");
  }

  const [wholePart, fractionPart = ""] = raw.split(".");

  if (
    fractionPart.length > 2 &&
    /[1-9]/.test(fractionPart.slice(2))
  ) {
    throw new Error("Unsupported monetary precision.");
  }

  const minorUnits =
    BigInt(wholePart) * 100n +
    BigInt((fractionPart + "00").slice(0, 2));

  if (minorUnits <= 0n || minorUnits > 99999999n) {
    throw new Error("Amount is outside the supported range.");
  }

  return Number(minorUnits);
}

function stringId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (
    !stripeSecretKey ||
    !webhookSecret ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    console.error("Required webhook environment variables are missing.");
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return jsonResponse({ error: "Missing Stripe signature." }, 400);
  }

  const stripe = new Stripe(stripeSecretKey);
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Stripe signature verification requires the exact raw request body.
  // Do not call req.json() before constructEventAsync().
  const rawBody = await req.text();

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    console.error("Stripe signature verification failed:", error);
    return jsonResponse({ error: "Invalid Stripe signature." }, 400);
  }

  async function retrievePaymentIntent(
    paymentIntentId: string,
    connectedAccountId: string,
  ) {
    const response = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Stripe-Account": connectedAccountId,
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Unable to retrieve Stripe PaymentIntent:",
        JSON.stringify(data),
      );
      throw new Error("Could not verify Stripe PaymentIntent.");
    }

    return data;
  }

  async function handleCompletedSession(
    session: Stripe.Checkout.Session,
  ) {
    const connectedAccountId = event.account;

    if (!connectedAccountId) {
      throw new Error("Connected account is missing from Checkout event.");
    }

    if (
      session.status !== "complete" ||
      session.payment_status !== "paid"
    ) {
      throw new Error("Completed Checkout Session is not confirmed as paid.");
    }

    if (
      typeof session.amount_total !== "number" ||
      !session.currency
    ) {
      throw new Error("Checkout Session amount or currency is missing.");
    }

    const paymentIntentId = stringId(session.payment_intent);

    if (!paymentIntentId) {
      throw new Error("Checkout Session has no PaymentIntent.");
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select(`
        payment_id,
        invoice_id,
        client_id,
        amount,
        currency,
        status,
        stripe_account_id,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        stripe_charge_id,
        paid_at
      `)
      .eq("stripe_checkout_session_id", session.id)
      .maybeSingle();

    if (paymentError) {
      throw new Error(`Payment lookup failed: ${paymentError.message}`);
    }

    if (!payment) {
      throw new Error("No LensFlow payment matches this Checkout Session.");
    }

    if (payment.stripe_account_id !== connectedAccountId) {
      throw new Error(
        "Connected Stripe account does not match LensFlow payment.",
      );
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select(`
        invoice_id,
        photographer_id,
        client_id,
        total_amount,
        status
      `)
      .eq("invoice_id", payment.invoice_id)
      .maybeSingle();

    if (invoiceError) {
      throw new Error(`Invoice lookup failed: ${invoiceError.message}`);
    }

    if (!invoice) {
      throw new Error("LensFlow invoice for payment was not found.");
    }

    if (invoice.client_id !== payment.client_id) {
      throw new Error("Payment client does not match invoice client.");
    }

    const metadata = session.metadata ?? {};

    if (
      metadata.payment_id !== payment.payment_id ||
      metadata.invoice_id !== payment.invoice_id ||
      metadata.client_id !== payment.client_id ||
      metadata.photographer_id !== invoice.photographer_id
    ) {
      throw new Error(
        "Checkout Session metadata does not match LensFlow records.",
      );
    }

    if (session.client_reference_id !== invoice.invoice_id) {
      throw new Error("Checkout Session reference does not match invoice.");
    }

    const paymentMinorUnits = toMinorUnits(payment.amount);
    const invoiceMinorUnits = toMinorUnits(invoice.total_amount);

    if (
      paymentMinorUnits !== invoiceMinorUnits ||
      session.amount_total !== invoiceMinorUnits
    ) {
      throw new Error("Stripe amount does not match LensFlow invoice.");
    }

    const paymentCurrency = String(payment.currency)
      .trim()
      .toLowerCase();

    if (
      paymentCurrency !== "nzd" ||
      session.currency.toLowerCase() !== paymentCurrency
    ) {
      throw new Error("Stripe currency does not match LensFlow payment.");
    }

    const paymentIntent = await retrievePaymentIntent(
      paymentIntentId,
      connectedAccountId,
    );

    if (
      paymentIntent.id !== paymentIntentId ||
      paymentIntent.status !== "succeeded" ||
      paymentIntent.currency?.toLowerCase() !== paymentCurrency ||
      paymentIntent.amount_received !== invoiceMinorUnits
    ) {
      throw new Error(
        "Stripe PaymentIntent does not match the successful LensFlow payment.",
      );
    }

    if (
      paymentIntent.metadata?.payment_id !== payment.payment_id ||
      paymentIntent.metadata?.invoice_id !== invoice.invoice_id ||
      paymentIntent.metadata?.photographer_id !== invoice.photographer_id
    ) {
      throw new Error(
        "Stripe PaymentIntent metadata does not match LensFlow records.",
      );
    }

    const chargeId = stringId(paymentIntent.latest_charge);

    if (!chargeId) {
      throw new Error("Successful PaymentIntent has no Charge ID.");
    }

    if (
      payment.stripe_payment_intent_id &&
      payment.stripe_payment_intent_id !== paymentIntentId
    ) {
      throw new Error("Stored PaymentIntent ID conflicts with Stripe event.");
    }

    if (
      payment.stripe_charge_id &&
      payment.stripe_charge_id !== chargeId
    ) {
      throw new Error("Stored Charge ID conflicts with Stripe event.");
    }

    if (
      payment.status !== "pending" &&
      payment.status !== "successful"
    ) {
      throw new Error(
        `Payment cannot transition from ${payment.status} to successful.`,
      );
    }

    if (payment.status === "pending") {
      const { data: updatedPayment, error: updatePaymentError } =
        await supabaseAdmin
          .from("payments")
          .update({
            status: "successful",
            payment_method: "card",
            stripe_payment_intent_id: paymentIntentId,
            stripe_charge_id: chargeId,
            paid_at: new Date(event.created * 1000).toISOString(),
          })
          .eq("payment_id", payment.payment_id)
          .eq("status", "pending")
          .select("payment_id")
          .maybeSingle();

      if (updatePaymentError) {
        throw new Error(
          `Payment update failed: ${updatePaymentError.message}`,
        );
      }

      if (!updatedPayment) {
        throw new Error("Payment changed while webhook was processing.");
      }
    }

    // A retry may arrive after the payment row was updated but before
    // the invoice update succeeded. Always reconcile the invoice too.
    if (invoice.status !== "paid") {
      const { error: updateInvoiceError } = await supabaseAdmin
        .from("invoices")
        .update({ status: "paid" })
        .eq("invoice_id", invoice.invoice_id);

      if (updateInvoiceError) {
        throw new Error(
          `Invoice update failed: ${updateInvoiceError.message}`,
        );
      }
    }

    console.log(
      `LensFlow payment ${payment.payment_id} confirmed by Stripe event ${event.id}.`,
    );
  }

  async function handleExpiredSession(
    session: Stripe.Checkout.Session,
  ) {
    const connectedAccountId = event.account;

    if (!connectedAccountId) {
      throw new Error(
        "Connected account is missing from expired Checkout event.",
      );
    }

    if (session.status !== "expired") {
      throw new Error("Expired Checkout event has unexpected Session status.");
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select(`
        payment_id,
        invoice_id,
        client_id,
        status,
        stripe_account_id
      `)
      .eq("stripe_checkout_session_id", session.id)
      .maybeSingle();

    if (paymentError) {
      throw new Error(
        `Expired payment lookup failed: ${paymentError.message}`,
      );
    }

    if (!payment) {
      throw new Error(
        "No LensFlow payment matches expired Checkout Session.",
      );
    }

    if (payment.stripe_account_id !== connectedAccountId) {
      throw new Error(
        "Expired Session connected account does not match LensFlow payment.",
      );
    }

    const metadata = session.metadata ?? {};

    if (
      metadata.payment_id !== payment.payment_id ||
      metadata.invoice_id !== payment.invoice_id ||
      metadata.client_id !== payment.client_id
    ) {
      throw new Error(
        "Expired Checkout Session metadata does not match LensFlow payment.",
      );
    }

    if (payment.status === "pending") {
      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("payment_id", payment.payment_id)
        .eq("status", "pending");

      if (updateError) {
        throw new Error(
          `Expired payment update failed: ${updateError.message}`,
        );
      }
    }

    console.log(
      `Checkout Session ${session.id} expired for LensFlow payment ${payment.payment_id}.`,
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCompletedSession(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "checkout.session.expired":
        await handleExpiredSession(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      default:
        console.log(`Ignoring unhandled Stripe event type: ${event.type}`);
    }

    return jsonResponse({
      received: true,
      event_id: event.id,
    });
  } catch (error) {
    console.error(
      `Stripe webhook processing failed for event ${event.id}:`,
      error,
    );

    // A 500 response asks Stripe to retry delivery.
    // The handlers above are deliberately idempotent.
    return jsonResponse({ error: "Webhook processing failed." }, 500);
  }
});
