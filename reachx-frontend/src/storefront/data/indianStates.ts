// Fixed dropdown source, not free text - scope call made explicitly in the Session 2 brief.
// `customerState` on POST /orders drives CGST+SGST vs IGST server-side (per the session plan);
// a typo'd free-text state would silently produce the wrong tax split with no client-side way to
// catch it. A dropdown makes a misspelled state name structurally impossible to submit.
//
// Values are the plain state/UT names as a guest would recognise them - if the real backend's
// GST engine expects a specific enum/code format instead of the display name (e.g. ISO 3166-2:IN
// codes), confirm that against the real `POST /orders` handler before wiring Session 3 rather
// than assuming these display strings are already what the server wants.
export const INDIAN_STATES_AND_UTS: string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];
