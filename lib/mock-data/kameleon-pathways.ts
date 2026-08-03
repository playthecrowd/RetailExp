import { buildPathwayTree, type NodeSpec } from "@/lib/kameleon/build-pathway-tree";
import type { Pathway, VideoNode } from "@/lib/kameleon/pathway-model";

const CLIENT_ID = "kameleon";
const EXPERIENCE_ID = "kameleon-journey";

/**
 * Four pathways, each a real binary tree resolved entirely through
 * Choice.destinationNodeId (see lib/kameleon/build-pathway-tree.ts — no
 * navigation is inferred from label text). Private Pour goes three levels
 * deep on one branch to demonstrate the model isn't limited to depth 2;
 * the other three pathways go two levels deep. The builder itself is
 * depth-agnostic — additional levels are a data change, not a code change.
 */

const privatePourRoot: NodeSpec = {
  title: "Private Pour",
  description: "A space for clarity. Step away from the noise and discover what becomes visible in stillness.",
  durationSeconds: 248,
  left: {
    label: "Follow the Energy",
    description: "Step through the door and join the gathering.",
    child: {
      title: "Social Shift",
      description: "The gathering pulls you in. Connection sharpens the night into focus.",
      durationSeconds: 240,
      left: {
        label: "Follow the Craft",
        description: "Slip away to where the night is being made by hand.",
        child: {
          title: "Create",
          description: "Imagine. Inspire. Build. The night takes shape in your hands.",
          durationSeconds: 244,
          left: {
            label: "Bring It to the Table",
            description: "Everything you've made leads to one last room.",
            child: { title: "The Table", description: "Four cities. Four lives. One connection.", durationSeconds: 210 },
          },
          right: {
            label: "One More Round",
            description: "The night isn't ready to end just yet.",
            child: { title: "Last Call", description: "One more pour before the room empties out.", durationSeconds: 198 },
          },
        },
      },
      right: {
        label: "Follow the Toast",
        description: "Stay for the moment everyone has been waiting for.",
        child: { title: "The Table", description: "Four cities. Four lives. One connection.", durationSeconds: 210 },
      },
    },
  },
  right: {
    label: "Follow the View",
    description: "Move toward the skyline and a moment of clarity.",
    child: {
      title: "Arrive",
      description: "Move toward the skyline. Every step is elevation.",
      durationSeconds: 236,
      left: {
        label: "Chase the Skyline",
        description: "Keep climbing toward where the night is still being built.",
        child: { title: "The Table", description: "Four cities. Four lives. One connection.", durationSeconds: 210 },
      },
      right: {
        label: "Arrive at the Table",
        description: "The celebration has already found its center.",
        child: { title: "The Table", description: "Four cities. Four lives. One connection.", durationSeconds: 210 },
      },
    },
  },
};

const socialShiftRoot: NodeSpec = {
  title: "Social Shift",
  description: "Connect. Share. Belong. The gathering pulls you in.",
  durationSeconds: 240,
  left: {
    label: "Follow the Music",
    description: "The bass pulls you toward the dance floor.",
    child: {
      title: "Dance Floor",
      description: "The night moves faster here.",
      durationSeconds: 212,
      left: {
        label: "Lose Yourself",
        description: "Stop counting the hours.",
        child: { title: "Midnight Anthem", description: "The room sings the same line back at once.", durationSeconds: 190 },
      },
      right: {
        label: "Step Outside",
        description: "Catch your breath under the skyline.",
        child: { title: "City Air", description: "The noise fades into the skyline for a moment.", durationSeconds: 176 },
      },
    },
  },
  right: {
    label: "Follow the Conversation",
    description: "A quieter corner, a familiar face.",
    child: {
      title: "Fireside Chat",
      description: "Some connections happen in the quiet corners.",
      durationSeconds: 204,
      left: {
        label: "Open Up",
        description: "Say the thing you've been holding onto.",
        child: { title: "New Friend", description: "A stranger an hour ago, now part of the story.", durationSeconds: 182 },
      },
      right: {
        label: "Listen In",
        description: "Let someone else's night in.",
        child: { title: "Old Story", description: "Every city has one — tonight, you hear it.", durationSeconds: 188 },
      },
    },
  },
};

const createRoot: NodeSpec = {
  title: "Create",
  description: "Imagine. Inspire. Build. The night takes shape in your hands.",
  durationSeconds: 244,
  left: {
    label: "Pick Up the Brush",
    description: "Color says what words can't.",
    child: {
      title: "First Stroke",
      description: "The canvas is still mostly blank.",
      durationSeconds: 200,
      left: {
        label: "Chase the Color",
        description: "Follow whatever feels true.",
        child: { title: "Finished Canvas", description: "It wasn't the plan, but it's exactly right.", durationSeconds: 178 },
      },
      right: {
        label: "Chase the Shadow",
        description: "Sometimes what's missing is the point.",
        child: { title: "Unfinished Sketch", description: "Some nights are better left incomplete.", durationSeconds: 172 },
      },
    },
  },
  right: {
    label: "Pick Up the Pen",
    description: "The story writes itself if you let it.",
    child: {
      title: "First Line",
      description: "The page is patient. You aren't.",
      durationSeconds: 196,
      left: {
        label: "Write the Truth",
        description: "The honest version is harder, and better.",
        child: { title: "Torn Page", description: "Some drafts only exist to be let go.", durationSeconds: 166 },
      },
      right: {
        label: "Write the Story",
        description: "Let the night become something worth telling.",
        child: { title: "Closing Line", description: "Every good night ends on the right sentence.", durationSeconds: 184 },
      },
    },
  },
};

const arriveRoot: NodeSpec = {
  title: "Arrive",
  description: "Celebrate. Elevate. Arrive.",
  durationSeconds: 236,
  left: {
    label: "Chase the Skyline",
    description: "Higher always feels closer to arriving.",
    child: {
      title: "Rooftop Air",
      description: "The city looks different from up here.",
      durationSeconds: 194,
      left: {
        label: "Watch the Sunset",
        description: "Let the color fade before the lights take over.",
        child: { title: "Golden Hour", description: "The last warm light before the city turns electric.", durationSeconds: 168 },
      },
      right: {
        label: "Watch the City",
        description: "Stay for the moment the lights come on.",
        child: { title: "First Light", description: "The skyline wakes up one window at a time.", durationSeconds: 174 },
      },
    },
  },
  right: {
    label: "Chase the Lights",
    description: "The street has its own kind of arrival.",
    child: {
      title: "City Below",
      description: "Ground level has an energy the rooftop can't match.",
      durationSeconds: 202,
      left: {
        label: "Walk the Street",
        description: "Let the city move around you.",
        child: { title: "Neon Reflection", description: "The wet pavement doubles every light in the block.", durationSeconds: 170 },
      },
      right: {
        label: "Hail a Ride",
        description: "One more stop before the night closes.",
        child: { title: "Last Stop", description: "Every road tonight leads back to the same table.", durationSeconds: 180 },
      },
    },
  },
};

const privatePour = buildPathwayTree(CLIENT_ID, EXPERIENCE_ID, "private-pour", privatePourRoot);
const socialShift = buildPathwayTree(CLIENT_ID, EXPERIENCE_ID, "social-shift", socialShiftRoot);
const create = buildPathwayTree(CLIENT_ID, EXPERIENCE_ID, "create", createRoot);
const arrive = buildPathwayTree(CLIENT_ID, EXPERIENCE_ID, "arrive", arriveRoot);

export const kameleonPathways: Pathway[] = [
  {
    id: "private-pour",
    slug: "private-pour",
    label: "Private Pour",
    subtitle: "Reflection. Reset. Breathe.",
    description: "A space for clarity, reflection, and stillness.",
    motif: "private-pour",
    accent: "red",
    rootNodeId: privatePour.rootNodeId,
    sortOrder: 0,
  },
  {
    id: "social-shift",
    slug: "social-shift",
    label: "Social Shift",
    subtitle: "Connect. Share. Belong.",
    description: "The gathering pulls you in.",
    motif: "social-shift",
    accent: "blue",
    rootNodeId: socialShift.rootNodeId,
    sortOrder: 1,
  },
  {
    id: "create",
    slug: "create",
    label: "Create",
    subtitle: "Imagine. Inspire. Build.",
    description: "The night takes shape in your hands.",
    motif: "create",
    accent: "red",
    rootNodeId: create.rootNodeId,
    sortOrder: 2,
  },
  {
    id: "arrive",
    slug: "arrive",
    label: "Arrive",
    subtitle: "Celebrate. Elevate. Arrive.",
    description: "Every step is elevation.",
    motif: "arrive",
    accent: "blue",
    rootNodeId: arrive.rootNodeId,
    sortOrder: 3,
  },
];

export const kameleonNodesById: Record<string, VideoNode> = {
  ...privatePour.nodes,
  ...socialShift.nodes,
  ...create.nodes,
  ...arrive.nodes,
};

export function getPathway(pathwayId: string): Pathway | undefined {
  return kameleonPathways.find((p) => p.id === pathwayId);
}

export function getNode(nodeId: string): VideoNode | undefined {
  return kameleonNodesById[nodeId];
}

export function getPathwayForNode(nodeId: string): Pathway | undefined {
  const node = kameleonNodesById[nodeId];
  if (!node) return undefined;
  return getPathway(node.pathwayId);
}
