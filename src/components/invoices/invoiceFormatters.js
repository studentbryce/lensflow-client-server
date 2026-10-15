export function formatInvoiceCurrency(value) {
    return new Intl.NumberFormat("en-NZ", {
        style: "currency",
        currency: "NZD",
    }).format(Number(value) || 0);
}

export function formatInvoiceDate(date) {
    if (!date) return "—";

    return new Date(`${date}T00:00:00`).toLocaleDateString("en-NZ", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
}

export function formatInvoiceTime(time) {
    if (!time) return "—";

    return new Date(`1970-01-01T${time}`).toLocaleTimeString("en-NZ", {
        hour: "numeric",
        minute: "2-digit",
    });
}

export function formatInvoiceStatus(status) {
    if (!status) return "Unknown";

    return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getInvoiceClientName(profile) {
    if (!profile) return "Unknown Client";

    const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return fullName || profile.email || "Unknown Client";
}
