import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetPhotographerInvoices } from "../../services/photographerInvoicesApi";
import { useAuth } from "../../context/AuthContext";
import "./Invoices.css";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

function formatCurrency(value) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(Number(value || 0));
}

function formatDate(date) {
  if (!date) return "—";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getClientName(profile) {
  if (!profile) return "Unknown Client";

  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || profile.email || "Unknown Client";
}

function getInitials(name) {
  if (!name || name === "Unknown Client") return "?";

  const parts = name.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function getStatusLabel(status) {
  return (
    STATUS_OPTIONS.find((option) => option.value === status)?.label ||
    status ||
    "Unknown"
  );
}

function InvoiceCard({ invoice, onView, onEdit }) {
  const clientName = getClientName(invoice.clientProfile);
  const isOverdue =
    invoice.status === "overdue" ||
    (invoice.status === "sent" &&
      invoice.due_date &&
      new Date(`${invoice.due_date}T23:59:59`) < new Date());

  const displayStatus = isOverdue ? "overdue" : invoice.status;

  return (
    <article className="invoice-card">
      <div className="invoice-card-top">
        <div>
          <span className="invoice-number">
            {invoice.invoice_number || `INV-${invoice.invoice_id}`}
          </span>

          <span className={`invoice-status ${displayStatus}`}>
            {getStatusLabel(displayStatus)}
          </span>
        </div>

        <div className="invoice-total">
          {formatCurrency(invoice.total_amount)}
        </div>
      </div>

      <div className="invoice-client">
        <div className="invoice-avatar">
          {getInitials(clientName)}
        </div>

        <div>
          <h3>{clientName}</h3>
          <p>{invoice.clientProfile?.email || "No email available"}</p>
        </div>
      </div>

      <div className="invoice-details">
        <div className="invoice-detail">
          <span>Booking</span>
          <strong>
            {invoice.booking
              ? formatDate(invoice.booking.booking_date)
              : "No booking"}
          </strong>
        </div>

        <div className="invoice-detail">
          <span>Issued</span>
          <strong>{formatDate(invoice.issue_date)}</strong>
        </div>

        <div className="invoice-detail">
          <span>Due</span>
          <strong className={isOverdue ? "overdue-date" : ""}>
            {formatDate(invoice.due_date)}
          </strong>
        </div>

        <div className="invoice-detail">
          <span>Subtotal</span>
          <strong>{formatCurrency(invoice.subtotal)}</strong>
        </div>
      </div>

      {invoice.notes && (
        <div className="invoice-note">
          <span>Note</span>
          <p>{invoice.notes}</p>
        </div>
      )}

      <div className="invoice-card-actions">
        <button
          type="button"
          className="invoice-button secondary"
          onClick={() => onView(invoice.invoice_id)}
        >
          View Invoice
        </button>

        <button
          type="button"
          className="invoice-button primary"
          onClick={() => onEdit(invoice.invoice_id)}
        >
          Edit
        </button>
      </div>
    </article>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invoices, setInvoices] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    fetchInvoices();
  }, [user]);

  async function fetchInvoices() {
    try {
      setLoading(true);
      setError("");
      const result = await apiGetPhotographerInvoices();
      setInvoices(result.data || []);
    } catch (err) {
      console.error("Error loading invoices:", err);
      setError(err.message || "Unable to load invoices. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const filteredInvoices = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const clientName = getClientName(invoice.clientProfile);

      const matchesSearch =
        !search ||
        invoice.invoice_number?.toLowerCase().includes(search) ||
        clientName.toLowerCase().includes(search) ||
        invoice.clientProfile?.email?.toLowerCase().includes(search) ||
        invoice.notes?.toLowerCase().includes(search);

      const isOverdue =
        invoice.status === "overdue" ||
        (invoice.status === "sent" &&
          invoice.due_date &&
          new Date(`${invoice.due_date}T23:59:59`) < new Date());

      const effectiveStatus = isOverdue ? "overdue" : invoice.status;

      const matchesStatus =
        statusFilter === "all" || effectiveStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    let totalValue = 0;
    let paidValue = 0;
    let outstandingValue = 0;
    let overdueValue = 0;

    invoices.forEach((invoice) => {
      const total = Number(invoice.total_amount || 0);

      totalValue += total;

      if (invoice.status === "paid") {
        paidValue += total;
      } else {
        outstandingValue += total;

        const isOverdue =
          invoice.status === "overdue" ||
          (invoice.status === "sent" &&
            invoice.due_date &&
            new Date(`${invoice.due_date}T23:59:59`) < new Date());

        if (isOverdue) {
          overdueValue += total;
        }
      }
    });

    return {
      totalInvoices: invoices.length,
      totalValue,
      paidValue,
      outstandingValue,
      overdueValue,
    };
  }, [invoices]);

  const handleView = (invoiceId) => {
    navigate(`/photographer/invoices/${invoiceId}`);
  };

  const handleEdit = (invoiceId) => {
    navigate(`/photographer/invoices/${invoiceId}/edit`);
  };

  return (
    <main className="invoices-page">
      <header className="invoices-header">
        <div>
          <p className="invoices-eyebrow">FINANCIAL MANAGEMENT</p>
          <h1>Invoices</h1>
          <p className="invoices-description">
            Create, manage and track invoices for your photography business.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/photographer/invoices/new")}
        >
          <span>+</span>
          New Invoice
        </button>
      </header>

      <section className="invoice-summary-grid">
        <div className="invoice-summary-card">
          <span className="summary-label">Total Invoices</span>
          <strong>{summary.totalInvoices}</strong>
          <p>All invoices</p>
        </div>

        <div className="invoice-summary-card">
          <span className="summary-label">Invoiced</span>
          <strong>{formatCurrency(summary.totalValue)}</strong>
          <p>Total invoice value</p>
        </div>

        <div className="invoice-summary-card">
          <span className="summary-label">Paid</span>
          <strong>{formatCurrency(summary.paidValue)}</strong>
          <p>Completed payments</p>
        </div>

        <div className="invoice-summary-card">
          <span className="summary-label">Outstanding</span>
          <strong>{formatCurrency(summary.outstandingValue)}</strong>
          <p>Awaiting payment</p>
        </div>

        <div className="invoice-summary-card warning">
          <span className="summary-label">Overdue</span>
          <strong>{formatCurrency(summary.overdueValue)}</strong>
          <p>Payment overdue</p>
        </div>
      </section>

      <section className="invoice-controls">
        <div className="invoice-search">
          <span className="search-icon">⌕</span>
          <input
            type="search"
            placeholder="Search invoices, clients or email..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="invoice-filters">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`invoice-filter ${statusFilter === option.value ? "active" : ""
                }`}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {loading && (
        <div className="invoice-state">
          <div className="invoice-spinner" />
          <h2>Loading invoices...</h2>
          <p>Retrieving your invoice information.</p>
        </div>
      )}

      {!loading && error && (
        <div className="invoice-state error-state">
          <h2>Unable to load invoices</h2>
          <p>{error}</p>

          <button
            type="button"
            className="invoice-button primary"
            onClick={fetchInvoices}
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && invoices.length === 0 && (
        <div className="invoice-state">
          <div className="empty-invoice-icon">£</div>
          <h2>No invoices yet</h2>
          <p>
            Create your first invoice to start tracking payments from
            your photography clients.
          </p>

          <button
            type="button"
            className="invoice-button primary"
            onClick={() => navigate("/photographer/invoices/new")}
          >
            + Create Invoice
          </button>
        </div>
      )}

      {!loading &&
        !error &&
        invoices.length > 0 &&
        filteredInvoices.length === 0 && (
          <div className="invoice-state">
            <h2>No matching invoices</h2>
            <p>
              Try changing your search term or selecting a different
              status.
            </p>

            <button
              type="button"
              className="invoice-button secondary"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
              }}
            >
              Clear Filters
            </button>
          </div>
        )}

      {!loading &&
        !error &&
        filteredInvoices.length > 0 && (
          <section className="invoice-grid">
            {filteredInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.invoice_id}
                invoice={invoice}
                onView={handleView}
                onEdit={handleEdit}
              />
            ))}
          </section>
        )}
    </main>
  );
}