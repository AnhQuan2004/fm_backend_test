import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";

const statusEnum = z.enum(["draft", "published"]);
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PostRow = {
  id: string;
  title: string;
  slug: string | null;
  content_md: string;
  thumnail_image: string | null;
  status: z.infer<typeof statusEnum>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const slugSchema = z
  .string()
  .trim()
  .min(3, "Slug phải có ít nhất 3 ký tự")
  .regex(slugRegex, "Slug chỉ được chứa chữ thường, số và dấu gạch ngang");
const optionalSlugSchema = z.union([slugSchema, z.null()]).optional();

const updateSchema = z
  .object({
    title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự").optional(),
    slug: optionalSlugSchema,
    contentMd: z.string().trim().min(1, "Content markdown không được rỗng").optional(),
    thumnailImage: z.union([z.string().trim().min(1), z.null()]).optional(),
    status: statusEnum.optional(),
    publishedAt: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .refine(data => Object.values(data).some(value => value !== undefined), {
    message: "Không có trường nào để cập nhật",
  });

const putSchema = z.object({
  title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự"),
  slug: z.union([slugSchema, z.null()]),
  contentMd: z.string().trim().min(1, "Content markdown không được rỗng"),
  thumnailImage: z.union([z.string().trim().min(1), z.null()]).optional(),
  status: statusEnum,
  publishedAt: z.union([z.string().datetime(), z.null()]).optional(),
});

function mapPost(row: PostRow) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    contentMd: row.content_md,
    thumnailImage: row.thumnail_image,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolvePublishedAtUpdate(
  payload: {
    status?: z.infer<typeof statusEnum>;
    publishedAt?: string | null;
  },
  existing: PostRow,
) {
  if (payload.publishedAt !== undefined) {
    if (payload.publishedAt === null) {
      return null;
    }
    return new Date(payload.publishedAt).toISOString();
  }

  if (payload.status === "draft") {
    return null;
  }

  if (payload.status === "published") {
    return existing.published_at ?? new Date().toISOString();
  }

  return undefined;
}

async function getPostByIdentifier(identifier: string) {
  const supabase = getSupabaseClient();
  const column = uuidRegex.test(identifier) ? "id" : "slug";
  const { data, error } = await supabase.from("posts").select("*").eq(column, identifier).maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch post: ${error.message}`);
  }
  return (data ?? null) as PostRow | null;
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  await params;
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;
    const post = await getPostByIdentifier(identifier);
    if (!post) {
      return jsonWithCors(req, { ok: false, error: "Post not found" }, { status: 404 });
    }
    return jsonWithCors(req, { ok: true, post: mapPost(post) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to fetch post" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;
    const existing = await getPostByIdentifier(identifier);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Post not found" }, { status: 404 });
    }

    const json = await req.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
    if (parsed.data.slug !== undefined) updates.slug = parsed.data.slug;
    if (parsed.data.contentMd !== undefined) updates.content_md = parsed.data.contentMd.trim();
    if (parsed.data.thumnailImage !== undefined) updates.thumnail_image = parsed.data.thumnailImage;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    const publishedAtUpdate = resolvePublishedAtUpdate(parsed.data, existing);
    if (publishedAtUpdate !== undefined) {
      updates.published_at = publishedAtUpdate;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("posts")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return jsonWithCors(
          req,
          { ok: false, error: "Slug đã tồn tại, hãy chọn slug khác" },
          { status: 409 },
        );
      }
      throw new Error(`Failed to update post: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, post: mapPost(data as PostRow) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to update post" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;
    const existing = await getPostByIdentifier(identifier);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Post not found" }, { status: 404 });
    }

    const json = await req.json();
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();
    const resolvedPublishedAt = resolvePublishedAtUpdate(parsed.data, existing);
    const resolvedThumnail =
      parsed.data.thumnailImage === undefined ? existing.thumnail_image : parsed.data.thumnailImage;
    const updates = {
      title: parsed.data.title.trim(),
      slug: parsed.data.slug,
      content_md: parsed.data.contentMd.trim(),
      thumnail_image: resolvedThumnail,
      status: parsed.data.status,
      published_at: resolvedPublishedAt === undefined ? existing.published_at : resolvedPublishedAt,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("posts")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return jsonWithCors(
          req,
          { ok: false, error: "Slug đã tồn tại, hãy chọn slug khác" },
          { status: 409 },
        );
      }
      throw new Error(`Failed to replace post: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, post: mapPost(data as PostRow) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to update post" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;
    const existing = await getPostByIdentifier(identifier);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Post not found" }, { status: 404 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("posts").delete().eq("id", existing.id);
    if (error) {
      throw new Error(`Failed to delete post: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to delete post" }, { status: 500 });
  }
}
