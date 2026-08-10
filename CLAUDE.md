f# AI Website Lead Finder & Outreach Platform

## Overview

Build a modern SaaS application that helps web agencies and freelancers automatically find businesses that need a new website or digital marketing services.

The application should allow a user to search businesses by location and industry using Google Maps, analyse every business using AI, score potential leads, generate personalised sales emails, create website mockups, and send outreach emails from one dashboard.

The entire workflow should require only a few clicks.

---

# Main Workflow

## Step 1 — Search Businesses

User enters

* Country
* City
* Radius
* Business Type

Examples

* Dentist
* Restaurant
* Law Firm
* Roofing Company
* Gym
* Hotel
* Hair Salon
* Construction Company

Use Google Maps Places API to fetch businesses.

Display

* Business Name
* Rating
* Reviews
* Address
* Phone
* Website
* Opening Hours
* Google Maps URL

---

# Step 2 — AI Business Audit

For every business perform an automated audit.

Analyse

### Website

* Does website exist?
* HTTPS enabled?
* Mobile Friendly?
* Responsive?
* Fast loading?
* Modern design?
* Broken pages
* SSL
* Accessibility
* Contact forms
* CTA quality
* Trust indicators

Determine

Website Score

0–100

---

### Technology Detection

Detect

* WordPress
* Wix
* Squarespace
* Shopify
* React
* Next.js
* Joomla
* Drupal
* Bootstrap

Determine

Technology Age

Examples

> Built with old WordPress theme from 2017

> Uses Bootstrap 3

> No responsive layout

> Obsolete plugins

---

### SEO Audit

Analyse

* Meta Title
* Meta Description
* H1
* Missing Alt Tags
* Sitemap
* Robots.txt
* Page Speed
* Structured Data
* Local SEO
* Google Business optimization

Generate SEO score.

---

### Google Business Profile Audit

Check

* Number of photos
* Reviews
* Rating
* Review response rate
* Missing business description
* Missing categories
* Missing FAQs
* Missing services
* Missing products

---

### Social Presence

Find

* Facebook
* Instagram
* LinkedIn
* TikTok
* YouTube

Analyse

* Last activity
* Followers
* Branding consistency

---

# Step 3 — AI Lead Scoring

Give every business a score.

Example

Lead Score

95/100

Reason

✔ No website

✔ No SSL

✔ Missing SEO

✔ Poor Google profile

✔ Website not mobile friendly

✔ Competitor significantly better

---

Colour code

Green

Orange

Red

---

# Step 4 — Competitor Analysis

Automatically find nearby competitors.

Compare

* Website quality
* Google Rating
* Reviews
* SEO
* Loading speed
* Social Media
* Design
* Online visibility

Generate

Business A

vs

Top 5 Competitors

AI summary

Example

> Your competitors rank higher because they have modern websites, stronger SEO, faster page speeds, and active Google Business profiles.

---

# Step 5 — Find Contact Information

Automatically find

* Contact Email
* Owner Email
* Sales Email
* Contact Form
* Facebook Messenger
* LinkedIn
* Instagram DM

Confidence score

Verified

Likely

Unknown

---

# Step 6 — AI Proposal Generator

One click.

Generate personalised proposal.

Not generic.

Reference

* Business name
* Website problems
* Missing features
* Competitor advantages
* Expected benefits

Tone

Professional

Friendly

Helpful

Never spammy.

---

Example

Hi Sarah,

I came across your dental clinic while searching for dentists in Manchester.

I noticed your website loads slowly on mobile devices and isn't fully optimised for local search.

Several nearby clinics now appear above your business because they have faster websites and stronger local SEO.

A modern website could help increase appointment bookings, improve your Google ranking, and create a better first impression for new patients.

I'd love to build something similar to the attached preview.

---

# Step 7 — AI Website Generator

This is the standout feature.

One click.

Generate a complete interactive website prototype.

Input

Business Name

Industry

Logo

Photos

Brand Colours

Location

AI creates

* Homepage
* About
* Services
* Gallery
* Contact
* Testimonials
* CTA sections

Requirements

Responsive

Modern

Animations

Glassmorphism

Beautiful typography

Smooth scrolling

Interactive

Generate

HTML

CSS

JavaScript

Tailwind

---

Preview directly inside app.

---

# Step 8 — Screenshot Generator

Automatically capture

Old website

Generated website

Create

Side by side comparison

Include in email.

---

# Step 9 — Email Campaign

Connect

Google Workspace

Microsoft 365

SMTP

Resend

SendGrid

Amazon SES

Features

Send now

Schedule

Follow-up

Sequences

Open tracking

Click tracking

Reply tracking

---

# Step 10 — CRM

Track

New Leads

Contacted

Opened

Replied

Meeting

Won

Lost

Notes

Tags

Reminder

Pipeline

---

# Dashboard

Beautiful modern dashboard.

Statistics

Businesses scanned

Qualified leads

Emails sent

Open rate

Reply rate

Meetings booked

Revenue

Conversion rate

---

# Search Filters

Website

No Website

Poor Website

Old Website

Low SEO

Low Rating

Low Reviews

No Email

No Social Media

Technology

WordPress

Wix

Squarespace

Shopify

Industry

Location

Score

---

# Maps

Interactive map.

Pins

Click pin

Open business details.

---

# AI Insights

Every business receives an AI report.

Example

This business has

* outdated branding
* slow website
* missing online booking
* poor SEO
* low accessibility
* missing trust badges

Estimated missed monthly customers

Estimated lost revenue

Suggested improvements

Priority list

---

# Website Before & After

Create

Current website screenshot

↓

Generated redesign

↓

Comparison slider

---

# Proposal PDF

Generate

Professional proposal

Include

Audit

Competitor comparison

Website preview

Pricing

Timeline

Benefits

Export PDF.

---

# Templates

Allow reusable templates.

Website templates

Proposal templates

Email templates

Industry presets

---

# AI Chat

Every lead has an AI assistant.

Ask

"Why is this lead worth contacting?"

"How should I approach them?"

"What services should I sell?"

---

# Notifications

Email opened

Website preview viewed

Proposal downloaded

Reply received

Meeting scheduled

---

# Integrations

Google Maps

Google Business Profile

OpenAI

Anthropic

Resend

SMTP

Google Workspace

Microsoft Outlook

Stripe

Supabase

---

# Admin

User Management

Subscription Plans

Usage Limits

Analytics

Audit History

Logs

---

# UI Design

Modern SaaS design.

Style inspiration

* Linear
* Raycast
* Vercel
* Notion
* Stripe Dashboard

Requirements

* Minimal
* Elegant
* Soft shadows
* Rounded cards
* Glassmorphism accents
* Smooth page transitions
* Framer Motion animations
* Skeleton loading states
* Command palette (⌘K / Ctrl+K)
* Dark/Light mode
* Fully responsive
* Beautiful empty states
* Interactive charts
* Clean typography
* Consistent spacing
* Professional colour palette

---

# Suggested Tech Stack

**Frontend**

* Next.js 15
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Framer Motion
* TanStack Query
* React Hook Form

**Backend**

* Supabase (Auth, Database, Storage)
* PostgreSQL
* Edge Functions
* Redis (for queues and caching)

**AI**

* OpenAI GPT-5.5 (email generation, audits, proposals)
* Claude (long-form reports and proposal refinement)
* Vision model (website screenshot analysis)

**Infrastructure**

* Vercel (Frontend)
* Supabase (Backend)
* Resend or Amazon SES (email delivery)
* Playwright (website screenshots)
* Puppeteer (fallback rendering)

---

## Additional Features That Would Make It Stand Out

Instead of just sending cold emails, turn this into an intelligent sales platform:

* **AI Opportunity Score:** Estimate how much revenue the business could gain from a redesign or SEO improvements based on its market and online presence.
* **Email Personalisation at Scale:** Generate unique emails for every lead to reduce spam detection and improve response rates.
* **Multi-step Outreach Sequences:** Automatically send polite follow-ups if there is no reply after configurable intervals.
* **AI Objection Handling:** When a lead replies with questions (e.g., "We're happy with our current site"), draft a contextual response automatically.
* **Lead Enrichment:** Pull additional business data such as company size, years in operation, and available public contact details from compliant data providers.
* **ROI Calculator:** Show estimated increases in leads, bookings, or calls based on improved SEO and website performance.
* **Agency Branding:** White-label proposals, audit reports, and emails with your own branding.
* **Browser Extension:** While browsing Google Maps, allow users to save businesses directly into the CRM.
* **Campaign Analytics:** Track open rates, replies, meetings booked, and conversion rates with A/B testing for subject lines and email content.
* **Compliance Features:** Include unsubscribe handling, suppression lists, rate limiting, and reminders to comply with local email regulations (such as GDPR, CAN-SPAM, and other applicable laws), especially when contacting businesses.

This scope turns the project from a simple lead scraper into an AI-powered agency growth platform that automates prospect discovery, qualification, personalised outreach, proposal generation, website previews, and sales pipeline management.

---

# Current Implementation

> Everything above is the product vision. This section documents what is
> actually built in the repo. Where the two differ, this section wins.

## Stack (as built)

* **Web** — Next.js 15 App Router (JavaScript, not TypeScript), Tailwind,
  hand-rolled shadcn-style components, Framer Motion, TanStack Query,
  React Hook Form + Zod.
* **Backend** — Supabase (Postgres + Auth + Storage + RLS). Migrations in
  `supabase/migrations/` (`0001_init` → `0005_website_demos`).
* **Worker** — Node + BullMQ + Redis (`ioredis`), Playwright (screenshots),
  cheerio (HTML parsing), Google PageSpeed Insights.
* **AI** — Anthropic Claude only (`@anthropic-ai/sdk`). No OpenAI in the code
  despite the vision mentioning GPT — all audits, insights, proposals, emails,
  and website generation run through Claude.
* **Email** — `nodemailer` (SMTP). Open/click/unsubscribe tracking via web
  routes under `api/track/*` and `api/unsubscribe`.
* **Maps** — Google Maps JS API + Places (`lib/places.js`).

## Monorepo layout

```
apps/web         Next.js app — UI, auth, API routes, job enqueue
apps/worker      BullMQ worker — audit, website, insight, proposal, email jobs
packages/shared  Pure shared logic — constants, scoring, prompts, images
supabase/        SQL migrations (schema + RLS + storage + realtime + demos)
```

* `apps/web/app/(app)/` — authed pages: dashboard, search, leads, campaigns,
  settings. `api/*` routes enqueue worker jobs and serve tracking pixels.
* `apps/web/app/preview/[id]/route.js` — public, no-auth HTML preview of a
  generated website demo (served from `website_demos.html`).
* `apps/worker/src/processors/` — one processor per queue: `audit`, `website`,
  `insight`, `proposal`, `email`.
* `packages/shared/src/` — `scoring.js` (lead score), `prompts.js` (all Claude
  prompts), `images.js` (demo image host rewriting), `constants.js`,
  `email-render.js` (outreach body rendering — click tracking, plain-text part).

## Email deliverability

Outreach is 1:1 cold email, so the send path is tuned for Gmail's Primary tab
rather than for bulk metrics. `packages/shared/src/email-render.js` renders the
body for both send paths (`apps/web/lib/email.js`, the worker's `email`
processor): **no open pixel**, links rewritten through the click tracker at
`TRACKING_URL` (set it to a subdomain of the *sending* domain so the link domain
matches the `From` domain), a plain `--` signature carrying the unsubscribe
link, and a `text/plain` alternative on every send. `List-Unsubscribe` /
`List-Unsubscribe-Post` are off unless `EMAIL_LIST_UNSUBSCRIBE=true` — those
headers tell Gmail "bulk" and route outreach to Promotions; they only pay off
above ~5k msgs/day. Open events now come from clicks (a click implies an open);
`api/track/open` remains only for mail sent before this change. SPF/DKIM/DMARC
on the sending domain are still required — without them Gmail drops the `From`
display name and filters harder. Details in `DEPLOY.md`.

## Website demo images

The AI website generator (`packages/shared/src/prompts.js`) emits keyword-based
image URLs so every photo matches the business's industry. It uses loremflickr,
whose Flickr backend is unreliable (the same URL flips between 200 and 500),
which made demo images render broken.

`packages/shared/src/images.js` fixes this: `rewriteImageHosts(html)` rewrites
every loremflickr URL to the Unsplash image CDN, mapping the AI's chosen
keywords to a curated, verified photo pool per subject (food, chef, gym, salon,
law, dental, …) and keeping the original dimensions so layouts are untouched.
The preview route applies it at serve time, so the fix covers both existing and
future demos without regenerating them.

## Self-hosted Docker deployment

For servers without managed Supabase (e.g. Hostinger KVM + Dokploy), the whole
platform runs from the root `docker-compose.yml` — no external Supabase/Redis.
The app code is **unchanged**: instead of ripping Supabase out, the Supabase
*stack* is self-hosted (Postgres + GoTrue auth + PostgREST + Realtime + Storage
+ Kong gateway) alongside Redis, `web`, and `worker`. The app just points
`NEXT_PUBLIC_SUPABASE_URL` at the Kong gateway.

* **db** uses the `supabase/postgres` image (ships roles `anon`/`authenticated`/
  `service_role`, the `auth`/`storage` schemas, and `auth.uid()`), so RLS +
  migrations work untouched.
* **migrator** (one-shot, `docker/migrate/migrate.sh`) waits for GoTrue +
  storage-api to create their schemas, then applies `supabase/migrations/*.sql`
  in order, tracked in `public.schema_migrations`. `0001` FKs to `auth.users`
  and `0003` touches `storage.*`, so it must run after those services migrate.
* Routing = two domains: `SITE_URL` → `web:3000`, `SUPABASE_PUBLIC_URL` →
  `kong:8000`. `NEXT_PUBLIC_*` are build args (inlined) — rebuild `web` when a
  domain or the anon key changes. The `worker` talks to `http://kong:8000`
  internally.
* Auth is **email + password only** (the Google OAuth button was removed from
  `components/auth-form.jsx`). `next.config.mjs` uses `output: "standalone"` +
  `outputFileTracingRoot` (repo root) for the web image.
* Studio admin UI is optional behind the `studio` compose profile (off by
  default to save RAM).
* Secrets: `scripts/gen-secrets.mjs` mints `JWT_SECRET` + the HS256
  `ANON_KEY`/`SERVICE_ROLE_KEY` JWTs. Data migration off Supabase cloud:
  `scripts/migrate-from-supabase.sh` (DB rows incl. users/passwords) +
  `scripts/migrate-storage.mjs` (bucket files). Full guide in `DEPLOY.md`.
