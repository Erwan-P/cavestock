export function formatVintage(value: number) {
  return value === 0 ? "0000" : String(value);
}

export function validVintage(value: number, currentYear: number) {
  return Number.isInteger(value) && (value === 0 || (value >= 1900 && value <= currentYear));
}
