"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  DEFAULT_CONFIG,
  DEMO_MESSAGE_CODE,
  DEMO_PACKAGE_CODE,
  DEMO_REGIFT_PACKAGE_CODE,
  GATE_PRESETS,
  INITIAL_CREDITS,
  INITIAL_GALLERY,
  SCENE_TEMPLATES,
  SENDER_NAME,
  media,
} from "./fixtures";
import type {
  AiJobStage,
  CreditSummary,
  ExperienceConfig,
  GalleryItem,
  GateKind,
  GiftVideoKind,
  SceneTemplate,
} from "./types";

/**
 * The whole prototype's state, in one reducer.
 *
 * WHY A REDUCER AND NOT SCATTERED useState
 *   Five scenarios share one configuration and one gallery: a dashboard toggle
 *   has to change what the recipient flow does, and a gift created in the
 *   sender flow has to appear in the gallery the recipient flow opens. That is
 *   a single state machine wearing five hats, and splitting it across screens
 *   would mean synchronising them.
 *
 * WHY IT IS ALL IN MEMORY
 *   This checkpoint is explicitly for looking at and approving the experience.
 *   Nothing persists, nothing is written anywhere, and a refresh returns the
 *   prototype to its opening state — which is the correct behaviour for a
 *   thing meant to be demonstrated repeatedly.
 */

export type Scenario =
  | "launcher"
  | "receive"
  | "create"
  | "regift"
  | "gallery"
  | "dashboard";

export type RecipientStep =
  | "welcome"
  | "package-code"
  | "message-code"
  | "reveal"
  | "gate"
  | "declined"
  | "intro"
  | "capture"
  | "experience"
  | "gallery";

export type SenderStep =
  | "intro"
  | "record"
  | "uploading"
  | "preview"
  | "choose-kind"
  | "choose-template"
  | "consent"
  | "recipient"
  | "message-code"
  | "package-code"
  | "confirm-product"
  | "processing"
  | "card"
  | "gallery";

export interface Draft {
  kind: GiftVideoKind;
  templateId: string | null;
  likenessConsent: boolean;
  audioConsent: boolean;
  preserveOriginalAudio: boolean;
  recipientName: string;
  recipientContact: string;
  note: string;
  messageCode: string | null;
  packageCode: string | null;
  isRegift: boolean;
}

export interface VisitorProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  marketingConsent: boolean;
}

interface State {
  scenario: Scenario;
  recipientStep: RecipientStep;
  senderStep: SenderStep;
  config: ExperienceConfig;
  templates: SceneTemplate[];
  credits: CreditSummary;
  gallery: GalleryItem[];
  draft: Draft;
  visitor: VisitorProfile | null;
  codeError: string | null;
  packageCodeEntered: string;
  uploadPercent: number;
  aiStage: AiJobStage | null;
  /** Set when a gift is bound, so the access card and the gallery agree. */
  lastIssued: { messageCode: string; packageCode: string; recipientName: string } | null;
  toast: string | null;
}

const emptyDraft: Draft = {
  kind: "standard",
  templateId: null,
  likenessConsent: false,
  audioConsent: false,
  preserveOriginalAudio: true,
  recipientName: "",
  recipientContact: "",
  note: "",
  messageCode: null,
  packageCode: null,
  isRegift: false,
};

const initialState: State = {
  scenario: "launcher",
  recipientStep: "welcome",
  senderStep: "intro",
  config: DEFAULT_CONFIG,
  templates: SCENE_TEMPLATES,
  credits: INITIAL_CREDITS,
  gallery: INITIAL_GALLERY,
  draft: emptyDraft,
  visitor: null,
  codeError: null,
  packageCodeEntered: "",
  uploadPercent: 0,
  aiStage: null,
  lastIssued: null,
  toast: null,
};

type Action =
  | { type: "SCENARIO"; scenario: Scenario }
  | { type: "RECIPIENT_STEP"; step: RecipientStep }
  | { type: "SENDER_STEP"; step: SenderStep }
  | { type: "PACKAGE_CODE_OK"; code: string }
  | { type: "CODE_ERROR"; message: string }
  | { type: "CLEAR_CODE_ERROR" }
  | { type: "CONFIG"; patch: Partial<ExperienceConfig> }
  | { type: "GATE_KIND"; kind: GateKind }
  | { type: "TOGGLE_TEMPLATE"; id: string }
  | { type: "CAPTURE"; visitor: VisitorProfile }
  | { type: "DRAFT"; patch: Partial<Draft> }
  | { type: "START_CREATE"; isRegift: boolean }
  | { type: "UPLOAD"; percent: number }
  | { type: "AI_STAGE"; stage: AiJobStage | null }
  | { type: "RESERVE_CREDITS"; amount: number }
  | { type: "CHARGE_CREDITS"; amount: number }
  | { type: "BIND"; messageCode: string; packageCode: string }
  | { type: "ADD_GALLERY"; item: GalleryItem }
  | { type: "PROMOTE_AI_ITEM"; id: string }
  | { type: "DELETE_ITEM"; id: string }
  | { type: "TOAST"; message: string | null }
  | { type: "RESET_FLOW" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SCENARIO":
      return { ...state, scenario: action.scenario, codeError: null };
    case "RECIPIENT_STEP":
      return { ...state, recipientStep: action.step, codeError: null };
    case "SENDER_STEP":
      return { ...state, senderStep: action.step };
    case "PACKAGE_CODE_OK":
      return { ...state, packageCodeEntered: action.code, codeError: null };
    case "CODE_ERROR":
      return { ...state, codeError: action.message };
    case "CLEAR_CODE_ERROR":
      return { ...state, codeError: null };
    case "CONFIG":
      return { ...state, config: { ...state.config, ...action.patch } };
    case "GATE_KIND":
      // The copy follows the kind, so switching to 18+ in the dashboard
      // actually changes what the gate says rather than leaving 21+ wording.
      return {
        ...state,
        config: { ...state.config, gateKind: action.kind, ...GATE_PRESETS[action.kind] },
      };
    case "TOGGLE_TEMPLATE":
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === action.id ? { ...t, active: !t.active } : t,
        ),
      };
    case "CAPTURE":
      return { ...state, visitor: action.visitor };
    case "DRAFT":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "START_CREATE":
      return {
        ...state,
        draft: { ...emptyDraft, isRegift: action.isRegift },
        senderStep: "intro",
        uploadPercent: 0,
        aiStage: null,
        lastIssued: null,
      };
    case "UPLOAD":
      return { ...state, uploadPercent: action.percent };
    case "AI_STAGE":
      return { ...state, aiStage: action.stage };
    case "RESERVE_CREDITS":
      return {
        ...state,
        credits: {
          ...state.credits,
          available: state.credits.available - action.amount,
          reserved: state.credits.reserved + action.amount,
        },
      };
    case "CHARGE_CREDITS":
      // The reservation converts to a charge: reserved falls, consumed rises,
      // available is untouched because it already came off at reservation.
      return {
        ...state,
        credits: {
          ...state.credits,
          reserved: Math.max(0, state.credits.reserved - action.amount),
          consumed: state.credits.consumed + action.amount,
        },
      };
    case "BIND":
      return {
        ...state,
        draft: { ...state.draft, messageCode: action.messageCode, packageCode: action.packageCode },
        lastIssued: {
          messageCode: action.messageCode,
          packageCode: action.packageCode,
          recipientName: state.draft.recipientName || "your recipient",
        },
      };
    case "ADD_GALLERY":
      return { ...state, gallery: [action.item, ...state.gallery] };
    case "PROMOTE_AI_ITEM":
      return {
        ...state,
        gallery: state.gallery.map((item) =>
          item.id === action.id
            ? { ...item, stage: "ready", subtitle: item.templateTitle ?? "Scene generation" }
            : item,
        ),
      };
    case "DELETE_ITEM":
      return { ...state, gallery: state.gallery.filter((item) => item.id !== action.id) };
    case "TOAST":
      return { ...state, toast: action.message };
    case "RESET_FLOW":
      return {
        ...state,
        recipientStep: "welcome",
        senderStep: "intro",
        draft: emptyDraft,
        uploadPercent: 0,
        aiStage: null,
        codeError: null,
        lastIssued: null,
      };
    default:
      return state;
  }
}

interface StoreValue extends State {
  dispatch: (action: Action) => void;
  /** Fixture-backed implementation of the code service. Both codes must
   *  resolve to the same demo assignment; anything else fails identically. */
  validateCodes: (packageCode: string, messageCode: string) => boolean;
  issueMessageCode: () => string;
  activeTemplates: SceneTemplate[];
  showToast: (message: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function GiftingSimulationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateCodes = useCallback((packageCode: string, messageCode: string) => {
    // The binding rule, simulated: the pair must belong to the SAME gift. Two
    // individually valid codes from different gifts is the interesting failure
    // and it is refused here exactly as the real resolver refuses it.
    const pkg = norm(packageCode);
    const msg = norm(messageCode);
    const pairs = [
      [norm(DEMO_PACKAGE_CODE), norm(DEMO_MESSAGE_CODE)],
      // A regifted package resolves against whatever code the sender flow
      // issued in this session.
      ...(state.lastIssued
        ? [[norm(state.lastIssued.packageCode), norm(state.lastIssued.messageCode)]]
        : []),
    ];
    return pairs.some(([p, m]) => p === pkg && m === msg);
  }, [state.lastIssued]);

  const issueMessageCode = useCallback(() => {
    // Opaque and non-sequential, using the same read-aloud-safe alphabet the
    // real generator uses. Crypto strength is not the point in a prototype;
    // looking and behaving like a real code is.
    const alphabet = "23467９ACDEFGHJKMNPQRTUVWXYZ".replace("９", "9");
    const pick = () =>
      Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `${pick()}-${pick()}`;
  }, []);

  const showToast = useCallback((message: string) => {
    dispatch({ type: "TOAST", message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => dispatch({ type: "TOAST", message: null }), 2600);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      dispatch,
      validateCodes,
      issueMessageCode,
      activeTemplates: state.templates.filter((t) => t.active),
      showToast,
    }),
    [state, validateCodes, issueMessageCode, showToast],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useGifting(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useGifting must be used inside GiftingSimulationProvider");
  return ctx;
}

export { DEMO_PACKAGE_CODE, DEMO_MESSAGE_CODE, DEMO_REGIFT_PACKAGE_CODE, SENDER_NAME, media };
