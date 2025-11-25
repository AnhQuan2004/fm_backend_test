import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";

const statusEnum = z.enum(["submitted", "rejected", "selected"]);

const querySchema = z.object({
  status: statusEnum.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

type SubmissionRow = {
  id: string;
  bounty_id: string;
  user_id: string;
  username: string | null;
  user_email: string | null;
  submission_link: string;
  notes: string | null;
  rank: number | null;
  status: z.infer<typeof statusEnum>;
  created_at: string;
};

const mapSubmission = (row: SubmissionRow) => ({
  id: row.id,
  bountyId: row.bounty_id,
  userId: row.user_id,
  username: row.username,
  userEmail: row.user_email,
  submissionLink: row.submission_link,
  notes: row.notes,
  status: row.status,
  rank: row.rank,
  proofOfWork: [],
  createdAt: row.created_at,
});

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug?: string }> | { slug?: string } },
) {
  try {
    const resolvedParams = "then" in context.params ? await context.params : context.params;
    const slug =
      resolvedParams.slug?.trim() ??
      req.nextUrl.searchParams.get("username")?.trim() ??
      null;

    if (!slug) {
      return jsonWithCors(req, { ok: false, error: "Missing username slug" }, { status: 400 });
    }

    const parsed = querySchema.safeParse({
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });

    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();
    const limit = parsed.data.limit ?? 50;
    const offset = parsed.data.offset ?? 0;

    let query = supabase
      .from("submissions")
      .select("*")
      .ilike("username", slug)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch submissions by username: ${error.message}`);
    }

    return jsonWithCors(req, {
      ok: true,
      submissions: (data ?? []).map(row => mapSubmission(row as SubmissionRow)),
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(
      req,
      { ok: false, error: "Failed to fetch submissions for username" },
      { status: 500 },
    );
  }
}

