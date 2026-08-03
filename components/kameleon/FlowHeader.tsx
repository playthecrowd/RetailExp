import { ProgressSteps, type ProgressStep } from "@/components/ui/ProgressSteps";
import { cn } from "@/lib/cn";

export function KameleonFlowHeader({
  steps,
  className,
  underlineCurrent = false,
}: {
  steps: ProgressStep[];
  className?: string;
  underlineCurrent?: boolean;
}) {
  return (
    <header className={cn("flex justify-center px-6 pt-6", className)}>
      <ProgressSteps steps={steps} brand="kameleon" underlineCurrent={underlineCurrent} />
    </header>
  );
}
