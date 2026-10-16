import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetPhotographerInvoiceOptions, apiCreatePhotographerInvoice } from "../../services/photographerInvoicesApi";
import { useAuth } from "../../context/authStore";
import "./NewInvoice.css";

const EMPTY_ITEM = {
    service_id: "",
    description: "",
    quantity: 1,
    unit_price: "",
};

function formatCurrency(value) {
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(Number(value || 0));
}

function getClientName(profile) {
    if (!profile) return "Unknown Client";

    const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return fullName || profile.email || "Unknown Client";
}

function getToday() {
    return new Date().toISOString().split("T")[0];
}

function createInvoiceNumber() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const random = Math.floor(1000 + Math.random() * 9000);

    return `INV-${year}${month}${day}-${random}`;
}

function formatDate(date) {
    if (!date) return "—";

    return new Date(`${date}T00:00:00`).toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export default function NewInvoice() {
    const { user } = useAuth();
    return <NewInvoiceContent key={user?.id ?? "guest"} user={user} />;
}

function NewInvoiceContent({ user }) {
    const navigate = useNavigate();

    const [clients, setClients] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [services, setServices] = useState([]);

    const [formData, setFormData] = useState({
        client_id: "",
        booking_id: "",
        invoice_number: createInvoiceNumber(),
        issue_date: getToday(),
        due_date: "",
        status: "draft",
        tax_rate: 15,
        tax_included: false,
        notes: "",
    });

    const [items, setItems] = useState([
        {
            ...EMPTY_ITEM,
        },
    ]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    /*
     * Load all data required to create an invoice.
     *
     * Ownership is enforced by Supabase RLS. We do not rely on
     * client-side photographer_id filtering for security.
     */
    useEffect(() => {
        // Loading is initially true; only asynchronous responses update state.
        // Ignore results from an old session if the authenticated user changes.
        if (!user?.id) return;
        let active = true;

        async function loadInvoiceData() {
            try {
                const { data } = await apiGetPhotographerInvoiceOptions();
                if (!active) return;
                const clientData = data.clients || [];
                const bookingData = data.bookings || [];
                const serviceData = data.services || [];
                setClients(clientData);
                setBookings(bookingData);
                setServices(serviceData);
                setFormData(current => ({ ...current, tax_rate: String(data.default_tax_rate ?? 15) }));

                const searchParams = new URLSearchParams(window.location.search);
                const requestedBookingId = searchParams.get("booking_id");
                const requestedClientId = searchParams.get("client_id");
                if (requestedBookingId) {
                    const selected = bookingData.find(b => b.booking_id === requestedBookingId);
                    if (selected && (!requestedClientId || selected.client_id === requestedClientId)) {
                        setFormData(current => ({ ...current, client_id: selected.client_id, booking_id: selected.booking_id }));
                        const bookedService = serviceData.find(s => s.service_id === selected.service_id);
                        if (bookedService) setItems([{ service_id: bookedService.service_id,
                            description: bookedService.description || bookedService.name || "",
                            quantity: 1, unit_price: selected.total_amount ?? bookedService.price ?? "" }]);
                    }
                }
            } catch (err) {
                if (!active) return;
                console.error("Error loading invoice data:", err);
                setError(err.message || "Unable to load invoice options.");
            } finally {
                if (active) setLoading(false);
            }
        }

        void loadInvoiceData();
        return () => { active = false; };
    }, [user?.id]);

    const selectedClientBookings = useMemo(() => {
        if (!formData.client_id) return [];

        return bookings.filter(
            (booking) => booking.client_id === formData.client_id
        );
    }, [bookings, formData.client_id]);

    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => {
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;

            return sum + quantity * unitPrice;
        }, 0);
    }, [items]);

    /*
     * GST calculation.
     *
     * If GST is excluded:
     * $1,000 + 15% GST = $1,150 total.
     *
     * If GST is included:
     * $1,000 total contains $130.43 GST.
     */
    const taxAmount = useMemo(() => {
        const rate = Number(formData.tax_rate) || 0;

        if (formData.tax_included) {
            if (rate === 0) return 0;

            return subtotal * (rate / (100 + rate));
        }

        return subtotal * (rate / 100);
    }, [subtotal, formData.tax_rate, formData.tax_included]);

    const totalAmount = useMemo(() => {
        if (formData.tax_included) {
            return subtotal;
        }

        return subtotal + taxAmount;
    }, [subtotal, taxAmount, formData.tax_included]);

    function handleChange(event) {
        const { name, value } = event.target;

        setFormData((current) => ({
            ...current,
            [name]: value,
        }));

        setError("");
        setSuccess("");
    }

    function handleClientChange(event) {
        const clientId = event.target.value;

        setFormData((current) => ({
            ...current,
            client_id: clientId,
            booking_id: "",
        }));

        setError("");
        setSuccess("");
    }

    /*
     * Selecting a booking automatically adds the service attached to that
     * booking as an invoice item. This avoids making the photographer select
     * the booking and then select the same service again.
     *
     * If the invoice still contains its original empty item, that row is
     * replaced. If the photographer has already entered other line items, the
     * booked service is added without removing their existing work.
     */
    function handleBookingChange(event) {
        const bookingId = event.target.value;

        setFormData((current) => ({
            ...current,
            booking_id: bookingId,
        }));

        setError("");
        setSuccess("");

        if (!bookingId) return;

        const selectedBooking = selectedClientBookings.find(
            (booking) => booking.booking_id === bookingId
        );

        if (!selectedBooking?.service_id) return;

        const bookedService = services.find(
            (service) => service.service_id === selectedBooking.service_id
        );

        if (!bookedService) {
            setError(
                "The booking was selected, but its service could not be loaded. You can still add the invoice item manually."
            );
            return;
        }

        const bookedServiceItem = {
            service_id: bookedService.service_id,
            description:
                bookedService.description || bookedService.name || "",
            quantity: 1,
            unit_price:
                selectedBooking.total_amount ?? bookedService.price ?? "",
        };

        setItems((current) => {
            const alreadyAdded = current.some(
                (item) => item.service_id === bookedService.service_id
            );

            if (alreadyAdded) return current;

            const emptyItemIndex = current.findIndex((item) => {
                const description = String(item.description || "").trim();
                const hasPrice =
                    item.unit_price !== "" && item.unit_price !== null;

                return !item.service_id && !description && !hasPrice;
            });

            if (emptyItemIndex !== -1) {
                return current.map((item, index) =>
                    index === emptyItemIndex ? bookedServiceItem : item
                );
            }

            return [...current, bookedServiceItem];
        });
    }

    function handleTaxIncludedChange(value) {
        setFormData((current) => ({
            ...current,
            tax_included: value,
        }));

        setError("");
        setSuccess("");
    }

    function handleServiceChange(index, serviceId) {
        const selectedService = services.find(
            (service) => service.service_id === serviceId
        );

        setItems((current) =>
            current.map((item, itemIndex) => {
                if (itemIndex !== index) return item;

                if (!selectedService) {
                    return {
                        ...item,
                        service_id: "",
                    };
                }

                return {
                    ...item,
                    service_id: selectedService.service_id,
                    description:
                        selectedService.description ||
                        selectedService.name ||
                        "",
                    unit_price: selectedService.price ?? "",
                };
            })
        );

        setError("");
        setSuccess("");
    }

    function handleItemChange(index, field, value) {
        setItems((current) =>
            current.map((item, itemIndex) =>
                itemIndex === index
                    ? {
                        ...item,
                        [field]: value,
                    }
                    : item
            )
        );

        setError("");
        setSuccess("");
    }

    function addItem() {
        setItems((current) => [
            ...current,
            {
                ...EMPTY_ITEM,
            },
        ]);

        setError("");
    }

    function removeItem(index) {
        if (items.length === 1) {
            setError("An invoice must contain at least one invoice item.");
            return;
        }

        setItems((current) =>
            current.filter((_, itemIndex) => itemIndex !== index)
        );

        setError("");
    }

    function validateForm() {
        if (!formData.client_id) {
            return "Please select a client.";
        }

        /*
         * booking_id is NOT NULL in the invoices database table,
         * therefore a booking is required when creating an invoice.
         */
        if (!formData.booking_id) {
            return "Please select a booking for this invoice.";
        }

        if (!formData.invoice_number.trim()) {
            return "Please enter an invoice number.";
        }

        if (!formData.issue_date) {
            return "Please enter an issue date.";
        }

        if (
            formData.due_date &&
            formData.due_date < formData.issue_date
        ) {
            return "The due date cannot be before the issue date.";
        }

        if (
            ![
                "draft",
                "sent",
                "paid",
                "overdue",
                "cancelled",
            ].includes(formData.status)
        ) {
            return "Please select a valid invoice status.";
        }

        const taxRate = Number(formData.tax_rate);

        if (
            Number.isNaN(taxRate) ||
            taxRate < 0 ||
            taxRate > 100
        ) {
            return "GST rate must be between 0% and 100%.";
        }

        if (items.length === 0) {
            return "Please add at least one invoice item.";
        }

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];

            if (!item.description.trim()) {
                return `Please enter a description for invoice item ${index + 1}.`;
            }

            if (
                !Number.isInteger(Number(item.quantity)) ||
                Number(item.quantity) <= 0
            ) {
                return `Quantity for invoice item ${index + 1} must be a positive whole number.`;
            }

            if (
                item.unit_price === "" ||
                Number(item.unit_price) < 0
            ) {
                return `Unit price for invoice item ${index + 1} cannot be negative or empty.`;
            }
        }

        if (
            subtotal < 0 ||
            taxAmount < 0 ||
            totalAmount < 0
        ) {
            return "Invoice totals cannot be negative.";
        }

        return null;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const validationError = validateForm();
        if (validationError) { setError(validationError); return; }
        if (!user) { setError("You must be signed in to create an invoice."); return; }
        if (saving) return;
        try {
            setSaving(true);
            setError("");
            setSuccess("");
            await apiCreatePhotographerInvoice({
                client_id: formData.client_id,
                booking_id: formData.booking_id,
                invoice_number: formData.invoice_number.trim(),
                issue_date: formData.issue_date,
                due_date: formData.due_date || null,
                status: formData.status,
                tax_rate: Number(formData.tax_rate),
                tax_included: Boolean(formData.tax_included),
                notes: formData.notes,
                items: items.map(item => ({
                    service_id: item.service_id || null,
                    description: item.description,
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price),
                })),
            });
            setSuccess("Invoice created successfully.");
            setTimeout(() => navigate("/photographer/invoices"), 700);
        } catch (err) {
            console.error("Error creating invoice:", err);
            setError(err.message || "Unable to create invoice. Check the list before retrying.");
        } finally { setSaving(false); }
    }

    if (loading && user?.id) {
        return (
            <main className="new-invoice-page">
                <div className="new-invoice-state">
                    <div className="new-invoice-spinner" />

                    <h2>Loading invoice form...</h2>

                    <p>
                        Preparing your clients, bookings and
                        services.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="new-invoice-page">
            <button
                type="button"
                className="new-invoice-back-button new-invoice-top-back"
                onClick={() =>
                    navigate(
                        "/photographer/invoices"
                    )
                }
            >
                ← Back to Invoices
            </button>

            <header className="new-invoice-header">
                <div>
                    <p className="new-invoice-eyebrow">
                        FINANCIAL MANAGEMENT
                    </p>

                    <h1>New Invoice</h1>

                    <p className="new-invoice-description">
                        Create an invoice for a photography
                        client and their booking.
                    </p>
                </div>

            </header>

            {error && (
                <div className="new-invoice-message error-message">
                    <strong>
                        Unable to create invoice
                    </strong>

                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="new-invoice-message success-message">
                    {success}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {/* =========================
                    SECTION 01
                ========================= */}

                <section className="invoice-form-section">
                    <div className="invoice-section-heading">
                        <span>01</span>

                        <div>
                            <h2>Client & Booking</h2>

                            <p>
                                Select the client and booking
                                associated with this invoice.
                            </p>
                        </div>
                    </div>

                    <div className="invoice-form-grid two-column">
                        <div className="invoice-field">
                            <label htmlFor="client_id">
                                Client <span>*</span>
                            </label>

                            <select
                                id="client_id"
                                name="client_id"
                                value={formData.client_id}
                                onChange={
                                    handleClientChange
                                }
                                required
                            >
                                <option value="">
                                    Select a client
                                </option>

                                {clients.map((client) => (
                                    <option
                                        key={
                                            client.client_id
                                        }
                                        value={
                                            client.client_id
                                        }
                                    >
                                        {getClientName(
                                            client.profile
                                        )}
                                    </option>
                                ))}
                            </select>

                            {clients.length === 0 && (
                                <small className="invoice-field-help">
                                    No clients are currently
                                    available.
                                </small>
                            )}
                        </div>

                        <div className="invoice-field">
                            <label htmlFor="booking_id">
                                Booking <span>*</span>
                            </label>

                            <select
                                id="booking_id"
                                name="booking_id"
                                value={formData.booking_id}
                                onChange={handleBookingChange}
                                disabled={
                                    !formData.client_id
                                }
                                required
                            >
                                <option value="">
                                    {formData.client_id
                                        ? "Select a booking"
                                        : "Select a client first"}
                                </option>

                                {selectedClientBookings.map(
                                    (booking) => (
                                        <option
                                            key={
                                                booking.booking_id
                                            }
                                            value={
                                                booking.booking_id
                                            }
                                        >
                                            {formatDate(
                                                booking.booking_date
                                            )}{" "}
                                            —{" "}
                                            {booking.status}
                                        </option>
                                    )
                                )}
                            </select>

                            <small className="invoice-field-help">
                                Only bookings belonging to
                                the selected client are shown.
                            </small>
                        </div>
                    </div>
                </section>

                {/* =========================
                    SECTION 02
                ========================= */}

                <section className="invoice-form-section">
                    <div className="invoice-section-heading">
                        <span>02</span>

                        <div>
                            <h2>Invoice Details</h2>

                            <p>
                                Set the invoice number, dates
                                and current status.
                            </p>
                        </div>
                    </div>

                    <div className="invoice-form-grid four-column">
                        <div className="invoice-field">
                            <label htmlFor="invoice_number">
                                Invoice Number <span>*</span>
                            </label>

                            <input
                                id="invoice_number"
                                name="invoice_number"
                                type="text"
                                value={
                                    formData.invoice_number
                                }
                                onChange={handleChange}
                                maxLength={50}
                                required
                            />
                        </div>

                        <div className="invoice-field">
                            <label htmlFor="issue_date">
                                Issue Date <span>*</span>
                            </label>

                            <input
                                id="issue_date"
                                name="issue_date"
                                type="date"
                                value={
                                    formData.issue_date
                                }
                                onChange={handleChange}
                                required
                            />
                        </div>

                        <div className="invoice-field">
                            <label htmlFor="due_date">
                                Due Date
                            </label>

                            <input
                                id="due_date"
                                name="due_date"
                                type="date"
                                value={
                                    formData.due_date
                                }
                                min={
                                    formData.issue_date
                                }
                                onChange={handleChange}
                            />
                        </div>

                        <div className="invoice-field">
                            <label htmlFor="status">
                                Status
                            </label>

                            <select
                                id="status"
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                            >
                                <option value="draft">
                                    Draft
                                </option>

                                <option value="sent">
                                    Sent
                                </option>

                                <option value="paid">
                                    Paid
                                </option>

                                <option value="overdue">
                                    Overdue
                                </option>

                                <option value="cancelled">
                                    Cancelled
                                </option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* =========================
                    SECTION 03
                ========================= */}

                <section className="invoice-form-section">
                    <div className="invoice-section-heading">
                        <span>03</span>

                        <div>
                            <h2>Invoice Items</h2>

                            <p>
                                Add photography services or
                                custom line items to this
                                invoice.
                            </p>
                        </div>
                    </div>

                    <div className="invoice-items">
                        <div className="invoice-item-header">
                            <span>Service</span>
                            <span>Description</span>
                            <span>Qty</span>
                            <span>Unit Price</span>
                            <span>Subtotal</span>
                            <span />
                        </div>

                        {items.map((item, index) => {
                            const itemSubtotal =
                                (Number(item.quantity) ||
                                    0) *
                                (Number(
                                    item.unit_price
                                ) || 0);

                            return (
                                <div
                                    className="invoice-item-row"
                                    key={index}
                                >
                                    <div className="invoice-item-mobile-label">
                                        Service
                                    </div>

                                    <select
                                        value={
                                            item.service_id
                                        }
                                        onChange={(event) =>
                                            handleServiceChange(
                                                index,
                                                event.target
                                                    .value
                                            )
                                        }
                                    >
                                        <option value="">
                                            Custom item
                                        </option>

                                        {services.map(
                                            (service) => (
                                                <option
                                                    key={
                                                        service.service_id
                                                    }
                                                    value={
                                                        service.service_id
                                                    }
                                                >
                                                    {
                                                        service.name
                                                    }
                                                </option>
                                            )
                                        )}
                                    </select>

                                    <div className="invoice-item-mobile-label">
                                        Description
                                    </div>

                                    <input
                                        type="text"
                                        value={
                                            item.description
                                        }
                                        placeholder="Photography service"
                                        onChange={(event) =>
                                            handleItemChange(
                                                index,
                                                "description",
                                                event.target
                                                    .value
                                            )
                                        }
                                        maxLength={255}
                                    />

                                    <div className="invoice-item-mobile-label">
                                        Quantity
                                    </div>

                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={
                                            item.quantity
                                        }
                                        onChange={(event) =>
                                            handleItemChange(
                                                index,
                                                "quantity",
                                                event.target
                                                    .value
                                            )
                                        }
                                    />

                                    <div className="invoice-item-mobile-label">
                                        Unit Price
                                    </div>

                                    <div className="invoice-price-input">
                                        <span>$</span>

                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={
                                                item.unit_price
                                            }
                                            placeholder="0.00"
                                            onChange={(event) =>
                                                handleItemChange(
                                                    index,
                                                    "unit_price",
                                                    event.target
                                                        .value
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="invoice-item-mobile-label">
                                        Subtotal
                                    </div>

                                    <strong className="invoice-item-subtotal">
                                        {formatCurrency(
                                            itemSubtotal
                                        )}
                                    </strong>

                                    <button
                                        type="button"
                                        className="remove-item-button"
                                        onClick={() =>
                                            removeItem(
                                                index
                                            )
                                        }
                                        aria-label={`Remove invoice item ${index + 1}`}
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        className="add-item-button"
                        onClick={addItem}
                    >
                        + Add Invoice Item
                    </button>
                </section>

                {/* =========================
                    SECTION 04
                ========================= */}

                <section className="invoice-form-section invoice-totals-section">
                    <div className="invoice-section-heading">
                        <span>04</span>

                        <div>
                            <h2>Totals</h2>

                            <p>
                                Review the invoice amount and
                                GST treatment.
                            </p>
                        </div>
                    </div>

                    <div className="invoice-totals-content">
                        <div className="invoice-tax-settings">
                            <div className="invoice-field">
                                <label htmlFor="tax_rate">
                                    GST Rate (%)
                                </label>

                                <input
                                    id="tax_rate"
                                    name="tax_rate"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={
                                        formData.tax_rate
                                    }
                                    onChange={handleChange}
                                />

                                <span className="invoice-field-help">
                                    The GST rate applied to
                                    this invoice.
                                </span>
                            </div>

                            <div className="invoice-field">
                                <label>GST Pricing</label>

                                <div className="tax-options">
                                    <label
                                        className={`tax-option ${
                                            !formData.tax_included
                                                ? "selected"
                                                : ""
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="tax_included"
                                            checked={
                                                !formData.tax_included
                                            }
                                            onChange={() =>
                                                handleTaxIncludedChange(
                                                    false
                                                )
                                            }
                                        />

                                        <div>
                                            <strong>
                                                GST added to
                                                prices
                                            </strong>

                                            <span>
                                                GST is calculated
                                                on top of the
                                                service prices.
                                            </span>
                                        </div>
                                    </label>

                                    <label
                                        className={`tax-option ${
                                            formData.tax_included
                                                ? "selected"
                                                : ""
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="tax_included"
                                            checked={
                                                formData.tax_included
                                            }
                                            onChange={() =>
                                                handleTaxIncludedChange(
                                                    true
                                                )
                                            }
                                        />

                                        <div>
                                            <strong>
                                                GST included in
                                                prices
                                            </strong>

                                            <span>
                                                Service prices
                                                already include
                                                GST.
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="invoice-totals">
                            <div className="invoice-total-row">
                                <span>Subtotal</span>

                                <strong>
                                    {formatCurrency(
                                        subtotal
                                    )}
                                </strong>
                            </div>

                            <div className="invoice-total-row">
                                <span>
                                    GST (
                                    {Number(
                                        formData.tax_rate
                                    ).toFixed(2)}
                                    %)
                                    {formData.tax_included
                                        ? " included"
                                        : ""}
                                </span>

                                <strong>
                                    {formatCurrency(
                                        taxAmount
                                    )}
                                </strong>
                            </div>

                            <div className="invoice-total-row grand-total">
                                <span>Total</span>

                                <strong>
                                    {formatCurrency(
                                        totalAmount
                                    )}
                                </strong>
                            </div>
                        </div>
                    </div>
                </section>

                {/* =========================
                    SECTION 05
                ========================= */}

                <section className="invoice-form-section">
                    <div className="invoice-section-heading">
                        <span>05</span>

                        <div>
                            <h2>Notes</h2>

                            <p>
                                Add any additional information
                                for this invoice.
                            </p>
                        </div>
                    </div>

                    <div className="invoice-field">
                        <label htmlFor="notes">
                            Invoice Notes
                        </label>

                        <textarea
                            id="notes"
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            rows="5"
                            placeholder="Add payment instructions, terms or other notes..."
                        />
                    </div>
                </section>

                <div className="new-invoice-actions">
                    <button
                        type="button"
                        className="invoice-action secondary"
                        onClick={() =>
                            navigate(
                                "/photographer/invoices"
                            )
                        }
                        disabled={saving}
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        className="invoice-action primary"
                        disabled={saving}
                    >
                        {saving
                            ? "Creating Invoice..."
                            : "Create Invoice"}
                    </button>
                </div>
            </form>
        </main>
    );
}
