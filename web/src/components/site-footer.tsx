import Link from "next/link";

/**
 * Footer for the pages a visitor can reach without signing in.
 *
 * The legal pages live on the company site rather than being duplicated here:
 * one copy, and the one Anantio's own customers already see. A payment
 * gateway's review looks for these links from the page that takes payment, so
 * they belong on every public page rather than only the pricing one.
 */

const LEGAL = "https://anantio.com/legal";

const LINKS = [
  { href: "/pricing", label: "Pricing", external: false },
  { href: `${LEGAL}/terms-of-service.html`, label: "Terms", external: true },
  { href: `${LEGAL}/privacy-policy.html`, label: "Privacy", external: true },
  { href: `${LEGAL}/refund-policy.html`, label: "Refunds", external: true },
  { href: `${LEGAL}/cookie-policy.html`, label: "Cookies", external: true },
  { href: `${LEGAL}/data-deletion.html`, label: "Data deletion", external: true },
];

export function SiteFooter() {
  return (
    <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
      <nav className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {LINKS.map(({ href, label, external }) =>
          external ? (
            <a key={label} href={href} className="hover:text-foreground">
              {label}
            </a>
          ) : (
            <Link key={label} href={href} className="hover:text-foreground">
              {label}
            </Link>
          ),
        )}
      </nav>

      {/* The registered entity, as it appears on the payment gateway account.
          A reviewer checks that these match. */}
      <p>
        Abiz is a product of <strong>Anantio Pvt Ltd</strong>
      </p>
      <p className="mt-1">
        <a href="mailto:connect@anantio.com" className="hover:text-foreground">
          connect@anantio.com
        </a>
        {" · "}
        <a href="tel:+919500815182" className="hover:text-foreground">
          +91 95008 15182
        </a>
      </p>
    </footer>
  );
}
