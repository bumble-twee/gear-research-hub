import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { DeleteSearchButton } from "../../DeleteSearchButton";
import { CandidateList } from "./CandidateList";
import { LocalTime } from "./LocalTime";
import { PrioritiesEditor } from "./PrioritiesEditor";
import { RequiredFeaturesEditor } from "./RequiredFeaturesEditor";
import {
  SEARCH_STATUS_STYLES,
  currencySymbol,
  normalizeRequiredFeatures,
  ownedDuration,
} from "./format";
import type { CandidateRow, OwnedItemRow, PriceSnapshotRow, SearchRow } from "./types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only, never in client code
);

export default async function SearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: search, error: searchErr } = await supabase
    .from("searches")
    .select("*")
    .eq("id", id)
    .single();

  if (searchErr || !search) {
    notFound();
  }
  const searchRow = search as SearchRow;

  const [{ data: candidates, error: candidatesErr }, ownedItem, { data: sites, error: sitesErr }] =
    await Promise.all([
      supabase
        .from("candidates")
        .select("*")
        .eq("search_id", id)
        .order("created_at", { ascending: true }),
      searchRow.replaces_item_id
        ? supabase
            .from("owned_items")
            .select("*")
            .eq("id", searchRow.replaces_item_id)
            .single()
            .then((r) => r.data as OwnedItemRow | null)
        : Promise.resolve(null),
      supabase
        .from("preferred_sites")
        .select("site_type, domain, priority")
        .eq("active", true)
        .order("priority", { ascending: true }),
    ]);
  if (candidatesErr) throw candidatesErr;
  if (sitesErr) throw sitesErr;

  const retailerDomains = (sites ?? [])
    .filter((s) => s.site_type === "retailer")
    .map((s) => s.domain);
  const reviewDomains = (sites ?? [])
    .filter((s) => s.site_type === "review")
    .map((s) => s.domain);

  const candidateRows = (candidates ?? []) as CandidateRow[];
  const candidateIds = candidateRows.map((c) => c.id);

  let priceSnapshots: PriceSnapshotRow[] = [];
  if (candidateIds.length > 0) {
    const { data, error } = await supabase
      .from("price_snapshots")
      .select("*")
      .in("candidate_id", candidateIds)
      .order("captured_at", { ascending: false });
    if (error) throw error;
    priceSnapshots = (data ?? []) as PriceSnapshotRow[];
  }

  // Rows come back newest-first; keep only the first (latest) one seen
  // per candidate. Snapshot lookup is a plain object (not a Map) since
  // it crosses the server/client boundary as a prop to CandidateList.
  const priceByCandidate: Record<string, PriceSnapshotRow | null> = {};
  for (const snap of priceSnapshots) {
    if (!(snap.candidate_id in priceByCandidate)) {
      priceByCandidate[snap.candidate_id] = snap;
    }
  }

  // "Tried" covers non-rejected candidates that have been fitted at
  // least once; rejected candidates aren't part of the denominator.
  const nonRejected = candidateRows.filter((c) => c.status !== "rejected");
  const triedCount = nonRejected.filter((c) => c.fit_rating !== null).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to searches
      </Link>
      <Header
        search={searchRow}
        ownedItem={ownedItem}
        triedCount={triedCount}
        totalCount={nonRejected.length}
        candidateCount={candidateRows.length}
      />
      <div className="mt-4 flex flex-col gap-4">
        <RequiredFeaturesEditor
          searchId={id}
          features={normalizeRequiredFeatures(searchRow.required_features)}
        />
        <PrioritiesEditor searchId={id} priorities={searchRow.priorities ?? []} />
      </div>

      <CandidateList
        searchId={id}
        candidates={candidateRows}
        priceByCandidate={priceByCandidate}
        retailerDomains={retailerDomains}
        reviewDomains={reviewDomains}
      />
    </div>
  );
}

function Header({
  search,
  ownedItem,
  triedCount,
  totalCount,
  candidateCount,
}: {
  search: SearchRow;
  ownedItem: OwnedItemRow | null;
  triedCount: number;
  totalCount: number;
  candidateCount: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {search.title}
        </h1>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${SEARCH_STATUS_STYLES[search.status]}`}
        >
          {search.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Created <LocalTime iso={search.created_at} dateOnly /> · {triedCount} of{" "}
        {totalCount} tried
      </p>
      {ownedItem && <ReplacingLine ownedItem={ownedItem} />}
      <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <DeleteSearchButton
          searchId={search.id}
          title={search.title}
          candidateCount={candidateCount}
        />
      </div>
    </div>
  );
}

function ReplacingLine({ ownedItem }: { ownedItem: OwnedItemRow }) {
  const parts: string[] = [`Replacing ${ownedItem.brand} ${ownedItem.name}`];
  if (ownedItem.purchased_at) {
    const { years, months } = ownedDuration(ownedItem.purchased_at);
    parts.push(`owned ${years}y ${months}m`);
  }
  if (ownedItem.purchase_price !== null) {
    parts.push(
      `bought for ${currencySymbol(ownedItem.currency)}${ownedItem.purchase_price.toFixed(2)}`
    );
  }
  return (
    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{parts.join(" · ")}</p>
  );
}
