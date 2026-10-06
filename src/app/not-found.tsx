import { Button, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-8xl font-extrabold">404</p>
      <h1 className="mt-2 text-3xl font-extrabold">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-grey">It may have moved, or never existed.</p>
      <div className="mt-8 flex justify-center gap-3"><Button href="/">Go home</Button><Button href="/businesses" variant="dark">Browse businesses</Button></div>
    </Container>
  );
}
