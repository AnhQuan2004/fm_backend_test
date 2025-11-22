import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getRequestSession, isAuthBypassEnabled } from "@/lib/auth";

const statusEnum = z.enum(["submitted", "rejected", "selected"]);

type SubmissionRow = {
  id: string;
  bounty_id: string;
  user_id: string;
  username: string | null;
  user_email: string | null;
  submission_link: string;
  notes: string | null;
  status: z.infer<typeof statusEnum>;
  rank: number | null;
  created_at: string;
};

const updateSchema = z
  .object({
    submissionLink: z.string().trim().min(3, "submissionLink quá ngắn").optional(),
    notes: z.string().trim().optional(),
    status: statusEnum.optional(),
    rank: z.union([z.number().int().min(1, "rank phải >= 1"), z.null()]).optional(),
  })
  .refine(data => Object.values(data).some(value => value !== undefined), {
    message: "Không có trường nào để cập nhật",
  });

const sanitizeOptional = (value?: string | null) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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
  createdAt: row.created_at,
});

async function getSubmissionOr404(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("submissions").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch submission: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return data as SubmissionRow;
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return handleOptions(req);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const submission = await getSubmissionOr404(id);
    if (!submission) {
      return jsonWithCors(req, { ok: false, error: "Submission not found" }, { status: 404 });
    }

    return jsonWithCors(req, { ok: true, submission: mapSubmission(submission) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to fetch submission" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession();
    const authBypass = isAuthBypassEnabled();
    if (!session && !authBypass) {
      return jsonWithCors(req, { ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getSubmissionOr404(id);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Submission not found" }, { status: 404 });
    }

    if (!authBypass && (!session || existing.user_id !== session.userId)) {
      return jsonWithCors(req, { ok: false, error: "Forbidden" }, { status: 403 });
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

    const updates: Record<string, unknown> = {};
    if (parsed.data.submissionLink !== undefined) {
      updates.submission_link = parsed.data.submissionLink.trim();
    }
    if (parsed.data.notes !== undefined) {
      updates.notes = sanitizeOptional(parsed.data.notes);
    }
    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
    }
    if (parsed.data.rank !== undefined) {
      updates.rank = parsed.data.rank;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("submissions")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update submission: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, submission: mapSubmission(data as SubmissionRow) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to update submission" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession();
    const authBypass = isAuthBypassEnabled();
    if (!session && !authBypass) {
      return jsonWithCors(req, { ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getSubmissionOr404(id);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Submission not found" }, { status: 404 });
    }

    if (!authBypass && (!session || existing.user_id !== session.userId)) {
      return jsonWithCors(req, { ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("submissions").delete().eq("id", id);
    if (error) {
      throw new Error(`Failed to delete submission: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to delete submission" }, { status: 500 });
  }
}
