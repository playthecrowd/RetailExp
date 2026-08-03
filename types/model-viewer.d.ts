import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * `<model-viewer>` is a custom element from `@google/model-viewer` (no
 * bundled React/JSX types) — this declares just the attributes this project
 * actually uses so it can be used directly in JSX with type-checking.
 *
 * React 19's `react-jsx` transform resolves JSX intrinsics through the
 * `React.JSX` namespace (module augmentation of "react"), not the classic
 * global `JSX` namespace — augmenting the global namespace alone silently
 * has no effect under this transform.
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        ar?: boolean;
        "ar-modes"?: string;
        "ar-scale"?: string;
        "ar-placement"?: string;
        "camera-controls"?: boolean;
        "auto-rotate"?: boolean;
        autoplay?: boolean;
        "animation-name"?: string;
        exposure?: string | number;
        "shadow-intensity"?: string | number;
        poster?: string;
        loading?: string;
        reveal?: string;
        "ios-src"?: string;
      };
    }
  }
}

export {};
