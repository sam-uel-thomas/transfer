import { UploaderHeader } from "@/components/site-header";
import { Eyebrow } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <UploaderHeader current="transfers" />
      <main className="gutter flex flex-1 flex-col pt-5 md:pt-6">
        <Eyebrow left={<span role="status">Loading transfers</span>} />
        <div className="loading-rule mt-4" />
      </main>
    </div>
  );
}
