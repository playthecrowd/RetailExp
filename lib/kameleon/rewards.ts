/**
 * The fixed KAMELEON reward catalog (curated art + copy, not admin-editable
 * yet) — static bundled assets, same convention as
 * public/assets/kameleon/fullscreen/*.png. Actual unlock/claim STATE per
 * user lives in Supabase (`experience_user_rewards`, see
 * app/experience/kameleon/actions.ts) — this file only describes what the
 * four rewards are.
 */
export interface RewardDefinition {
  id: string;
  order: number;
  name: string;
  points: number;
  image: string;
  /** Used in the Rewards inventory grid and the claim popup. */
  shortDescription: string;
  /** Used in the Rewards detail view. */
  fullDescription: string;
  symbolicMeaning: string;
  unlockDescription: string;
}

export const ASSET_CLASSIFICATION = "Digital Collectible — Placeable Game-Grid Tile";

export const REWARD_CATALOG: RewardDefinition[] = [
  {
    id: "kameleon_bottle_pedestal",
    order: 1,
    name: "KAMELEON Bottle Pedestal",
    points: 100,
    image: "/assets/kameleon/rewards/kameleon-bottle-pedestal.png",
    shortDescription: "A ceremonial display honoring the moment your KAMELEON journey begins.",
    fullDescription:
      "The KAMELEON Bottle Pedestal is a luxury obsidian-and-copper display tile featuring the signature KAMELEON Red Blend bottle. Ruby light moves through the engraved platform, representing the activation of the user's personal KAMELEON experience.",
    symbolicMeaning:
      "The bottle is the key that opens the experience. This reward represents identity, access, and the beginning of the user's journey.",
    unlockDescription: "Unlocked by creating your KAMELEON passport.",
  },
  {
    id: "ruby_portal",
    order: 2,
    name: "Ruby Portal",
    points: 150,
    image: "/assets/kameleon/rewards/ruby-portal.png",
    shortDescription: "A wine-powered gateway connecting separate worlds through one shared experience.",
    fullDescription:
      "The Ruby Portal is a miniature KAMELEON gateway formed from dark glass, copper, and swirling burgundy wine energy. In the KAMELEON story, the portal is activated by the bottle and transports each character from a separate life into a shared world.",
    symbolicMeaning:
      "The portal represents transformation, connection, and the ability of KAMELEON wine to blend different lives and environments into one experience.",
    unlockDescription: "Unlocked by completing the AR experience.",
  },
  {
    id: "perfect_pour_fountain",
    order: 3,
    name: "Perfect Pour Fountain",
    points: 200,
    image: "/assets/kameleon/rewards/perfect-pour-fountain.png",
    shortDescription: "Four glasses connected by one bottle, celebrating every choice that shapes the journey.",
    fullDescription:
      "The Perfect Pour Fountain is a sculptural KAMELEON bottle surrounded by four wine glasses. Four streams of illuminated ruby wine flow from the bottle toward the glasses, representing Lena, Marcus, Julian, and Ashley and the different choices available within their lives.",
    symbolicMeaning: 'This reward represents choice, possibility, and the central KAMELEON message: "Four Lives. One Pour."',
    unlockDescription: "Unlocked by making your first pathway decision.",
  },
  {
    id: "atlanta_rooftop_gathering",
    order: 4,
    name: "Atlanta Rooftop Gathering",
    points: 300,
    image: "/assets/kameleon/rewards/atlanta-rooftop-gathering.png",
    shortDescription: "A luxury Atlanta rooftop where four separate lives finally share one Perfect Pour.",
    fullDescription:
      "The Atlanta Rooftop Gathering is a miniature luxury rooftop environment overlooking the Atlanta skyline. Four lounge chairs surround a central table holding the KAMELEON bottle and four glasses, representing the moment Lena, Marcus, Julian, and Ashley arrive in the same shared world.",
    symbolicMeaning:
      "This reward represents convergence, friendship, completion, and the moment four different pathways become one KAMELEON story.",
    unlockDescription: "Unlocked by completing your pathway.",
  },
];

export const TOTAL_REWARD_POINTS = REWARD_CATALOG.reduce((sum, r) => sum + r.points, 0);
