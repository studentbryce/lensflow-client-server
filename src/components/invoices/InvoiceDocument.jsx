import { Link } from "react-router-dom";
import "./InvoiceDocument.css";

import {
    formatInvoiceCurrency,
    formatInvoiceDate,
    formatInvoiceTime,
    formatInvoiceStatus,
    getInvoiceClientName,
} from "./invoiceFormatters";

export default function InvoiceDocument({
    invoice,
    items = [],
    clientProfile = null,
    booking = null,
    service = null,
    photographerProfile = null,
    bookingLink = "",
}) {
    if (!invoice) return null;

    const status = invoice.displayStatus || invoice.status;
    const taxRate = Number(invoice.tax_rate) || 0;
    const clientName = getInvoiceClientName(clientProfile);
    const businessName =
        photographerProfile?.business_name || "Photography Business";

    const taxDescription = invoice.tax_included
        ? `${taxRate.toFixed(2)}% GST included`
        : `${taxRate.toFixed(2)}% GST added`;

    return (
        <article className="shared-invoice-document">
            <header className="shared-invoice-document-header">
                <div className="shared-invoice-brand">
                    <span className="shared-invoice-business-name">
                        {businessName}
                    </span>

                    <span className="shared-invoice-document-label">
                        Invoice
                    </span>

                    <h2>{invoice.invoice_number}</h2>

                    <span
                        className={`shared-invoice-status status-${status}`}
                    >
                        {formatInvoiceStatus(status)}
                    </span>
                </div>

                <div className="shared-invoice-document-meta">
                    <div>
                        <span>Issue Date</span>
                        <strong>
                            {formatInvoiceDate(invoice.issue_date)}
                        </strong>
                    </div>

                    <div>
                        <span>Due Date</span>
                        <strong
                            className={
                                status === "overdue"
                                    ? "shared-invoice-overdue"
                                    : ""
                            }
                        >
                            {invoice.due_date
                                ? formatInvoiceDate(invoice.due_date)
                                : "No due date"}
                        </strong>
                    </div>

                    {invoice.tax_number && (
                        <div>
                            <span>GST / Tax Number</span>
                            <strong>{invoice.tax_number}</strong>
                        </div>
                    )}
                </div>
            </header>

            <div className="shared-invoice-information-grid">
                <section className="shared-invoice-info-block">
                    <span className="shared-invoice-info-label">
                        Billed To
                    </span>

                    <h3>{clientName}</h3>

                    {clientProfile?.email && (
                        <p>{clientProfile.email}</p>
                    )}

                    {clientProfile?.phone && (
                        <p>{clientProfile.phone}</p>
                    )}
                </section>

                <section className="shared-invoice-info-block">
                    <span className="shared-invoice-info-label">
                        Booking
                    </span>

                    {booking ? (
                        <>
                            <h3>
                                {service?.name ||
                                    booking?.services?.name ||
                                    "Photography Booking"}
                            </h3>

                            <p>
                                {formatInvoiceDate(
                                    booking.booking_date
                                )}
                            </p>

                            {booking.start_time && (
                                <p>
                                    {formatInvoiceTime(
                                        booking.start_time
                                    )}
                                    {booking.end_time &&
                                        ` – ${formatInvoiceTime(
                                            booking.end_time
                                        )}`}
                                </p>
                            )}

                            {booking.location && (
                                <p>{booking.location}</p>
                            )}

                            {bookingLink && (
                                <Link
                                    to={bookingLink}
                                    className="shared-invoice-booking-link"
                                >
                                    View booking →
                                </Link>
                            )}
                        </>
                    ) : (
                        <h3>No booking information</h3>
                    )}
                </section>
            </div>

            <section className="shared-invoice-items-section">
                <div className="shared-invoice-section-heading">
                    <div>
                        <span className="shared-invoice-info-label">
                            Charges
                        </span>
                        <h3>Services & Charges</h3>
                    </div>

                    <span>
                        {items.length}{" "}
                        {items.length === 1 ? "item" : "items"}
                    </span>
                </div>

                {items.length > 0 ? (
                    <div
                        className="shared-invoice-table-scroll"
                        tabIndex={0}
                        role="region"
                        aria-label={`Items for invoice ${invoice.invoice_number}`}
                    >
                        <table className="shared-invoice-items-table">
                            <thead>
                                <tr>
                                    <th scope="col">Description</th>
                                    <th scope="col">Qty</th>
                                    <th scope="col">Unit Price</th>
                                    <th scope="col">Amount</th>
                                </tr>
                            </thead>

                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.invoice_item_id}>
                                        <td>
                                            <strong>
                                                {item.description}
                                            </strong>
                                        </td>
                                        <td>
                                            {Number(item.quantity) || 0}
                                        </td>
                                        <td>
                                            {formatInvoiceCurrency(
                                                item.unit_price
                                            )}
                                        </td>
                                        <td>
                                            {formatInvoiceCurrency(
                                                item.subtotal
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="shared-invoice-empty-items">
                        No itemised charges are available.
                    </div>
                )}
            </section>

            <div className="shared-invoice-bottom-section">
                <div className="shared-invoice-tax-information">
                    <span className="shared-invoice-info-label">
                        GST Treatment
                    </span>

                    <strong>{taxDescription}</strong>

                    <p>
                        {invoice.tax_included
                            ? "Service prices already include GST. The GST component is shown separately."
                            : "GST is calculated on top of the service prices."}
                    </p>
                </div>

                <dl className="shared-invoice-totals">
                    <div>
                        <dt>Subtotal</dt>
                        <dd>
                            {formatInvoiceCurrency(
                                invoice.subtotal
                            )}
                        </dd>
                    </div>

                    <div>
                        <dt>
                            GST ({taxRate.toFixed(2)}%)
                            {invoice.tax_included
                                ? " included"
                                : ""}
                        </dt>
                        <dd>
                            {formatInvoiceCurrency(
                                invoice.tax_amount
                            )}
                        </dd>
                    </div>

                    <div className="shared-invoice-grand-total">
                        <dt>Total (NZD)</dt>
                        <dd>
                            {formatInvoiceCurrency(
                                invoice.total_amount
                            )}
                        </dd>
                    </div>
                </dl>
            </div>

            {invoice.bank_account_name &&
                invoice.bank_account_number && (
                    <section className="shared-invoice-payment-section">
                        <span className="shared-invoice-info-label">
                            Bank Transfer Details
                        </span>

                        <div className="shared-invoice-payment-details">
                            <div>
                                <span>Account Name</span>
                                <strong>
                                    {invoice.bank_account_name}
                                </strong>
                            </div>

                            {invoice.bank_name && (
                                <div>
                                    <span>Bank</span>
                                    <strong>
                                        {invoice.bank_name}
                                    </strong>
                                </div>
                            )}

                            <div>
                                <span>Account Number</span>
                                <strong>
                                    {invoice.bank_account_number}
                                </strong>
                            </div>
                        </div>

                        {invoice.bank_payment_instructions && (
                            <p>
                                {
                                    invoice.bank_payment_instructions
                                }
                            </p>
                        )}
                    </section>
                )}

            {invoice.notes && (
                <section className="shared-invoice-notes-section">
                    <span className="shared-invoice-info-label">
                        Notes
                    </span>
                    <p>{invoice.notes}</p>
                </section>
            )}

            {["sent", "overdue"].includes(status) && (
                <p className="shared-invoice-payment-help">
                    Please contact your photographer if you have
                    questions about this invoice or its payment
                    instructions.
                </p>
            )}
        </article>
    );
}
