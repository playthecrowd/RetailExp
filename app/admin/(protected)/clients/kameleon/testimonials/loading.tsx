import { LoadingState } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <LoadingState message="Loading the moderation queue…" />
    </div>
  );
}
