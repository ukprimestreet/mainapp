/** PS mark geometry (100x100 box). Pure strokes so it renders identically everywhere, no font needed. */
export const PS_PATHS = {
  p: "M19 18 V76 M19 24 H29 A12 12 0 0 1 29 48 H19",
  s: "M79.5 30.8 A11.5 11.5 0 1 0 69 47 A11.5 11.5 0 1 1 58.5 63.2",
};
export const BRAND = { yellow: "#FFD400", black: "#0A0A0A", white: "#FFFFFF" };

export function psSvg(bg: string = BRAND.yellow, fg: string = BRAND.black, rounded = true) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" ${rounded ? 'rx="22"' : ""} fill="${bg}"/><g fill="none" stroke="${fg}" stroke-width="12" stroke-linejoin="miter"><path d="${PS_PATHS.p}"/><path d="${PS_PATHS.s}"/></g></svg>`;
}
