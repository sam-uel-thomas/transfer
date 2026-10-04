"use client";

import { useEffect } from "react";

import { StatePage } from "@/components/state-page";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePage
      label="Transfer"
      detail={error.digest ? `Ref ${error.digest}` : "Error"}
      title="Not working."
      action={
        <Button variant="primary" onClick={() => retry()}>
          <span>Try again</span>
        </Button>
      }
    >
      <p>Something failed on our side while loading this page. Nothing was lost. Try again in a moment.</p>
    </StatePage>
  );
}
