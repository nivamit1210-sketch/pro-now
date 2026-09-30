import type { WorldEvent } from "./WorldCanvas";
import type { WorldMode, WorldRouteModel, WorldTrade } from "./types";
import { canEnterTrade } from "./scene/street";
import "./WorldOverlay.css";

export interface WorldOverlayProps {
  mode: WorldMode;
  nearbyTrade?: WorldTrade | null;
  openTrade?: WorldTrade | null;
  route?: WorldRouteModel | null;
  professionalNameHe?: string | null;
  onEvent: (event: WorldEvent) => void;
  onContinueWithoutWorld?: () => void;
}

export function WorldOverlay({
  mode,
  nearbyTrade = null,
  openTrade = null,
  route = null,
  professionalNameHe = null,
  onEvent,
  onContinueWithoutWorld,
}: WorldOverlayProps) {
  const activeTrade = openTrade ?? nearbyTrade;
  const status = mode === "SEARCH" ? "מחפשים מקצוען" : mode === "ROUTE" ? "המקצוען בדרך" : mode === "EXPLORE" ? "מטיילים בשכונה" : "העולם של PRO NOW";
  const eta = route?.eta?.etaSeconds == null ? null : Math.max(0, Math.ceil(route.eta.etaSeconds / 60));

  return (
    <div className="world-overlay" dir="rtl">
      <div className="world-overlay__status" aria-live="polite">{status}</div>
      {professionalNameHe ? <div className="world-overlay__professional">{professionalNameHe}{eta === null ? "" : ` · ${eta} דק׳`}</div> : null}
      {activeTrade ? (
        <section className="world-overlay__sheet" aria-label={activeTrade.nameHe}>
          <h2>{activeTrade.nameHe}</h2>
          {nearbyTrade && !openTrade ? (
            canEnterTrade(activeTrade) ? (
              <button type="button" onClick={() => onEvent({ type: "ENTER_SHOP", shopId: activeTrade.shopId })}>היכנסו</button>
            ) : (
              <p>החנות עדיין נבנית</p>
            )
          ) : null}
          {openTrade ? (
            <div className="world-overlay__services">
              {openTrade.services.map((service) => (
                <button key={service.id} type="button" onClick={() => onEvent({ type: "REQUEST_SERVICE", serviceId: service.id })}>
                  {service.nameHe}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="world-overlay__actions">
        <button type="button" onClick={() => onEvent({ type: "EXIT" })}>יציאה</button>
        {onContinueWithoutWorld ? <button type="button" onClick={onContinueWithoutWorld}>להמשיך בלי העולם</button> : null}
      </div>
    </div>
  );
}
