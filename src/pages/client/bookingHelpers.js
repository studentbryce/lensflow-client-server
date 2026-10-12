export function formatCurrency(value) {
  return value == null ? "To be confirmed" : new Intl.NumberFormat("en-NZ", {
    style: "currency", currency: "NZD",
  }).format(value);
}

export function formatDate(value) {
  const date = value ? new Date(`${value}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })
    : "To be confirmed";
}

export function formatTime(value) {
  if (!value) return "To be confirmed";
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "pm" : "am"}`;
}

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function calculateEndTime(start, duration) {
  if (!start || !Number.isInteger(Number(duration)) || Number(duration) <= 0) return "";
  const [hours, minutes] = start.split(":").map(Number);
  const total = hours * 60 + minutes + Number(duration);
  if (!Number.isFinite(total) || total >= 1440) return "";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
