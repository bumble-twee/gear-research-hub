"use server";

// Server Action for the searches index page.

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function stringListField(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export async function createSearch(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();

  if (!title) throw new Error("Title is required.");

  const { data, error } = await supabase
    .from("searches")
    .insert({
      title,
      reference_item: optionalText(formData, "reference_item"),
      size: optionalText(formData, "size"),
      gender: optionalText(formData, "gender"),
      // Always set explicitly (never left to the column default) so
      // every new row is array-shaped from the start — see
      // normalizeRequiredFeatures in searches/[id]/format.ts for why
      // that matters.
      required_features: stringListField(formData, "required_features"),
      priorities: stringListField(formData, "priorities"),
    })
    .select("id")
    .single();
  if (error) throw error;

  redirect(`/searches/${data.id}`);
}

// Shared by the search detail header and the homepage list — deleting
// cascades to candidates and, from there, to their price/review
// snapshots at the database level (all ON DELETE CASCADE).
// redirect("/") both takes you off a now-gone detail page and, when
// called from the homepage itself, freshly re-renders that same list
// without the deleted row.
export async function deleteSearch(searchId: string) {
  const { error } = await supabase.from("searches").delete().eq("id", searchId);
  if (error) throw error;
  redirect("/");
}
