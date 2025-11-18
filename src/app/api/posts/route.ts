import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";

const statusEnum = z.enum(["draft", "published"]);
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const listQuerySchema = z.object({
  status: statusEnum.optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const slugSchema = z
  .string()
  .trim()
  .min(3, "Slug phải có ít nhất 3 ký tự")
  .regex(slugRegex, "Slug chỉ được chứa chữ thường, số và dấu gạch ngang");

const optionalSlugSchema = z.union([slugSchema, z.null()]).optional();

const createSchema = z.object({
  title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự"),
  slug: optionalSlugSchema,
  contentMd: z.string().trim().min(1, "Content markdown không được rỗng"),
  status: statusEnum.optional(),
  publishedAt: z.string().datetime().optional(),
});

type PostRow = {
  id: string;
  title: string;
  slug: string | null;
  content_md: string;
  status: z.infer<typeof statusEnum>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapPost(row: PostRow) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    contentMd: row.content_md,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolvePublishedAt(
  status: z.infer<typeof statusEnum>,
  provided?: string,
) {
  if (status === "draft") {
    return null;
  }

  if (provided) {
    return new Date(provided).toISOString();
  }

  return new Date().toISOString();
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filters = {
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search")?.trim() || undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    };

    const parsed = listQuerySchema.safeParse(filters);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();
    let query = supabase.from("posts").select("*");

    const statusFilter = parsed.data.status ?? "published";
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    if (parsed.data.search) {
      const searchValue = parsed.data.search.replace(/[%_]/g, "\\$&");
      query = query.or(
        `title.ilike.%${searchValue}%,slug.ilike.%${searchValue}%`,
      );
    }

    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;
    query = query
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load posts: ${error.message}`);
    }

    return jsonWithCors(req, {
      ok: true,
      posts: (data ?? []).map(row => mapPost(row as PostRow)),
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to fetch posts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();
    const status = parsed.data.status ?? "draft";
    const slugValue =
      parsed.data.slug === null || parsed.data.slug === undefined ? null : parsed.data.slug;
    const insertPayload = {
      title: parsed.data.title.trim(),
      slug: slugValue,
      content_md: parsed.data.contentMd.trim(),
      status,
      published_at: resolvePublishedAt(status, parsed.data.publishedAt),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("posts").insert(insertPayload).select("*").single();
    if (error) {
      if (error.code === "23505") {
        return jsonWithCors(
          req,
          { ok: false, error: "Slug đã tồn tại, hãy chọn slug khác" },
          { status: 409 },
        );
      }
      throw new Error(`Failed to create post: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, post: mapPost(data as PostRow) }, { status: 201 });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to create post" }, { status: 500 });
  }
}
