import Link from "next/link";
import { SITE_URLS } from "@/lib/site-config";

const PRODUCT_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Get Started" },
  { href: `${SITE_URLS.support}/login`, label: "Support" },
];

const PLATFORM_LINKS = [
  { href: SITE_URLS.customer, label: "Customer Portal" },
  { href: SITE_URLS.tenant, label: "Tenant Portal" },
  { href: SITE_URLS.support, label: "Support Portal" },
  { href: SITE_URLS.admin, label: "Admin Portal" },
];

function isInternal(href: string) {
  return href.startsWith("/") || href.startsWith("#");
}

function FooterLink({ href, label }: { href: string; label: string }) {
  const className = "text-sm text-muted-foreground transition-colors hover:text-foreground";
  return isInternal(href) ? (
    <Link href={href} className={className}>
      {label}
    </Link>
  ) : (
    <a href={href} className={className}>
      {label}
    </a>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-blue-600 text-xs font-bold text-white">
                S
              </span>
              <span className="text-sm font-semibold text-foreground">SupportHub</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              A multi-tenant platform for managing customer support tickets, feedback, and teams — with every
              organization&apos;s data kept isolated from every other.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Product</h3>
            <ul className="mt-3 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <FooterLink {...link} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Platform</h3>
            <ul className="mt-3 space-y-2.5">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.label}>
                  <FooterLink {...link} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Company</h3>
            <ul className="mt-3 space-y-2.5">
              <li>
                <a href="#why-us" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Why Us
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  How It Works
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} SupportHub. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
