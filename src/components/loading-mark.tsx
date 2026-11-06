"use client";

import { ArrowRight } from "lucide-react";
import { useLinkStatus } from "next/link";

export function LoadingMark() {
  return <span className="loading-mark" aria-hidden="true" />;
}

export function LoginLinkMark() {
  const { pending } = useLinkStatus();
  return <span className="login-link-mark" aria-busy={pending}>
    {pending ? <LoadingMark /> : <ArrowRight size={18} strokeWidth={1.8} />}
  </span>;
}
