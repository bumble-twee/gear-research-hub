"use server";

// Server Action for the searches index page. Only creates a bare
// search row — required_features/priorities stay at their schema
// defaults ('{}' / '[]') until the search detail page's own editing
// flow (not built yet) sets them.

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

export async function createSearch(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!title) throw new Error("Title is required.");
  if (!category) throw new Error("Category is required.");

  const { data, error } = await supabase
    .from("searches")
    .insert({
      title,
      category,
      reference_item: optionalText(formData, "reference_item"),
      size: optionalText(formData, "size"),
      gender: optionalText(formData, "gender"),
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
