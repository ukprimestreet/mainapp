import { OG_SIZE, ogCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "PrimeStreet — London's Businesses. Stories. People.";

export default function Image() {
  return ogCard({ kicker: "London business media", title: "London's Businesses. Stories. People." });
}
