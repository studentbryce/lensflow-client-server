import { useEffect, useState } from "react";
import {
    useNavigate,
    useParams,
    useSearchParams,
} from "react-router-dom";
import {
    BiReceipt as Receipt,
    BiSearch as Search,
} from "react-icons/bi";
import InvoiceDocument from "../../components/invoices/InvoiceDocument";
import {
    formatInvoiceCurrency,
    formatInvoiceDate,
} from "../../components/invoices/invoiceFormatters";
import { downloadInvoicePdf } from "../../utils/invoicePdf";
import { useAuth } from "../../context/authStore";
import { supabase } from "../../lib/supabaseClient";
import { localToday } from "./bookingHelpers";
import { apiGetClientInvoices, apiGetClientInvoice } from "../../services/clientInvoicesApi";
import "./Invoices.css";

const FILTERS = [
    "all",
    "sent",
    "overdue",
    "paid",
    "cancelled",
];

function displayStatus(invoice, today) {
    return invoice.status === "sent" &&
        invoice.due_date &&
        invoice.due_date < today
        ? "overdue"
        : invoice.status;
}

function InvoiceCard({ invoice, onView }) {
    return (
        <article className="client-invoice-card">
            <div className="client-invoice-card-heading">
                <div>
                    <span className="client-invoice-card-number">
                        {invoice.invoice_number}
                    </span>
                    <span
                        className="client-invoice-status"
                        data-status={invoice.displayStatus}
                    >
                        {invoice.displayStatus}
                    </span>
                </div>

                <strong className="client-invoice-card-total">
                    {formatInvoiceCurrency(
                        invoice.total_amount
                    )}
                </strong>
            </div>

            <div className="client-invoice-card-service">
                <span>Photography Service</span>
                <h3>
                    {invoice.bookings?.services?.name ||
                        "Photography session"}
                </h3>
            </div>

            <dl className="client-invoice-card-details">
                <div>
                    <dt>Booking</dt>
                    <dd>
                        {invoice.bookings?.booking_date
                            ? formatInvoiceDate(
                                  invoice.bookings
                                      .booking_date
                              )
                            : "No booking"}
                    </dd>
                </div>

                <div>
                    <dt>Issued</dt>
                    <dd>
                        {formatInvoiceDate(
                            invoice.issue_date
                        )}
                    </dd>
                </div>

                <div>
                    <dt>Due</dt>
                    <dd
                        className={
                            invoice.displayStatus ===
                            "overdue"
                                ? "client-invoice-overdue"
                                : ""
                        }
                    >
                        {invoice.due_date
                            ? formatInvoiceDate(
                                  invoice.due_date
                              )
                            : "No due date"}
                    </dd>
                </div>

                <div>
                    <dt>Subtotal</dt>
                    <dd>
                        {formatInvoiceCurrency(
                            invoice.subtotal
                        )}
                    </dd>
                </div>
            </dl>

            {invoice.notes && (
                <div className="client-invoice-card-note">
                    <span>Note</span>
                    <p>{invoice.notes}</p>
                </div>
            )}

            <div className="client-invoice-card-actions">
                <button
                    type="button"
                    onClick={() =>
                        onView(invoice.invoice_id)
                    }
                >
                    View Invoice
                </button>
            </div>
        </article>
    );
}

export default function Invoices() {
    const navigate = useNavigate();
    const { invoice_id } = useParams();
    const [searchParams, setSearchParams] =
        useSearchParams();
    const { user } = useAuth();

    const [paymentReturn] = useState(() =>
        searchParams.get("payment")
    );
    const [paymentConfirmAttempts, setPaymentConfirmAttempts] =
        useState(0);

    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [clientProfile, setClientProfile] =
        useState(null);
    const [
        photographerProfile,
        setPhotographerProfile,
    ] = useState(null);
    const [pdfLoading, setPdfLoading] =
        useState(false);
    const [pdfError, setPdfError] = useState("");
    const [paymentLoading, setPaymentLoading] =
        useState(false);
    const [paymentError, setPaymentError] =
        useState("");

    useEffect(() => {
        if (!paymentReturn) return;

        const cleanedParams = new URLSearchParams(
            searchParams
        );
        cleanedParams.delete("payment");
        cleanedParams.delete("session_id");

        setSearchParams(cleanedParams, {
            replace: true,
        });
        // Capture the Stripe return state once, then clean the URL.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let active = true;

        async function loadInvoices() {
            setLoading(true);
            setError("");
            setInvoices([]);

            try {
                // Express verifies the JWT, resolves client ownership and applies RLS.
                // The invoice-detail endpoint returns line items only for an owned,
                // non-draft invoice; the list endpoint does not expose draft invoices.
                const result = invoice_id
                    ? await apiGetClientInvoice(invoice_id)
                    : await apiGetClientInvoices();
                if (active) {
                    setClientProfile(result.data.clientProfile);
                    setPhotographerProfile(result.data.photographerProfile);
                    setInvoices(invoice_id ? [result.data.invoice] : result.data.invoices);
                }
            } catch (err) {
                console.error(
                    "Unable to load client invoices:",
                    err
                );

                if (active) {
                    setError(
                        "We couldn't load your invoices. Please try again."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        if (user?.id) {
            void loadInvoices();
        }

        return () => {
            active = false;
        };
    }, [user?.id, invoice_id, retry]);

    // An unauthenticated user has no invoice request in progress. Derive
    // this from auth rather than synchronously updating state in an effect.
    const isLoading = Boolean(user?.id) && loading;
    const today = localToday();

    const records = (user?.id ? invoices : []).map((invoice) => ({
        ...invoice,
        invoice_items:
            invoice.invoice_items || [],
        displayStatus: displayStatus(
            invoice,
            today
        ),
    }));


    const returnedInvoice = invoice_id
        ? records.find(
              (invoice) =>
                  invoice.invoice_id === invoice_id
          )
        : null;

    useEffect(() => {
        if (
            paymentReturn !== "success" ||
            !invoice_id ||
            isLoading ||
            error ||
            returnedInvoice?.status === "paid" ||
            paymentConfirmAttempts >= 5
        ) {
            return undefined;
        }

        const timer = window.setTimeout(() => {
            setPaymentConfirmAttempts(
                (attempts) => attempts + 1
            );
            setRetry((value) => value + 1);
        }, 1500);

        return () => window.clearTimeout(timer);
    }, [
        paymentReturn,
        invoice_id,
        isLoading,
        error,
        returnedInvoice?.status,
        paymentConfirmAttempts,
    ]);

    const visible = records.filter(
        (invoice) =>
            (filter === "all" ||
                invoice.displayStatus === filter) &&
            [
                invoice.invoice_number,
                invoice.bookings?.services?.name,
                invoice.notes,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(
                    search.trim().toLowerCase()
                )
    );

    const unpaid = records.filter((invoice) =>
        ["sent", "overdue"].includes(
            invoice.displayStatus
        )
    );

    const summaries = [
        ["Your invoices", records.length],
        [
            "Unpaid invoice total",
            formatInvoiceCurrency(
                unpaid.reduce(
                    (total, invoice) =>
                        total +
                        Number(
                            invoice.total_amount
                        ),
                    0
                )
            ),
        ],
        [
            "Overdue invoices",
            records.filter(
                (invoice) =>
                    invoice.displayStatus ===
                    "overdue"
            ).length,
        ],
        [
            "Paid invoices",
            records.filter(
                (invoice) =>
                    invoice.displayStatus ===
                    "paid"
            ).length,
        ],
    ];

    function handleDownloadPdf(invoice) {
        try {
            setPdfLoading(true);
            setPdfError("");

            downloadInvoicePdf({
                invoice,
                items:
                    invoice.invoice_items || [],
                clientProfile,
                booking:
                    invoice.bookings || null,
                service:
                    invoice.bookings?.services ||
                    null,
                photographerProfile,
            });
        } catch (err) {
            console.error(
                "Unable to generate invoice PDF:",
                err
            );
            setPdfError(
                "We couldn't generate this invoice PDF. Please try again."
            );
        } finally {
            setPdfLoading(false);
        }
    }

    async function handlePayInvoice(invoice) {
        if (!invoice?.invoice_id) return;

        try {
            setPaymentLoading(true);
            setPaymentError("");

            const { data, error: functionError } =
                await supabase.functions.invoke(
                    "create-checkout-session",
                    {
                        body: {
                            invoice_id:
                                invoice.invoice_id,
                        },
                    }
                );

            if (functionError) {
                let message =
                    functionError.message ||
                    "Unable to start secure payment.";

                try {
                    if (functionError.context) {
                        const errorBody =
                            await functionError.context.json();

                        message =
                            errorBody?.stripe_error ||
                            errorBody?.error ||
                            message;
                    }
                } catch {
                    // Keep the original function error.
                }

                throw new Error(message);
            }

            if (!data?.url) {
                throw new Error(
                    "Stripe did not return a Checkout URL."
                );
            }

            window.location.assign(data.url);
        } catch (err) {
            console.error(
                "Unable to create Stripe Checkout Session:",
                err
            );

            setPaymentError(
                err.message ||
                    "We couldn't start secure payment. Please try again."
            );

            setPaymentLoading(false);
        }
    }

    if (invoice_id) {
        const selectedInvoice = records.find(
            (invoice) =>
                invoice.invoice_id === invoice_id
        );

        return (
            <div className="client-invoices-page client-invoice-detail-page">
                <div className="client-invoice-detail-toolbar">
                    <button
                        type="button"
                        className="client-invoice-back-button"
                        onClick={() =>
                            navigate(
                                "/client/invoices"
                            )
                        }
                    >
                        ← Back to Invoices
                    </button>

                    {selectedInvoice && (
                        <div className="client-invoice-detail-actions">
                            <button
                                type="button"
                                className="client-invoice-download-button"
                                onClick={() =>
                                    handleDownloadPdf(
                                        selectedInvoice
                                    )
                                }
                                disabled={
                                    pdfLoading ||
                                    paymentLoading
                                }
                            >
                                {pdfLoading
                                    ? "Generating..."
                                    : "Download PDF"}
                            </button>

                            {paymentReturn !== "success" &&
                                ["sent", "overdue"].includes(
                                    selectedInvoice.displayStatus
                                ) && (
                                <button
                                    type="button"
                                    className="client-invoice-pay-button"
                                    onClick={() =>
                                        handlePayInvoice(
                                            selectedInvoice
                                        )
                                    }
                                    disabled={
                                        paymentLoading ||
                                        pdfLoading
                                    }
                                >
                                    {paymentLoading
                                        ? "Opening Stripe..."
                                        : "Pay Securely with Stripe"}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {paymentReturn === "success" &&
                    selectedInvoice &&
                    selectedInvoice.status === "paid" && (
                        <div
                            className="client-invoice-payment-notice client-invoice-payment-notice--success"
                            role="status"
                        >
                            <div>
                                <strong>
                                    Payment successful
                                </strong>
                                <p>
                                    Your payment of{" "}
                                    {formatInvoiceCurrency(
                                        selectedInvoice.total_amount
                                    )}{" "}
                                    has been received. This
                                    invoice is now paid.
                                </p>
                            </div>
                        </div>
                    )}

                {paymentReturn === "success" &&
                    selectedInvoice &&
                    selectedInvoice.status !== "paid" && (
                        <div
                            className="client-invoice-payment-notice client-invoice-payment-notice--pending"
                            role="status"
                        >
                            <div>
                                <strong>
                                    Confirming your payment
                                </strong>
                                <p>
                                    {paymentConfirmAttempts < 5
                                        ? "Stripe has returned you to LensFlow. We are waiting for secure payment confirmation. This page will update automatically."
                                        : "Payment confirmation is taking longer than expected. Please refresh this invoice shortly. Do not submit another payment while confirmation is pending."}
                                </p>
                            </div>
                        </div>
                    )}

                {paymentReturn === "cancelled" && (
                    <div
                        className="client-invoice-payment-notice client-invoice-payment-notice--cancelled"
                        role="status"
                    >
                        <div>
                            <strong>
                                Payment cancelled
                            </strong>
                            <p>
                                No payment was made. You can
                                return to Stripe whenever you're
                                ready.
                            </p>
                        </div>
                    </div>
                )}

                {pdfError && (
                    <div
                        className="client-invoices-state client-invoice-pdf-error"
                        role="alert"
                    >
                        <p>{pdfError}</p>
                    </div>
                )}

                {paymentError && (
                    <div
                        className="client-invoices-state client-invoice-payment-error"
                        role="alert"
                    >
                        <p>{paymentError}</p>
                    </div>
                )}

                {isLoading ? (
                    <div
                        className="client-invoices-state"
                        role="status"
                    >
                        Loading your invoice…
                    </div>
                ) : error ? (
                    <div
                        className="client-invoices-state"
                        role="alert"
                    >
                        <h2>Unable to load invoice</h2>
                        <p>{error}</p>
                        <button
                            type="button"
                            onClick={() =>
                                setRetry(
                                    (value) =>
                                        value + 1
                                )
                            }
                        >
                            Try again
                        </button>
                    </div>
                ) : selectedInvoice ? (
                    <InvoiceDocument
                        invoice={selectedInvoice}
                        items={
                            selectedInvoice.invoice_items
                        }
                        clientProfile={clientProfile}
                        booking={
                            selectedInvoice.bookings
                        }
                        service={
                            selectedInvoice.bookings
                                ?.services
                        }
                        photographerProfile={
                            photographerProfile
                        }
                        bookingLink={
                            selectedInvoice.booking_id
                                ? `/client/bookings/${selectedInvoice.booking_id}`
                                : ""
                        }
                    />
                ) : (
                    <div
                        className="client-invoices-state"
                        role="alert"
                    >
                        <h2>Invoice not found</h2>
                        <p>
                            This invoice is unavailable or
                            you do not have permission to
                            view it.
                        </p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="client-invoices-page">
            <header className="client-invoices-header">
                <p className="client-invoices-eyebrow">
                    Your photography
                </p>
                <h1>My Invoices</h1>
                <p>
                    View your invoices, check due dates and
                    review your photography charges.
                </p>
            </header>

            {isLoading ? (
                <div
                    className="client-invoices-state"
                    role="status"
                >
                    Loading your invoices…
                </div>
            ) : error ? (
                <div
                    className="client-invoices-state"
                    role="alert"
                >
                    <h2>Unable to load invoices</h2>
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
                </div>
            ) : (
                <>
                    <section
                        className="client-invoices-summary"
                        aria-label="Invoice summary"
                    >
                        {summaries.map(
                            ([label, value]) => (
                                <div
                                    className="client-invoices-stat"
                                    key={label}
                                >
                                    <Receipt
                                        size={23}
                                        aria-hidden="true"
                                    />
                                    <div>
                                        <span>
                                            {label}
                                        </span>
                                        <strong>
                                            {value}
                                        </strong>
                                    </div>
                                </div>
                            )
                        )}
                    </section>

                    <p className="client-invoices-summary-note">
                        Unpaid invoice totals show the full
                        value of sent and overdue invoices,
                        before any partial payments.
                    </p>

                    <div className="client-invoices-toolbar">
                        <label className="client-invoices-search">
                            <Search
                                size={18}
                                aria-hidden="true"
                            />
                            <input
                                type="search"
                                aria-label="Search invoices"
                                placeholder="Search invoice number, service or notes…"
                                value={search}
                                onChange={(event) =>
                                    setSearch(
                                        event.target.value
                                    )
                                }
                            />
                        </label>

                        <div
                            className="client-invoices-filters"
                            role="group"
                            aria-label="Filter invoices by status"
                        >
                            {FILTERS.map((value) => (
                                <button
                                    type="button"
                                    key={value}
                                    aria-pressed={
                                        filter === value
                                    }
                                    onClick={() =>
                                        setFilter(value)
                                    }
                                >
                                    {value}{" "}
                                    <span>
                                        {value === "all"
                                            ? records.length
                                            : records.filter(
                                                  (
                                                      invoice
                                                  ) =>
                                                      invoice.displayStatus ===
                                                      value
                                              ).length}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <p
                        className="client-invoices-result-count"
                        role="status"
                    >
                        Showing {visible.length} of{" "}
                        {records.length} invoices
                    </p>

                    {visible.length ? (
                        <div className="client-invoices-grid">
                            {visible.map((invoice) => (
                                <InvoiceCard
                                    key={
                                        invoice.invoice_id
                                    }
                                    invoice={invoice}
                                    onView={(
                                        invoiceId
                                    ) =>
                                        navigate(
                                            `/client/invoices/${invoiceId}`
                                        )
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="client-invoices-state">
                            <Receipt
                                size={32}
                                aria-hidden="true"
                            />
                            <h2>
                                {records.length
                                    ? "No matching invoices"
                                    : "No invoices yet"}
                            </h2>
                            <p>
                                {records.length
                                    ? "Try a different search or status filter."
                                    : "Invoices will appear here when your photographer sends them."}
                            </p>

                            {records.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch("");
                                        setFilter("all");
                                    }}
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
