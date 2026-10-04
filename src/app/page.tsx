import type { Metadata } from "next";

import { UploaderHeader } from "@/components/site-header";
import { Uploader } from "@/components/uploader/uploader";
import { requireUploader } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "New transfer" };

export default async function HomePage() {
  await requireUploader();
  return <Uploader header={<UploaderHeader current="new" />} appUrl={env.appUrl} />;
}
