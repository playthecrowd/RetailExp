import { GiftingApp } from "@/components/gifting/GiftingApp";

/** The scenario selector. Prototype-only, and deliberately not the production
 *  entry flow — which is why it lives on its own path rather than in front of
 *  the recipient journey. */
export default function GiftingDemoLauncher() {
  return <GiftingApp initial="launcher" />;
}
