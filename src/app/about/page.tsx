import { Container, PageHeader } from "@/components/ui";
import { meta } from "@/lib/seo";

export const metadata = meta({ title: "About PrimeStreet", description: "PrimeStreet tells the stories of the businesses, entrepreneurs and people shaping London.", path: "/about" });

export default function About() {
  return (
    <>
      <PageHeader ld kicker="About" title="London's businesses. Stories. People." intro="PrimeStreet is a London business media and discovery platform: news, interviews and guides alongside a local directory." crumbs={[{ name: "Home", href: "/" }, { name: "About" }]} />
      <Container className="max-w-3xl space-y-6 py-10 text-lg leading-relaxed">
        <p>We cover London businesses because they are interesting, useful or newsworthy — never because they pay.</p>
        <h2 id="standards" className="pt-4 font-display text-3xl font-extrabold">Editorial standards</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Editorial</strong> content is independent. Businesses cannot buy it.</li>
          <li><strong>Sponsored, Partner and Advertorial</strong> content is always clearly labelled.</li>
          <li>If PrimeStreet&apos;s founder has an interest in a business we feature, we say so on the page.</li>
          <li><strong>Unclaimed</strong> profiles are compiled by PrimeStreet from public information. They have not been verified or approved by the business.</li>
          <li><strong>Verified</strong> means the owner has proven their identity to us.</li>
          <li>We don&apos;t publish fake reviews, fake news or copied descriptions.</li>
        </ul>
        <h2 id="review-guidelines" className="pt-4 font-display text-3xl font-extrabold">Review guidelines</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Reviews must describe your own, first-hand experience. No financial or personal link to the business, and nothing received in return.</li>
          <li>Every review is confirmed by email and read by a moderator before it appears. We never sell, edit or remove reviews for payment.</li>
          <li>No spam, links, phone numbers, personal details about individuals, hate or abuse. Honest criticism is welcome.</li>
          <li>Businesses can respond publicly once their profile is claimed, and can report reviews, but cannot change or delete them.</li>
          <li>You can edit or permanently delete your review any time using the link we email you. Edits to a live review are re-checked.</li>
          <li>Anyone can report a review. Several independent reports hide it while we investigate.</li>
        </ul>
      </Container>
    </>
  );
}
