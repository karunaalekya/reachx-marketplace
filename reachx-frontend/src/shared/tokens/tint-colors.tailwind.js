// Partial config - only the `colors.tint` block that VerificationBadgeStack and
// KycVerificationPanel depend on. Merge this into the project's real tailwind.config.js
// alongside brand/surface tokens already defined there - this file intentionally does not
// redeclare fontFamily/brand/surface since those already exist and redeclaring them here risks
// silently overwriting the real values with guesses.
//
// This is the single canonical hex set for the three status tints, referenced only via classes
// like `bg-tint-chilli-bg` - never as arbitrary hex (`bg-[#EBF5F0]`). That was issue #3 in
// FRONTEND_STATE.md: two different hex sets had drifted into use for the same three states
// across earlier passes. Defining them exactly once here, and having every status-rendering
// component import from these names instead of hand-picking hex, is what actually prevents that
// drift from recurring - not a one-time fix to the components that used the wrong hex.
//
// bg/border are the exact client-confirmed hex from design-system-reference.md (locked this
// session). `text` was NOT part of that contract - it only specified bg/border per tint. Derived
// here at roughly half the border's RGB values, the same darkening ratio the prior placeholder
// set already used (e.g. old neem: border #3F9B6B -> text #1F5C3D). Flag for a real design
// review if an exact text hex gets specified later - these three are a reasonable inference, not
// a confirmed value.
module.exports.tintColors = {
  tint: {
    neem: { bg: "#EBF5F0", border: "#0D7A4D", text: "#063D26" },
    chilli: { bg: "#FEF3F2", border: "#D92D20", text: "#6C1610" },
    saffron: { bg: "#FFF6ED", border: "#E05A10", text: "#702D08" },
    // Not part of the client hex contract - still a placeholder, kept neutral/desaturated on
    // purpose so it doesn't compete with the three real status colors above.
    muted: { bg: "#F3F3F1", border: "#B7B4AC", text: "#5C594F" },
  },
};
