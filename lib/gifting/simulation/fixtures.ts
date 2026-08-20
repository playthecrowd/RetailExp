import type {
  CreditSummary,
  ExperienceConfig,
  GalleryItem,
  GiftProduct,
  MediaRef,
  SceneTemplate,
} from "./types";

/**
 * Every piece of content the simulation shows.
 *
 * ONE PLACE, ON PURPOSE
 *   No component reaches for a file path or a demo name of its own. When this
 *   is replaced by Supabase-backed repositories, this module is what gets
 *   deleted — and because nothing else knows where a poster lives or what
 *   Jordan is called, nothing else has to change.
 *
 * PREVIEW ONLY
 *   The codes below are demo credentials for a prototype with no database
 *   behind it. They unlock fixture data and nothing else, which is why they
 *   are printed on the entry screen rather than hidden.
 */

const STILL = "/demo/gifting/stills";
const VIDEO = "/demo/gifting/video";

/** Preview-only. Fixture data, no database, no secrets. */
export const DEMO_PACKAGE_CODE = "KQ7MW-3TDHF";
export const DEMO_MESSAGE_CODE = "PXR4V-9GNCA";

/** A second, individually valid pair. It exists so the prototype can show the
 *  case that matters: two real codes from two DIFFERENT gifts must still be
 *  refused. Combining KQ7MW-3TDHF with this message code fails. */
export const DEMO_OTHER_PACKAGE_CODE = "HD2NJ-6WKPT";
export const DEMO_OTHER_MESSAGE_CODE = "TMY6Q-4FVRD";

/** Issued by the regift flow, so a tester can see a new pair appear. */
export const DEMO_REGIFT_PACKAGE_CODE = "VC6XA-2QJMH";

export const SENDER_NAME = "Jordan";

/**
 * The physical items, one per gift.
 *
 * Each has its own name, still and package code, which is what makes "gift 2
 * opens gift 2" something you can see rather than something you have to take
 * on trust. The names are deliberately house-brand neutral — this is a
 * template every client will restyle.
 */
export const PRODUCTS = {
  signatureReserve: {
    id: "prod-signature-reserve",
    name: "Signature Reserve",
    image: `${STILL}/hero-product.png`,
    alt: "A plain white luxury bottle on a brushed metal plinth",
    packageCode: DEMO_PACKAGE_CODE,
    experience: {
      poster: `${STILL}/poster-brand-intro.png`,
      video: `${VIDEO}/brand-intro.mp4`,
      alt: "The Signature Reserve, presented in the flagship",
    },
  },
  giftingSet: {
    id: "prod-gifting-set",
    name: "The Gifting Set",
    image: `${STILL}/product-package.png`,
    alt: "A white unbranded bottle with two neutral gift boxes and champagne ribbon",
    packageCode: DEMO_OTHER_PACKAGE_CODE,
    experience: {
      poster: `${STILL}/poster-standard-gift.png`,
      video: `${VIDEO}/standard-gift.mp4`,
      alt: "The Gifting Set, presented on a neutral table",
    },
  },
  atelierEdition: {
    id: "prod-atelier-edition",
    name: "Atelier Edition",
    image: `${STILL}/template-luxury-product-reveal.png`,
    alt: "The white bottle lit as a studio product reveal",
    packageCode: "RN4TC-6KVWQ",
    experience: {
      poster: `${STILL}/poster-ai-gift.png`,
      video: `${VIDEO}/ai-gift.mp4`,
      alt: "The Atelier Edition, lit as a studio reveal",
    },
  },
  houseSelection: {
    id: "prod-house-selection",
    name: "House Selection",
    image: `${STILL}/poster-standard-gift.png`,
    alt: "The white bottle presented on a neutral gift table",
    packageCode: "JW3KC-7PYDT",
    experience: {
      poster: `${STILL}/poster-standard-gift.png`,
      video: `${VIDEO}/standard-gift.mp4`,
      alt: "The House Selection, presented on a neutral table",
    },
  },
} satisfies Record<string, GiftProduct>;

/** What a newly created gift is attached to when the visitor starts from
 *  scratch rather than from something they already own. */
export const DEFAULT_NEW_PRODUCT: GiftProduct = {
  id: "prod-signature-package",
  name: "Signature Gift Package",
  image: `${STILL}/product-package.png`,
  alt: "A white unbranded bottle with neutral gift packaging",
  packageCode: DEMO_REGIFT_PACKAGE_CODE,
  experience: {
    poster: `${STILL}/poster-brand-intro.png`,
    video: `${VIDEO}/brand-intro.mp4`,
    alt: "The Signature Gift Package, presented in the flagship",
  },
};

export const media = {
  heroProduct: {
    poster: `${STILL}/hero-product.png`,
    alt: "A plain white luxury bottle on a brushed metal plinth in a bright studio",
  },
  product: {
    poster: `${STILL}/product-package.png`,
    alt: "A white unbranded bottle with two neutral gift boxes and champagne ribbon",
  },
  gateBackground: {
    poster: `${STILL}/gate-background.png`,
    alt: "A soft, bright retail interior with a white bottle to one side",
  },
  giftReveal: {
    poster: `${STILL}/poster-gift-reveal.png`,
    thumb: `${STILL}/template-gift-presentation.png`,
    video: `${VIDEO}/sender-gift-message.mp4`,
    alt: "A personal gift message",
  },
  brandIntro: {
    poster: `${STILL}/poster-brand-intro.png`,
    thumb: `${STILL}/template-modern-retail-welcome.png`,
    video: `${VIDEO}/brand-intro.mp4`,
    alt: "A bright flagship retail interior",
  },
  standardGift: {
    poster: `${STILL}/poster-standard-gift.png`,
    thumb: `${STILL}/hero-product.png`,
    video: `${VIDEO}/standard-gift.mp4`,
    alt: "A completed standard video gift",
  },
  aiGift: {
    poster: `${STILL}/poster-ai-gift.png`,
    thumb: `${STILL}/template-luxury-product-reveal.png`,
    video: `${VIDEO}/ai-gift.mp4`,
    alt: "A completed scene-generated video gift",
  },
  dashboardCard: {
    poster: `${STILL}/dashboard-card.png`,
    alt: "Product studio still",
  },
} satisfies Record<string, MediaRef>;

/** The poster the dashboard can swap the brand intro to, so the toggle has
 *  something visible to do. */
export const SIGNATURE_POSTER_OPTIONS = [
  { id: "retail", label: "Flagship interior", src: `${STILL}/poster-brand-intro.png` },
  { id: "studio", label: "Product studio", src: `${STILL}/hero-product.png` },
  { id: "gift", label: "Gift table", src: `${STILL}/poster-gift-reveal.png` },
];

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "tpl-luxury-product-reveal",
    slug: "luxury-product-reveal",
    title: "Luxury Product Reveal",
    description:
      "A clean white and brushed-metal product studio. You stand beside the bottle while soft cinematic light reveals it.",
    thumbnail: `${STILL}/template-luxury-product-reveal.png`,
    creditPrice: 12,
    active: true,
    sortOrder: 0,
  },
  {
    id: "tpl-modern-retail-welcome",
    slug: "modern-retail-welcome",
    title: "Modern Retail Welcome",
    description:
      "A bright flagship interior with glass shelving and soft daylight. You deliver your message naturally.",
    thumbnail: `${STILL}/template-modern-retail-welcome.png`,
    creditPrice: 10,
    active: true,
    sortOrder: 1,
  },
  {
    id: "tpl-gift-presentation",
    slug: "gift-presentation",
    title: "Gift Presentation",
    description:
      "A refined gift table with neutral packaging and ribbon. You present the gift directly to your recipient.",
    thumbnail: `${STILL}/template-gift-presentation.png`,
    creditPrice: 14,
    active: true,
    sortOrder: 2,
  },
];

export const DEFAULT_CONFIG: ExperienceConfig = {
  // 21+ after the personalised reveal, which is what the brief specifies for
  // this client. The prototype control can move it to any of the others.
  gateKind: "age_21",
  gateHeading: "Are you 21 or older?",
  gateBody:
    "You must be 21 or older to continue this demonstration experience. Please enjoy and share responsibly.",
  gateConfirmLabel: "Yes, I'm 21+",
  gateDeclineLabel: "No, Exit",
  signatureExperienceEnabled: true,
  signaturePosterId: "retail",
  standardGiftingEnabled: true,
  aiGiftingEnabled: true,
  regiftingEnabled: true,
  phoneRequired: false,
  marketingConsentEnabled: true,
};

export const GATE_PRESETS: Record<
  ExperienceConfig["gateKind"],
  Pick<ExperienceConfig, "gateHeading" | "gateBody" | "gateConfirmLabel" | "gateDeclineLabel">
> = {
  disabled: {
    gateHeading: "",
    gateBody: "",
    gateConfirmLabel: "",
    gateDeclineLabel: "",
  },
  age_18: {
    gateHeading: "Are you 18 or older?",
    gateBody:
      "You must be 18 or older to continue this demonstration experience. Please enjoy and share responsibly.",
    gateConfirmLabel: "Yes, I'm 18+",
    gateDeclineLabel: "No, Exit",
  },
  age_21: {
    gateHeading: "Are you 21 or older?",
    gateBody:
      "You must be 21 or older to continue this demonstration experience. Please enjoy and share responsibly.",
    gateConfirmLabel: "Yes, I'm 21+",
    gateDeclineLabel: "No, Exit",
  },
  acknowledgement: {
    gateHeading: "A moment before you continue",
    gateBody:
      "This demonstration contains a personal video message prepared for you. Please confirm you would like to view it now.",
    gateConfirmLabel: "Yes, continue",
    gateDeclineLabel: "Not now",
  },
};

export const INITIAL_CREDITS: CreditSummary = {
  available: 240,
  reserved: 12,
  purchased: 0,
  consumed: 48,
  promotional: 300,
  lowBalanceThreshold: 50,
};

export const INITIAL_GALLERY: GalleryItem[] = [
  {
    id: "gift-received-1",
    kind: "standard",
    direction: "received",
    title: `A gift from ${SENDER_NAME}`,
    subtitle: PRODUCTS.signatureReserve.name,
    media: media.giftReveal,
    createdLabel: "Received today",
    packageCode: DEMO_PACKAGE_CODE,
    messageCode: DEMO_MESSAGE_CODE,
    product: PRODUCTS.signatureReserve,
    senderName: SENDER_NAME,
    recipientName: "You",
    message:
      "I saw this and thought of the night we opened the last one. Save it for something worth marking.",
    assignment: "active",
  },
  {
    id: "gift-received-2",
    kind: "ai",
    direction: "received",
    title: "A gift from Mara",
    subtitle: PRODUCTS.atelierEdition.name,
    media: media.aiGift,
    stage: "ready",
    templateTitle: "Luxury Product Reveal",
    createdLabel: "Received last week",
    packageCode: PRODUCTS.atelierEdition.packageCode,
    messageCode: "GD7VP-2XNRC",
    product: PRODUCTS.atelierEdition,
    senderName: "Mara",
    recipientName: "You",
    message: "For the new place. Open it when the last box is unpacked.",
    assignment: "active",
  },
  {
    id: "gift-created-standard",
    kind: "standard",
    direction: "created",
    title: "For Alex",
    subtitle: PRODUCTS.giftingSet.name,
    media: media.standardGift,
    createdLabel: "Created yesterday",
    packageCode: DEMO_OTHER_PACKAGE_CODE,
    messageCode: DEMO_OTHER_MESSAGE_CODE,
    product: PRODUCTS.giftingSet,
    senderName: "You",
    recipientName: "Alex",
    message: "Congratulations. You earned every bit of this one.",
    assignment: "active",
  },
  {
    id: "gift-created-ai-processing",
    kind: "ai",
    direction: "created",
    title: "For Sam",
    subtitle: PRODUCTS.houseSelection.name,
    media: media.aiGift,
    stage: "building_scene",
    templateTitle: "Modern Retail Welcome",
    createdLabel: "Started a moment ago",
    packageCode: PRODUCTS.houseSelection.packageCode,
    product: PRODUCTS.houseSelection,
    senderName: "You",
    recipientName: "Sam",
    message: "A small thank you for covering for me all month.",
    assignment: "active",
  },
];

/** Dashboard fixtures. Enough rows that each table reads as real without
 *  pretending to be a data set. */
export const DASHBOARD_FIXTURES = {
  overview: {
    visitors: 128,
    giftsCreated: 46,
    giftsReceived: 39,
    giftsOpened: 31,
    aiCompleted: 18,
    aiFailed: 1,
  },
  packages: [
    { code: DEMO_PACKAGE_CODE, status: "assigned", batch: "DEMO-A", recipient: "You" },
    { code: DEMO_OTHER_PACKAGE_CODE, status: "assigned", batch: "DEMO-A", recipient: "Alex" },
    { code: DEMO_REGIFT_PACKAGE_CODE, status: "available", batch: "DEMO-B", recipient: "—" },
    { code: "LN9FR-8KCWD", status: "opened", batch: "DEMO-A", recipient: "Priya" },
    { code: "ZB3TC-5MHQX", status: "revoked", batch: "DEMO-B", recipient: "—" },
  ],
  visitors: [
    { name: "Jordan Ellery", email: "jordan@example.com", sent: 3, received: 1, last: "Today" },
    { name: "Alex Mercer", email: "alex@example.com", sent: 1, received: 2, last: "Yesterday" },
    { name: "Priya Raman", email: "priya@example.com", sent: 0, received: 1, last: "Last week" },
  ],
  giftMessages: [
    {
      sender: "Jordan",
      recipient: "You",
      packageStatus: "assigned",
      messageStatus: "active",
      source: "ready",
      completed: "ready",
      state: "active",
    },
    {
      sender: "You",
      recipient: "Alex",
      packageStatus: "assigned",
      messageStatus: "active",
      source: "ready",
      completed: "ready",
      state: "active",
    },
    {
      sender: "You",
      recipient: "Sam",
      packageStatus: "unassigned",
      messageStatus: "pending",
      source: "ready",
      completed: "generating",
      state: "processing",
    },
  ],
  aiJobs: [
    {
      id: "GEN-8841",
      template: "Modern Retail Welcome",
      provider: "Preview",
      status: "generating",
      attempts: 1,
      expense: "$0.00",
      charge: "10 credits",
    },
    {
      id: "GEN-8836",
      template: "Luxury Product Reveal",
      provider: "Preview",
      status: "ready",
      attempts: 1,
      expense: "$0.00",
      charge: "12 credits",
    },
    {
      id: "GEN-8829",
      template: "Gift Presentation",
      provider: "Preview",
      status: "failed",
      attempts: 2,
      expense: "$0.00",
      charge: "refunded",
    },
  ],
  creditHistory: [
    { type: "Promotional grant", amount: "+300", note: "Demo allocation", when: "Last week" },
    { type: "Generation charge", amount: "−12", note: "Luxury Product Reveal", when: "Last week" },
    { type: "Generation charge", amount: "−10", note: "Modern Retail Welcome", when: "Yesterday" },
    { type: "Reservation", amount: "−12", note: "Gift Presentation (held)", when: "Today" },
    { type: "Technical refund", amount: "+14", note: "job-8829 failed", when: "Today" },
  ],
  team: [
    { name: "Dana Whitfield", email: "dana@giftingdemo.example", role: "Owner", status: "Active" },
    { name: "Marco Reyes", email: "marco@giftingdemo.example", role: "Editor", status: "Active" },
    { name: "Sasha Kim", email: "sasha@giftingdemo.example", role: "Viewer", status: "Invited" },
  ],
  mediaLibrary: [
    { name: "Signature Product Experience", kind: "Video", src: media.brandIntro.poster },
    { name: "Gift reveal", kind: "Video", src: media.giftReveal.poster },
    { name: "Standard gift", kind: "Video", src: media.standardGift.poster },
    { name: "Scene gift", kind: "Video", src: media.aiGift.poster },
    { name: "Eligibility gate", kind: "Image", src: media.gateBackground.poster },
    { name: "Product package", kind: "Image", src: media.product.poster },
  ],
};
