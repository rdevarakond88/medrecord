/**
 * Display formatters for the MedRecord UI.
 * All date display uses DD/MM/YYYY (Indian standard — ui-ux-spec.md).
 */

/**
 * Format a 10-digit Indian mobile number as "+91 XXXXX XXXXX".
 * mask=true shows only the last 5 digits — used in list views to protect PII
 * visible to bystanders in shared clinic waiting areas.
 */
export function formatMobile(mobile: string, mask = false): string {
  if (mask) return `+91 ••••• ${mobile.slice(5)}`;
  return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
}

/**
 * Extract up to 2 initials from a full name.
 * "Ramesh Kumar Yadav" → "RK"
 */
export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Convert an ISO date string (YYYY-MM-DD) to Indian display format (DD/MM/YYYY).
 * Returns null for null input so callers can decide whether to render the field.
 */
export function formatDateForDisplay(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Convert an ISO 8601 timestamp to "DD/MM/YYYY · H:MM AM/PM" display format.
 * Used in D4 record cards to show when a note or scan was created.
 * Returns the raw string unchanged if parsing fails (graceful degradation).
 */
export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day    = String(d.getDate()).padStart(2, '0');
    const month  = String(d.getMonth() + 1).padStart(2, '0');
    const year   = d.getFullYear();
    const hours  = d.getHours();
    const mins   = String(d.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    const h12    = hours % 12 || 12;
    return `${day}/${month}/${year} · ${h12}:${mins} ${period}`;
  } catch {
    return iso;
  }
}
