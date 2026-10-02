/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#F7F2E7',
    tint: '#D7B46A',
    background: '#0B1914',
    foreground: '#F7F2E7',
    card: '#14271F',
    cardForeground: '#F7F2E7',
    primary: '#D7B46A',
    primaryForeground: '#142016',
    secondary: '#20372D',
    secondaryForeground: '#EDE5D5',
    muted: '#172A22',
    mutedForeground: '#A8B8AC',
    accent: '#244735',
    accentForeground: '#F7F2E7',
    destructive: '#C85A51',
    destructiveForeground: '#FFFFFF',
    border: '#315140',
    input: '#315140',
  },

  radius: 14,
};

export default colors;
