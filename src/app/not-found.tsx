import type { Metadata } from "next";

import { StatePage } from "@/components/state-page";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <StatePage label="Transfer" detail="404" title="Nothing here.">
      <p>This link does not exist, or the transfer was deleted. Check the address, or ask the sender for a new link.</p>
    </StatePage>
  );
}
