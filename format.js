function formatDateForFilename(date) {
  const parts = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ];
  return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}-${parts[5]}`;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMinutes(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} min`;
}

function formatArea(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatFeetInches(inches) {
  const rounded = Math.round(inches);
  const feet = Math.floor(rounded / 12);
  const inch = rounded % 12;
  if (!feet) return `${inch} in`;
  if (!inch) return `${feet} ft`;
  return `${feet} ft ${inch} in`;
}

function formatDegrees(value) {
  const rounded = Math.round(normalizeDegrees(value));
  return `${rounded} deg`;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

export {
  formatDateForFilename,
  formatMoney,
  formatMinutes,
  formatArea,
  formatFeetInches,
  formatDegrees,
  normalizeDegrees,
};
