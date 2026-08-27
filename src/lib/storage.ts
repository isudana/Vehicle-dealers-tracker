import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  ownerId: string,
  file: File,
): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  return path;
}

export async function deleteFile(supabase: SupabaseClient, bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export function getPublicUrl(supabase: SupabaseClient, bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn: number = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
