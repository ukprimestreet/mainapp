import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PrimeStreet", short_name: "PrimeStreet", description: "London's Businesses. Stories. People.",
    start_url: "/", display: "standalone", background_color: "#0A0A0A", theme_color: "#FFD400",
    icons: [
      { src: "/icons/ps-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/ps-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
