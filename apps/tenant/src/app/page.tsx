import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Crown,
  Headset,
  MessageSquare,
  ShieldCheck,
  Ticket,
  User,
  Users,
} from "lucide-react";
import { LandingNav } from "@/components/landing/landing-nav";
import { DashboardMockup } from "@/components/landing/dashboard-mockup";
import { LandingFooter } from "@/components/landing/landing-footer";
import { cardClass } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Customer Support & Feedback Platform",
  description:
    "Manage customer support tickets, collect feedback, manage support teams, and understand customer satisfaction from one powerful platform.",
  openGraph: {
    title: "Customer Support & Feedback Platform",
    description:
      "Manage customer support tickets, collect feedback, manage support teams, and understand customer satisfaction from one powerful platform.",
    type: "website",
  },
};

const FEATURES = [
  {
    icon: Headset,
    title: "Customer Support",
    description: "Manage customer tickets from creation through resolution, with a full conversation history on every case.",
  },
  {
    icon: Ticket,
    title: "Ticket Management",
    description: "Track ticket status, priority, assignments, and history so nothing falls through the cracks.",
  },
  {
    icon: MessageSquare,
    title: "Customer Feedback",
    description: "Collect customer ratings and feedback through customizable forms built for your organization.",
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Invite and manage support team members and assign each person the appropriate role.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Understand ticket activity, response performance, and customer satisfaction at a glance.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-Tenant Security",
    description: "Keep every organization's users and data isolated from every other organization on the platform.",
  },
];

const STEPS = [
  {
    number: "01",
    icon: Building2,
    title: "Create Your Organization",
    description: "Register your organization and set up your workspace in minutes.",
  },
  {
    number: "02",
    icon: Users,
    title: "Manage Your Support",
    description: "Invite your team, manage tickets, and communicate with customers.",
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Understand Your Customers",
    description: "Collect feedback and use analytics to improve your support experience.",
  },
];

const ROLES = [
  {
    icon: Crown,
    title: "Platform Admin",
    description: "Manages tenants, subscriptions, platform-level statistics, and organization suspension/reactivation.",
  },
  {
    icon: Building2,
    title: "Tenant Owner",
    description: "Manages the organization's settings, team members, subscription, tickets, feedback, and reports.",
  },
  {
    icon: Headset,
    title: "Support Agent",
    description: "Works with customer tickets, responds to customers, and updates ticket status.",
  },
  {
    icon: User,
    title: "Customer",
    description: "Creates and submits support requests, provides feedback, and views their own ticket history.",
  },
];

const PLANS = [
  {
    name: "Free",
    description: "For small teams getting started with structured support.",
    features: ["Up to 2 team members", "50 tickets / month", "Feedback forms unavailable"],
    highlighted: false,
  },
  {
    name: "Starter",
    description: "For growing teams that need room to scale.",
    features: ["Up to 10 team members", "500 tickets / month", "Up to 5 custom feedback forms"],
    highlighted: true,
  },
  {
    name: "Pro",
    description: "For organizations with no limits on growth.",
    features: ["Unlimited team members", "Unlimited tickets", "Unlimited custom feedback forms"],
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="overflow-hidden bg-gradient-to-br from-primary/5 via-background to-info/5">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:py-28">
            <div>
              <p
                className="fade-up mb-4 inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                style={{ animationDelay: "0s" }}
              >
                Multi-tenant customer support platform
              </p>
              <h1
                className="fade-up text-4xl font-bold tracking-tight text-foreground sm:text-5xl"
                style={{ animationDelay: "0.05s" }}
              >
                Powerful Customer Support. Better Customer Experiences.
              </h1>
              <p
                className="fade-up mt-5 max-w-xl text-lg text-muted-foreground"
                style={{ animationDelay: "0.1s" }}
              >
                Manage customer support, tickets, feedback, teams, and performance from one centralized platform —
                built so every organization&apos;s data stays its own.
              </p>
              <div className="fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "0.15s" }}>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Sign In
                </Link>
              </div>
            </div>

            <div className="fade-up flex justify-center lg:justify-end" style={{ animationDelay: "0.2s" }}>
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Everything your support team needs</h2>
            <p className="mt-3 text-muted-foreground">
              One platform to manage tickets, gather feedback, coordinate your team, and see how you&apos;re doing.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className={`${cardClass} transition-transform duration-200 hover:-translate-y-1 hover:shadow-md`}
              >
                <feature.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">How it works</h2>
              <p className="mt-3 text-muted-foreground">Three steps from sign-up to a fully running support desk.</p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.number} className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <step.icon className="h-6 w-6 text-primary" />
                  </div>
                  <p className="mt-4 text-xs font-semibold tracking-wide text-primary">{step.number}</p>
                  <h3 className="mt-1 text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Role-based access */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Built for every role</h2>
            <p className="mt-3 text-muted-foreground">
              Four roles, each with exactly the access they need — nothing more.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role) => (
              <div
                key={role.title}
                className={`${cardClass} transition-transform duration-200 hover:-translate-y-1 hover:shadow-md`}
              >
                <role.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 text-base font-semibold text-foreground">{role.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Plans that grow with you</h2>
              <p className="mt-3 text-muted-foreground">
                Start on any plan and upgrade from your dashboard whenever you need more room.
              </p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-xl border p-6 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-md ${
                    plan.highlighted ? "border-primary bg-background ring-1 ring-primary" : "border-border bg-background"
                  }`}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className={`mt-8 rounded-md px-4 py-2.5 text-center text-sm font-medium shadow-sm transition-colors ${
                      plan.highlighted
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    Get Started
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security / trust */}
        <section id="why-us" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground">
                Your organization&apos;s data stays yours.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Every organization on the platform shares the same infrastructure, but never the same data.
                Users, tickets, feedback, and every other record are scoped to your organization from the moment
                they&apos;re created — one company&apos;s users can never see another company&apos;s data.
              </p>
            </div>
            <div className="space-y-4">
              {[
                {
                  title: "Strict tenant isolation",
                  description: "Every record is scoped to your organization at the data layer, not just the UI.",
                },
                {
                  title: "Role-based access control",
                  description: "Platform Admin, Tenant Owner, Support Agent, and Customer each see only what their role permits.",
                },
                {
                  title: "Token-based authentication",
                  description: "Short-lived access tokens with secure session refresh keep accounts protected without getting in your way.",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border bg-primary">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-primary-foreground">
              Ready to improve your customer support?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
              Set up your organization and start managing tickets, feedback, and your team today.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="rounded-md bg-background px-5 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-background/90"
              >
                Create Your Organization
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-primary-foreground/30 px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
