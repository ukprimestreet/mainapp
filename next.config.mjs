// One canonical hostname: www.primestreet.uk permanently redirects to the bare primestreet.uk, so the same
// page is never served on two hosts. Done here rather than in Vercel's domain settings so it travels with the
// code. NOTE: do not also set an apex-to-www redirect in Vercel, or the two would bounce off each other.
const WWW_TO_APEX = {
  source: "/:path*",
  has: [{ type: "host", value: "www.primestreet.uk" }],
  destination: "https://primestreet.uk/:path*",
  permanent: true,
};

export default {
  poweredByHeader: false,
  async redirects() {
    return [WWW_TO_APEX];
  },
};
