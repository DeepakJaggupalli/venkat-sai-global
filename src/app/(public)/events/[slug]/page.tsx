import { CalendarDays, CalendarRange, ExternalLink, Globe, MapPin, ShieldCheck, Ticket, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/site";
import { EVENT_FORMAT_OPTIONS, EVENT_TYPE_OPTIONS } from "@/modules/content/collections";

import { MediaGallery } from "../../gallery/_components/media-gallery";
import { toGalleryItems } from "../../gallery/_lib/gallery-items";
import { ArticleLayout, FactBox, Prose } from "../../news/_components/article-parts";
import { CmsImage } from "../../news/_components/cms-image";
import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../../news/_components/public-hero";
import { abs, assetFor, breadcrumbJsonLd, entryMetadata, imagesFor, loadEntry, readPreview, siteTimeZone, type PageSearchParams } from "../../news/_lib/cms";
import { excerptText, safeTimeZone } from "../../news/_lib/text";
import { countryName, eventTiming, formatEventSchedule, registrationState } from "../_lib/schedule";

type Props = { params: Promise<{ slug: string }>; searchParams: PageSearchParams };

const TYPE_LABEL: Record<string, string> = Object.fromEntries(EVENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const FORMAT_LABEL: Record<string, string> = Object.fromEntries(EVENT_FORMAT_OPTIONS.map((o) => [o.value, o.label]));
const ATTENDANCE_MODE: Record<string, string> = {
  in_person: "https://schema.org/OfflineEventAttendanceMode",
  online: "https://schema.org/OnlineEventAttendanceMode",
  hybrid: "https://schema.org/MixedEventAttendanceMode",
};

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("events", slug, readPreview(sp));
  if (!detail) return { title: "Event not found", robots: { index: false } };
  return entryMetadata(detail, { path: `/events/${slug}`, type: "website", fallbackDescription: excerptText(detail.entry.data.description, 160) });
}

export default async function EventPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadEntry("events", slug, readPreview(sp));
  if (!detail) notFound();
  const { entry, assets, preview } = detail;
  const d = entry.data;
  const tz = safeTimeZone(d.timezone, siteTimeZone());
  const now = new Date();
  const timing = eventTiming(d.startsAt, d.endsAt, now);
  const registration = registrationState(d.registration, timing, now);
  const hero = assetFor(assets, entry.heroAssetId);
  const gallery = toGalleryItems(imagesFor(assets, d.galleryAssetIds));
  const schedule = formatEventSchedule(d.startsAt, d.endsAt, tz);
  const inPerson = d.format === "in_person" || d.format === "hybrid";
  const online = d.format === "online" || d.format === "hybrid";
  const venueCountry = countryName(d.venue?.countryCode);
  const venueLine = [d.venue?.name, d.venue?.address, d.venue?.city, venueCountry].filter(Boolean);
  const showOnlineLink = online && d.onlineUrl && timing !== "past";
  const url = abs(`/events/${slug}`);

  const location: Record<string, unknown>[] = [];
  if (inPerson && d.venue?.name) {
    location.push({
      "@type": "Place",
      name: d.venue.name,
      address: { "@type": "PostalAddress", streetAddress: d.venue.address || undefined, addressLocality: d.venue.city || undefined, addressCountry: d.venue.countryCode || undefined },
    });
  }
  if (online) location.push({ "@type": "VirtualLocation", url: d.onlineUrl || (registration.kind === "open" && registration.url && isExternal(registration.url) ? registration.url : url) });

  return (
    <>
      <PreviewRibbon preview={preview} />
      {!preview ? (
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "Event",
              name: entry.title,
              description: entry.summary || excerptText(d.description, 300),
              startDate: d.startsAt,
              ...(d.endsAt ? { endDate: d.endsAt } : {}),
              eventStatus: "https://schema.org/EventScheduled",
              eventAttendanceMode: ATTENDANCE_MODE[d.format],
              location: location.length === 1 ? location[0] : location,
              ...(hero?.kind === "image" ? { image: [hero.variants.lg ?? hero.url] } : {}),
              organizer: { "@type": "Organization", name: d.organiserName || BRAND.name },
              url,
            },
            breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Events", url: abs("/events") }, { name: entry.title }]),
          ]}
        />
      ) : null}
      <PublicHero
        eyebrow={TYPE_LABEL[d.eventType] ?? "Event"}
        title={entry.title}
        description={entry.summary}
        breadcrumbs={[{ label: "Events", href: timing === "past" ? "/events?when=past" : "/events" }, { label: entry.title }]}
        meta={
          <>
            <MetaItem icon={<CalendarDays />}>{schedule}</MetaItem>
            <MetaItem icon={online && !inPerson ? <Globe /> : <MapPin />}>
              {inPerson ? [d.venue?.city, venueCountry].filter(Boolean).join(", ") || FORMAT_LABEL[d.format] : FORMAT_LABEL[d.format]}
              {d.format === "hybrid" ? " · also online" : ""}
            </MetaItem>
          </>
        }
        actions={
          registration.kind === "open" && registration.url ? (
            <Button asChild size="lg">
              <a href={registration.url} {...(isExternal(registration.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                <Ticket aria-hidden="true" />
                Register
                {isExternal(registration.url) ? <span className="sr-only"> (opens in a new tab)</span> : null}
              </a>
            </Button>
          ) : undefined
        }
      />
      <ArticleLayout
        aside={
          <>
            <FactBox title="When and where">
              <dl className="space-y-3">
                <div>
                  <dt className="text-muted-foreground">Schedule</dt>
                  <dd className="font-medium">{schedule}</dd>
                  {timing === "ongoing" ? <dd className="mt-1 text-success-strong">Happening now</dd> : null}
                  {timing === "past" ? <dd className="mt-1 text-muted-foreground">This event has ended</dd> : null}
                </div>
                <div>
                  <dt className="text-muted-foreground">Format</dt>
                  <dd className="font-medium">{FORMAT_LABEL[d.format]}</dd>
                </div>
                {inPerson && venueLine.length ? (
                  <div>
                    <dt className="text-muted-foreground">Venue</dt>
                    <dd className="font-medium whitespace-pre-line">{venueLine.join("\n")}</dd>
                    {d.venue?.mapUrl ? (
                      <dd className="mt-1">
                        <a href={d.venue.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-teal-strong hover:underline">
                          Open map <ExternalLink className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </dd>
                    ) : null}
                  </div>
                ) : null}
                {showOnlineLink ? (
                  <div>
                    <dt className="text-muted-foreground">Online</dt>
                    <dd>
                      <a href={d.onlineUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-teal-strong hover:underline">
                        Joining link <ExternalLink className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </dd>
                  </div>
                ) : null}
                {d.organiserName ? (
                  <div>
                    <dt className="text-muted-foreground">Organiser</dt>
                    <dd className="inline-flex items-center gap-1.5 font-medium">
                      <UserRound className="size-3.5" aria-hidden="true" />
                      {d.organiserName}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </FactBox>
            {registration.kind !== "none" ? (
              <FactBox title="Registration">
                {registration.kind === "open" ? (
                  <div className="space-y-2">
                    <p>{registration.required ? "Registration is required." : "Registration is recommended."}</p>
                    {registration.deadline ? (
                      <p className="text-muted-foreground">
                        Closes {formatEventSchedule(registration.deadline.toISOString(), null, tz)}
                      </p>
                    ) : null}
                    {d.registration?.instructions ? <p className="whitespace-pre-line">{d.registration.instructions}</p> : null}
                    {registration.url ? (
                      <Button asChild className="mt-2 w-full">
                        <a href={registration.url} {...(isExternal(registration.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                          Register
                          {isExternal(registration.url) ? <span className="sr-only"> (opens in a new tab)</span> : null}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{registration.reason === "deadline" ? "Registration has closed." : "This event has ended."}</p>
                )}
              </FactBox>
            ) : null}
          </>
        }
      >
        {hero && hero.kind === "image" ? <CmsImage asset={hero} priority className="mb-8 rounded-xl" sizes="(min-width: 1024px) 760px, 100vw" /> : null}
        <Prose html={d.description} />
        {d.eventType !== "webinar" ? (
          <Callout tone="brand" icon={<ShieldCheck />} title="Free for candidates" className="mt-8">
            Venkat Sai Global never asks candidates for money to register, attend, be interviewed or be trade-tested. If anyone asks you to pay,
            do not pay and <Link href="/grievance" className="font-medium underline underline-offset-2">report it to us</Link>. Read more about{" "}
            <Link href="/safe-recruitment" className="font-medium underline underline-offset-2">safe recruitment</Link>.
          </Callout>
        ) : null}
        {gallery.length ? (
          <PublicSection title="Photos and videos" id="media" className="pb-0">
            <MediaGallery items={gallery} label={`Photos and videos: ${entry.title}`} />
          </PublicSection>
        ) : null}
        <p className="mt-10">
          <Link href={timing === "past" ? "/events?when=past" : "/events"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-strong hover:underline">
            <CalendarRange className="size-4" aria-hidden="true" />
            {timing === "past" ? "All past events" : "All upcoming events"}
          </Link>
        </p>
      </ArticleLayout>
    </>
  );
}
