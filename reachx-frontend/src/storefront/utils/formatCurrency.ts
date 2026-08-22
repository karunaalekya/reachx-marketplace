// Every price on the backend (Product.price, OrderResponse amounts, etc.) is a plain BigDecimal
// serialized as a JSON number - no currency/locale metadata attached. The storefront is India-only
// per the checkout form's `customerState`/GST fields, so INR + en-IN grouping (lakh/crore commas)
// is the correct fixed choice here, not a guess.
const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  return formatter.format(amount);
}
