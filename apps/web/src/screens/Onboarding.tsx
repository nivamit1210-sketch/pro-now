import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AvatarPickerBody, IntroBody } from "@pro-now/ui";
import type { CustomerOnboardingInput } from "@pro-now/validation";

import { api, meKey, useMe } from "../api";
import { IntroBackdrop } from "../art/IntroBackdrop";
import { worldSources } from "../art/worldSources";
import { useFrame } from "../frame";

/**
 * The first-run steps after a new customer's first sign-in, in the demo's
 * order: the intro, once; then the character, once (skipping is an answer).
 * The server remembers both (`PATCH /api/v1/me/customer`), so they are not
 * asked again on another device.
 */
function useAnswer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerOnboardingInput) => api.saveOnboarding(input),
    onSuccess: () => client.invalidateQueries({ queryKey: meKey }),
  });
}

export function Intro() {
  const { width, height } = useFrame();
  const navigate = useNavigate();
  const me = useMe();
  const answer = useAnswer();
  const [slide, setSlide] = useState(0);
  return (
    <IntroBody
      side="CUSTOMER"
      background={<IntroBackdrop slide={slide} />}
      onSlide={setSlide}
      sources={worldSources}
      onDone={async () => {
        await answer.mutateAsync({ introSeen: true });
        navigate(me.data?.customer?.avatarAnswered ? "/" : "/avatar", { replace: true });
      }}
      width={width}
      height={height}
    />
  );
}

export function Avatar() {
  const { width, height } = useFrame();
  const navigate = useNavigate();
  const me = useMe();
  const answer = useAnswer();
  // From home's stroll card: a figure chosen goes on into the street (the demo's strollDoor).
  const [params] = useSearchParams();
  const toStreet = params.get("then") === "world";
  const done = async (avatarId: string | null) => {
    await answer.mutateAsync({ avatarId });
    navigate(toStreet && avatarId ? "/world" : "/", { replace: true });
  };
  return (
    <AvatarPickerBody
      value={me.data?.customer?.avatarId ?? null}
      sources={worldSources}
      onChoose={(id) => void done(id)}
      onSkip={() => void done(null)}
      width={width}
      height={height}
    />
  );
}
