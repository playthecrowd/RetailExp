/**
 * The fixed KAMELEON reward catalog (curated art + copy, not admin-editable
 * yet) — static bundled assets, same convention as
 * public/assets/kameleon/fullscreen/*.png. Actual unlock STATE per user
 * lives in Supabase (`experience_user_rewards`, see
 * app/experience/kameleon/actions.ts) — this file only describes what the
 * four rewards are.
 */
export interface RewardDefinition {
  id: string;
  order: number;
  name: string;
  description: string;
  points: number;
  image: string;
  unlockDescription: string;
}

export const REWARD_CATALOG: RewardDefinition[] = [
  {
    id: "kameleon_bottle_pedestal",
    order: 1,
    name: "KAMELEON Bottle Pedestal",
    description: "A molten copper pedestal, cracked with ember light, built to hold the bottle that started it all.",
    points: 100,
    image: "/assets/kameleon/rewards/kameleon-bottle-pedestal.png",
    unlockDescription: "Unlocked by creating your KAMELEON passport.",
  },
  {
    id: "ruby_portal",
    order: 2,
    name: "Ruby Portal",
    description: "A ruby-lit gateway, humming with the same color that opens every KAMELEON pathway.",
    points: 150,
    image: "/assets/kameleon/rewards/ruby-portal.png",
    unlockDescription: "Unlocked by completing the AR experience.",
  },
  {
    id: "perfect_pour_fountain",
    order: 3,
    name: "Perfect Pour Fountain",
    description: "Four glasses, one bottle, one impossible pour — the moment your journey branches.",
    points: 200,
    image: "/assets/kameleon/rewards/perfect-pour-fountain.png",
    unlockDescription: "Unlocked by making your first pathway decision.",
  },
  {
    id: "atlanta_rooftop_gathering",
    order: 4,
    name: "Atlanta Rooftop Gathering",
    description: "Four lives, one skyline, one shared table — where every KAMELEON pathway finally meets.",
    points: 300,
    image: "/assets/kameleon/rewards/atlanta-rooftop-gathering.png",
    unlockDescription: "Unlocked by completing your pathway.",
  },
];

export const TOTAL_REWARD_POINTS = REWARD_CATALOG.reduce((sum, r) => sum + r.points, 0);
