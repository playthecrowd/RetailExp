"use client";

import { Button } from "@/components/ui/Button";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";
import { Viewfinder } from "@/components/kameleon/art/Viewfinder";
import { CameraIcon, NoAppIcon, EyeOffIcon, ShieldIcon } from "@/components/kameleon/icons";

/**
 * Pre-session screen: explains what AR will do and gets the required
 * explicit user gesture before ever requesting camera/XR permission. The
 * "Allow camera & begin AR" button's onClick is the actual user gesture
 * WebXR's `requestSession` call rides on — nothing about starting the
 * session may happen before this tap.
 */
export function ARStartScreen({
  checking,
  onStart,
  onSkip,
}: {
  checking: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-8 px-6 pb-8">
      <KameleonFlowHeader
        steps={[
          { id: "commercial", label: "Commercial", status: "complete" },
          { id: "ar", label: "AR", status: "current" },
          { id: "journey", label: "Journey", status: "upcoming" },
        ]}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <Viewfinder />

        <div>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
            Bring the bottle to life
          </h1>
          <p className="mt-3 max-w-xs text-sm text-kameleon-text-muted">
            Once AR starts, move your phone slowly and point it toward the floor to find a
            surface.
          </p>
        </div>

        <div className="flex items-center justify-center gap-6 text-kameleon-text-muted">
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <CameraIcon className="h-6 w-6" />
            Camera access
          </span>
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <NoAppIcon className="h-6 w-6" />
            No app required
          </span>
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <EyeOffIcon className="h-6 w-6" />
            Nothing is recorded
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <Button brand="kameleon" size="lg" fullWidth onClick={onStart} disabled={checking}>
          {checking ? "Checking AR support…" : "Allow camera & begin AR"}
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          Continue without AR
        </button>
        <p className="flex items-center gap-1.5 text-center text-xs text-kameleon-text-muted">
          <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
          Camera access is requested only when you tap above, is used only for this experience,
          and is never recorded or uploaded.
        </p>
      </div>
    </div>
  );
}
