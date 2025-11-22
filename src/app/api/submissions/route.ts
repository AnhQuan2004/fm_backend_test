import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/auth";

const statusEnum = z.enum(["submitted", "rejected", "selected"]);

const listQuerySchema = z.object({
  bountyId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: statusEnum.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  bountyId: z.string().uuid({ message: "bountyId không hợp lệ" }),
  userId: z.string().uuid().optional(),
  username: z.string().trim().min(1).optional(),
  userEmail: z.string().email().optional(),
  submissionLink: z.string().trim().min(3, "submissionLink quá ngắn"),
  notes: z.string().trim().optional(),
  status: statusEnum.optional(),
});

type SubmissionRow = {
  id: string;
  bounty_id: string;
  user_id: string;
  username: string | null;
  user_email: string | null;
  submission_link: string;
  notes: string | null;
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
  proofOfWork: [],
  createdAt: row.created_at,
});

const sanitizeOptional = (value?: string | null) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const parsed = listQuerySchema.safeParse({
      bountyId: req.nextUrl.searchParams.get("bountyId") ?? undefined,
      userId: req.nextUrl.searchParams.get("userId") ?? undefined,
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
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (parsed.data.bountyId) {
      query = query.eq("bounty_id", parsed.data.bountyId);
    }
    if (parsed.data.userId) {
      query = query.eq("user_id", parsed.data.userId);
    }
    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch submissions: ${error.message}`);
    }

    return jsonWithCors(req, {
      ok: true,
      submissions: (data ?? []).map(row => mapSubmission(row as SubmissionRow)),
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to fetch submissions" }, { status: 500 });
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

    const session = await getRequestSession();

    const resolvedUserId =
      parsed.data.userId ??
      session?.userId ??
      process.env.BYPASS_USER_ID ??
      process.env.TEST_USER_ID ??
      null;

    if (!resolvedUserId) {
      return jsonWithCors(
        req,
        { ok: false, error: "Missing userId (session hoặc body)" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();
    const { data: bountyRow, error: bountyError } = await supabase
      .from("bounties")
      .select("id,status,created_by")
      .eq("id", parsed.data.bountyId)
      .maybeSingle();

    if (bountyError) {
      throw new Error(`Failed to fetch bounty: ${bountyError.message}`);
    }
    if (!bountyRow) {
      return jsonWithCors(req, { ok: false, error: "Bounty not found" }, { status: 404 });
    }
    const isUnderReview = bountyRow.status === "in_review";
    const isClosed = bountyRow.status === "closed";
    if (isUnderReview || isClosed) {
      return jsonWithCors(
        req,
        { ok: false, error: "Bounty đang under review/đã đóng, không thể nộp bài" },
        { status: 403 },
      );
    }

    let username = sanitizeOptional(parsed.data.username);
    let userEmail = sanitizeOptional(parsed.data.userEmail);
    if (!username || !userEmail) {
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("username,email")
        .eq("id", resolvedUserId)
        .maybeSingle();

      if (userError) {
        throw new Error(`Failed to fetch user for submission: ${userError.message}`);
      }

      if (!userRow) {
        return jsonWithCors(
          req,
          { ok: false, error: "User not found for submission" },
          { status: 400 },
        );
      }

      username = username ?? sanitizeOptional(userRow.username);
      userEmail = userEmail ?? sanitizeOptional(userRow.email);
    }

    const insertPayload = {
      bounty_id: parsed.data.bountyId,
      user_id: resolvedUserId,
      username,
      user_email: userEmail,
      submission_link: parsed.data.submissionLink.trim(),
      notes: sanitizeOptional(parsed.data.notes),
      status: parsed.data.status ?? "submitted",
    };

    const { data, error } = await supabase
      .from("submissions")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create submission: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, submission: mapSubmission(data as SubmissionRow) }, { status: 201 });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to create submission" }, { status: 500 });
  }
}
