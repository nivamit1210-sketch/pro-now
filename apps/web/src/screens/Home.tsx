import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  ActiveJobCapsule,
  AppHeader,
  AppMenuBody,
  CAPSULE_HEIGHT,
  CategoryBody,
  CustomerHomeBody,
  ServiceDetailBody,
  catalogServicePages,
  lowestListed,
  catalogHiddenServices,
  catalogHomeServices,
  catalogMatchRules,
  matchServicesByText,
  pilotServiceById,
} from "@pro-now/ui";
import { categoryAsksForPerson, customerCategoryById, greetingAt, type CatalogServiceDef } from "@pro-now/types";

import { api, useMe } from "../api";
import { capsuleFigureUri, capsuleTrip } from "../activeCapsule";
import { servicesForCategory } from "../categories";
import { shortAddressHe } from "../addressLabel";
import { resolveAddress, useOrderTarget } from "../orderTarget";
import { signOutHere } from "../auth";
import { CityHero, TradeBackdrop } from "../art/CityHero";
import { worldSources } from "../art/worldSources";
import { HEADER_H, useAvatarUri } from "../CustomerHeader";
import { useFrame } from "../frame";
import { useWebMediaCapture } from "../useWebMediaCapture";
import { inboxKey } from "../useUserChannel";
import { RequestComposer } from "./RequestComposer";
import { jobKey } from "./Job";


/**
 * The customer's side: the demo's shell (header, then the body under it)
 * with home and the menu, fed only what is true.
 *
 * - Services: the same catalogue the demo shows (packages/ui), with each
 *   service's own coming-soon / not-in-market state. The demo opens every
 *   service for demonstration; the product does not.
 * - Availability, "recent" and the live line are left out rather than
 *   invented (CLAUDE.md §3): they arrive with real supply and real jobs
 *   (W6/W7).
 * - Controls whose screens belong to later epics are visible and disabled
 *   (docs/21 W2, option a): the business link, the account card. The
 *   stroll opens the street (/world), choosing a figure first when there
 *   is none, as in the demo.
 * - Text search matches against the catalogue on the device, and so does a
 *   recording: the browser's speech-to-text writes it into the same box
 *   (docs/21 W5), so it finds its service without a search button.
 * - A category opens the services it covers, as in the demo.
 */
const HOME_SERVICES = [...catalogHomeServices, ...catalogHiddenServices];

type Tab = "home" | "menu";

export function Home() {
  const { width, height } = useFrame();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // The job screens' header opens this menu (WithHeader).
  const location = useLocation();
  const [tab, setTab] = useState<Tab>((location.state as { menu?: boolean } | null)?.menu ? "menu" : "home");
  /*
   * A chosen service opens its page first, then the request form — the
   * demo's order (service → describe). `composing` is the second step.
   */
  const [requestServiceId, setRequestServiceId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // A sentence typed on a category page that matched nothing there, handed
  // back to the home box where the whole catalogue can answer it.
  const [seedQuery, setSeedQuery] = useState<string | null>(null);
  // The sentence the service was chosen from, carried into the request.
  const [typedText, setTypedText] = useState("");
  useEffect(() => {
    const service = searchParams.get("service");
    if (!service) return;
    setRequestServiceId(service);
    searchParams.delete("service");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);
  const me = useMe();
  const media = useWebMediaCapture();
  /* The face they chose, in the header, as in the demo; the glyph if none. */
  const avatarUri = useAvatarUri();
  /*
   * A job still in progress is one tap away from home, after a reload or in
   * a new tab (docs/21 W6). Closed and cancelled jobs are history, not a
   * capsule.
   */
  const myJobs = useQuery({ queryKey: ["my-jobs"], queryFn: api.listMyJobs, refetchInterval: 30_000 });
  // The inbox's unread count, kept fresh by the live channel (W9).
  const inbox = useQuery({ queryKey: inboxKey, queryFn: api.inbox });
  const active = myJobs.data?.jobs.find((j) => j.status !== "CLOSED" && j.status !== "CANCELLED") ?? null;
  /*
   * The capsule's walker, minutes and road (the demo's ActiveJobCapsule):
   * the same job and match reads as the job screen, sharing its cache. The
   * minutes and the place on the road only exist while somebody is on the
   * way and the server has an ETA; see activeCapsule.ts.
   */
  const onTheWay = active?.status === "PRO_ASSIGNED" || active?.status === "PRO_EN_ROUTE";
  const activeJob = useQuery({ queryKey: jobKey(active?.id ?? ""), queryFn: () => api.getJob(active!.id), enabled: Boolean(active) });
  const activeMatch = useQuery({
    queryKey: [...jobKey(active?.id ?? ""), "match"],
    queryFn: () => api.getJobMatch(active!.id),
    enabled: Boolean(active) && onTheWay,
    refetchInterval: 30_000,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!onTheWay) return;
    const t = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [onTheWay]);
  const trip = active ? capsuleTrip(active.status, onTheWay ? activeMatch.data : null, nowMs) : null;
  const figureUri = capsuleFigureUri(activeJob.data?.job.service.code, worldSources);
  const hasAvatar = Boolean(me.data?.customer?.avatarId);
  const category = categoryId ? customerCategoryById(categoryId) : null;
  // The address the professional would be sent to: the form's own default.
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: api.getAddresses });
  const { target } = useOrderTarget();
  const firstAddress = resolveAddress(addresses.data?.addresses ?? [], target.addressId);
  const servicePage = requestServiceId ? catalogServicePages[requestServiceId] : undefined;
  const closeService = () => {
    setTypedText("");
    setComposing(false);
    setRequestServiceId(null);
  };
  const bodyH = height - HEADER_H - (active ? CAPSULE_HEIGHT : 0);

  const queryClient = useQueryClient();
  const signOut = () => signOutHere(queryClient, () => navigate("/welcome", { replace: true }));

  return (
    <View style={{ width, height }}>
      {/* The same button closes the menu again, as in the demo. */}
      <AppHeader width={width} greetingHe={null} avatarUri={avatarUri} onMenu={() => setTab(tab === "menu" ? "home" : "menu")} onAccount={() => navigate("/avatar")} />
      <View style={{ height: bodyH, overflow: "hidden" }}>
        {tab === "menu" ? (
          <AppMenuBody
            /*
             * The demo's menu, row for row, without its demonstration group
             * and with a way out. Rows whose screens have not shipped are
             * shown disabled; support rows wait for the support-channel
             * decision (CLAUDE.md §4).
             */
            groups={[
              // Only for an admin; the server enforces it on every call (docs/21 W8).
              ...(me.data?.roles.includes("ADMIN")
                ? [{ titleHe: "ניהול", items: [{ id: "admin", labelHe: "ניהול", detailHe: "בקשות הצטרפות, קריאות, משתמשים ושוק", onPress: () => navigate("/admin") }] }]
                : []),
              {
                titleHe: "התראות",
                items: [
                  {
                    id: "inbox",
                    labelHe: inbox.data?.unread ? `התראות · ${inbox.data.unread} חדשות` : "התראות",
                    detailHe: "מה קרה בקריאות שלכם, והתראות לטלפון",
                    onPress: () => navigate("/inbox"),
                  },
                ],
              },
              {
                titleHe: "העבודות שלי",
                items: [{ id: "calls", labelHe: "הקריאות שלי", detailHe: "היסטוריה, קריאה פעילה ודירוגים", onPress: () => navigate("/calls") }],
              },
              {
                titleHe: "החשבון",
                items: [
                  { id: "card", labelHe: "החשבון שלי", detailHe: "פרטים, אמצעי תשלום והיסטוריית חיובים", onPress: () => navigate("/profile") },
                  { id: "address", labelHe: "הכתובות שלי", detailHe: "לאן שולחים את המקצוען", onPress: () => navigate("/addresses") },
                  { id: "avatar", labelHe: "הדמות שלי", detailHe: "מי מטייל ברחוב בזמן ההמתנה", onPress: () => navigate("/avatar") },
                  { id: "sign-out", labelHe: "יציאה", detailHe: "יציאה מהחשבון במכשיר הזה", onPress: signOut },
                ],
              },
              {
                titleHe: "עזרה",
                items: [
                  { id: "whatsapp", labelHe: "ואטסאפ", upcoming: true },
                  { id: "email", labelHe: "אימייל", upcoming: true },
                ],
              },
              {
                titleHe: "העולם",
                items: [
                  { id: "stroll", labelHe: "טיול בשכונה", detailHe: "בלי בקשה פתוחה", onPress: () => navigate("/world") },
                  { id: "advertise", labelHe: "יש לך עסק?", detailHe: "פתיחת חנות בשכונה של PRO NOW", upcoming: true },
                ],
              },
            ]}
            onBack={() => setTab("home")}
            width={width}
            height={bodyH}
          />
        ) : requestServiceId && composing ? (
          <RequestComposer
            serviceId={requestServiceId}
            media={media}
            initialText={typedText}
            height={bodyH}
            onBack={() => setComposing(false)}
            onOpenAddresses={() => navigate("/addresses")}
            onSent={(jobId) => {
              media.capture.onClearPhotos?.();
              media.capture.onDeleteVoice?.();
              closeService();
              navigate(`/jobs/${jobId}`);
            }}
          />
        ) : requestServiceId && servicePage ? (
          <ServiceDetailBody
            {...servicePage}
            /* No problem chips before calling — words, a recording, a photo (Amit, 2026-09-29). */
            symptomsHe={[]}
            priceListFromMinorUnits={lowestListed(requestServiceId)}
            // No availability snapshot on the web yet: silence, not a zero.
            availableNowCount={null}
            width={width}
            height={bodyH}
            onBack={closeService}
            onRequestNow={(_symptoms, noteHe) => {
              // What they typed here IS the description; carry it on.
              if (noteHe) setTypedText((cur) => cur || noteHe);
              setComposing(true);
            }}
            onRecheck={closeService}
          />
        ) : category ? (
          <CategoryBody
            backdrop={<TradeBackdrop department={category.faceDepartment} />}
            category={category}
            services={servicesForCategory(category, HOME_SERVICES).map((s) => ({
              id: s.id,
              nameHe: s.nameHe,
              descriptionHe: s.descriptionHe ?? null,
              // No availability snapshot on the web yet: silence, not a zero.
              availableNowCount: null,
            }))}
            worldSources={worldSources}
            asksForPerson={categoryAsksForPerson(
              servicesForCategory(category, HOME_SERVICES)
                .map((s) => pilotServiceById[s.id])
                .filter((s): s is CatalogServiceDef => Boolean(s))
            )}
            onSelectService={setRequestServiceId}
            onDescribe={(textHe) => {
              // The home matcher, scoped to the category the customer chose.
              const inCategory = new Set(servicesForCategory(category, HOME_SERVICES).map((s) => s.id));
              const best = matchServicesByText(
                textHe,
                catalogMatchRules.filter((r) => inCategory.has(r.serviceId))
              )[0];
              if (best) {
                setTypedText(textHe);
                setRequestServiceId(best.serviceId);
                return;
              }
              setSeedQuery(textHe);
              setCategoryId(null);
            }}
            onBack={() => setCategoryId(null)}
            width={width}
            height={bodyH}
          />
        ) : (
          <CustomerHomeBody
            backdrop={<CityHero />}
            greetingHe={greetingAt(new Date())}
            services={HOME_SERVICES}
            matchRules={catalogMatchRules}
            worldSources={worldSources}
            nowMs={Date.now()}
            capture={media.capture}
            injectedText={media.transcript}
            seedQueryHe={seedQuery}
            // Whose door this is, as in the demo: a call for someone else says so.
            addressLabelHe={
              firstAddress
                ? `${shortAddressHe(firstAddress)}${target.onSite ? ` · עבור ${target.onSite.name}` : ""}`
                : undefined
            }
            onChangeAddress={() => navigate("/addresses")}
            onSelectCategory={setCategoryId}
            onSelectService={setRequestServiceId}
            onTextChoice={(choice) => {
              setTypedText(choice.text);
              // Feedback only; a failure here must never stand between the
              // customer and the service they chose.
              void api.sendMatchFeedback(choice).catch(() => {});
            }}
            // The door into the street; without a figure it picks one on the way (demo: strollDoor).
            onStroll={() => navigate(hasAvatar ? "/world" : "/avatar?then=world")}
            strollNeedsAvatar={!hasAvatar}
            advertiseUpcoming
            width={width}
            height={bodyH}
          />
        )}
      </View>
      {active ? (
        <ActiveJobCapsule
          textHe={`${active.serviceNameHe} · ${ACTIVE_LABEL_HE[active.status] ?? "בטיפול"}`}
          etaMinutes={trip?.etaMinutes ?? null}
          progress={trip?.progress ?? null}
          figureUri={figureUri}
          live
          onPress={() => navigate(`/jobs/${active.id}`)}
          width={width}
        />
      ) : null}
    </View>
  );
}

/** What the capsule says for each stage, in the demo's words. */
const ACTIVE_LABEL_HE: Partial<Record<string, string>> = {
  DRAFT: "מחפשים מקצוען",
  SEARCHING: "מחפשים מקצוען",
  OFFERING: "מחפשים מקצוען",
  PRO_ASSIGNED: "נמצא מקצוען",
  PRO_EN_ROUTE: "בדרך אליך",
  PRO_ARRIVED: "הגיע",
  DIAGNOSIS: "בודק את הבעיה",
  WAITING_QUOTE_APPROVAL: "הצעת מחיר",
  IN_PROGRESS: "בעבודה",
  COMPLETION_PENDING: "סיים — מחכה לאישורך",
  REVIEW_PENDING: "איך היה?",
};
