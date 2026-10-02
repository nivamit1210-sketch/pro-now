import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { EmailSignInBody, type EmailSignInStage } from "@pro-now/ui";

import { authClient } from "../auth";
import { useFrame } from "../frame";

const RESEND_SECONDS = 30;

/**
 * Sign-in: the demo's AuthGate (tools/design-preview/src/App.tsx) with the
 * two stages, the 30-second resend timer and back-to-the-first-stage, but
 * against the real server: an email link, or Google.
 *
 * Once the link is opened (or Google answers), Better Auth sets the session
 * cookie and redirects to `callbackURL`.
 */
export function SignIn() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const side = params.get("side") === "pro" ? "pro" : "customer";
  // A professional lands on their own side (docs/21 W7): the application, or their work.
  const { width, height } = useFrame();

  const [email, setEmail] = useState("");
  /*
   * The "sent" stage lives in the URL, so the phone's back returns to the
   * email field, as the demo's back does, instead of leaving sign-in.
   * Without an address in memory (a reload), there is nothing to show as
   * sent: back to the field.
   */
  const stage: EmailSignInStage = params.get("sent") === "1" && email ? "sent" : "email";
  /* Set synchronously: `busy` only lands on the next render, and a quick
     double tap arrives before that (QA W2: two emails). */
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const sendLink = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const { error: failed } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: side === "pro" ? "/pro" : "/",
      errorCallbackURL: "/sign-in?expired=1",
    });
    setBusy(false);
    inFlight.current = false;
    if (failed) {
      setError("לא הצלחנו לשלוח את הקישור. בדקו את הכתובת ונסו שוב.");
      return;
    }
    if (stage === "email") setParams((p) => ({ ...Object.fromEntries(p), sent: "1" }));
    setResendIn(RESEND_SECONDS);
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    const { error: failed } = await authClient.signIn.social({
      provider: "google",
      callbackURL: side === "pro" ? "/pro" : "/",
      errorCallbackURL: "/sign-in?expired=1",
    });
    // On success the browser is already leaving for Google.
    if (failed) {
      setBusy(false);
      setError("הכניסה עם Google לא הצליחה. אפשר לנסות שוב או להיכנס עם מייל.");
    }
  };

  const demo = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/demo-auth", { method: "POST" });
      if (!response.ok) throw new Error("Demo authentication is disabled");
      // Everyone shares the one test account, which saw the intro long ago,
      // so the server would never show it again. A tryout starts with the
      // intro every time, as the demo does on every load (Dvir, 2026-10-02).
      window.location.assign("/intro");
    } catch {
      setBusy(false);
      setError("כניסת הניסיון אינה זמינה כרגע.");
    }
  };

  const expired = params.get("expired") === "1";

  return (
    <EmailSignInBody
      side={side}
      stage={stage}
      email={email}
      onChangeEmail={(v) => {
        setEmail(v);
        setError(null);
      }}
      resendInSeconds={resendIn}
      errorHe={error ?? (expired && stage === "email" ? "הקישור כבר לא בתוקף. נשלח לכם חדש." : null)}
      busy={busy}
      onSubmitEmail={sendLink}
      onGoogle={google}
      onDemo={demo}
      onResend={sendLink}
      onBack={() => (stage === "sent" ? navigate(-1) : navigate("/welcome"))}
      width={width}
      height={height}
    />
  );
}
