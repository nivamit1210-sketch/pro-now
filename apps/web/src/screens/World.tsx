import { useMemo, useState } from "react";
import { View } from "react-native";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { api, useMe } from "../api";
import { CityHero } from "../art/CityHero";
import { useFrame } from "../frame";
import { ErrorScreen, LoadingScreen } from "../states";
import {
  createWorldScene,
  WorldCanvas,
  WorldOverlay,
  worldTradesFromCatalog,
  type WorldSceneModel,
  type WorldEvent,
} from "../world";

export function World() {
  const { width, height } = useFrame();
  const navigate = useNavigate();
  const me = useMe();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: api.getCatalog, staleTime: 5 * 60_000 });
  const [nearShopId, setNearShopId] = useState<string | null>(null);
  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const [worldError, setWorldError] = useState(false);

  const trades = useMemo(
    () => worldTradesFromCatalog(catalog.data ?? { marketCode: "", departments: [] }),
    [catalog.data]
  );
  const mode: WorldSceneModel["mode"] = worldError || catalog.isError ? "FALLBACK" : "EXPLORE";
  const scene = useMemo(
    () => ({
      mode,
      departmentCode: null,
      avatarNo: me.data?.customer?.avatarId ? 1 : null,
      shopId: openShopId,
      route: null,
      trades,
    }),
    [me.data?.customer?.avatarId, mode, openShopId, trades]
  );
  if (catalog.isPending) return <LoadingScreen />;
  if (catalog.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void catalog.refetch()} />;

  const nearbyTrade = nearShopId ? trades[nearShopId] ?? null : null;
  const openTrade = openShopId ? trades[openShopId] ?? null : null;

  const onEvent = (event: WorldEvent) => {
    switch (event.type) {
      case "SHOP_NEAR":
        setNearShopId(event.shopId);
        return;
      case "ENTER_SHOP":
        setOpenShopId(event.shopId);
        return;
      case "REQUEST_SERVICE":
        navigate(`/?service=${encodeURIComponent(event.serviceId)}`);
        return;
      case "EXIT":
        navigate("/");
        return;
      case "WORLD_ERROR":
        setWorldError(true);
        setNearShopId((current) => current ?? Object.values(trades)[0]?.shopId ?? null);
        return;
    }
  };

  return (
    <View style={{ width, height }}>
      <WorldCanvas
        mode={scene.mode}
        route={scene.route}
        avatarNo={scene.avatarNo}
        scene={scene}
        sceneFactory={createWorldScene}
        arrival
        onEvent={onEvent}
        fallback={<CityHero />}
      />
      <WorldOverlay
        mode={scene.mode}
        nearbyTrade={nearbyTrade}
        openTrade={openTrade}
        onEvent={onEvent}
        onContinueWithoutWorld={() => navigate("/")}
      />
    </View>
  );
}
