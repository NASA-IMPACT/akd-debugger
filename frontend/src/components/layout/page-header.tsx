import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  title: string;
  titleAction?: ReactNode;
  backHref?: string;
  backLabel?: string;
  children?: ReactNode; // actions slot
  subtitle?: ReactNode;
}

export function PageHeader({ title, titleAction, backHref, backLabel, children, subtitle }: Props) {
  return (
    <div className="mb-3">
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-muted text-[13px] no-underline mb-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            {backLabel || "Back"}
          </Link>
        )}
        <div className="flex items-center gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {titleAction}
        </div>
        {subtitle}
      </div>
      {children && <div className="flex flex-wrap gap-2 mt-2.5">{children}</div>}
    </div>
  );
}
