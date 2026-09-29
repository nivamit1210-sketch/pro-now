import { useNavigate } from "react-router";
import { WelcomeBody } from "@pro-now/ui";

import { WelcomeScene } from "../art/WelcomeScene";
import { useFrame } from "../frame";

/**
 * The demo's welcome screen, over the demo's painted neon street.
 *
 * "אני בעל מקצוע" leads to the professional's sign-in and application
 * (docs/21 W7). The business link stays disabled: business leads have no
 * backend yet (docs/21 W2 option a).
 */
export function Welcome() {
  const navigate = useNavigate();
  const { width, height } = useFrame();
  return (
    <WelcomeBody
      background={<WelcomeScene />}
      onCustomer={() => navigate("/sign-in")}
      onProfessional={() => navigate("/sign-in?side=pro")}
      advertiseUpcoming
      width={width}
      height={height}
    />
  );
}
