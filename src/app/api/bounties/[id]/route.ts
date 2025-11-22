import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getRequestSession, isAuthBypassEnabled } from "@/lib/auth";

const categoryEnum = z.enum(["dev", "content", "design", "research"]);
const statusEnum = z.enum(["open", "in_review", "in-progress", "closed"]);

type BountyRow = {
  id: string;
  title: string;
  description: string;
  category: z.infer<typeof categoryEnum>;
  reward_amount: number;
  reward_token: string;
  deadline: string;
  status: z.infer<typeof statusEnum>;
  created_by: string;
  creator_email: string;
  creator_username: string | null;
  created_at: string;
  updated_at: string;
  organizer_id: string | null;
  slug: string | null;
  xp_reward: number | null;
  type: string | null;
  complexity: string | null;
  winners_count: number | null;
  submission_template: string | null;
};

const updateSchema = z
  .object({
    title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự").optional(),
    description: z.string().trim().min(10, "Description quá ngắn").optional(),
    category: categoryEnum.optional(),
    rewardAmount: z.number().positive("Reward amount phải > 0").optional(),
    rewardToken: z.string().trim().min(1, "Reward token không được rỗng").optional(),
    deadline: z.string().datetime().optional(),
    status: statusEnum.optional(),
    creatorEmail: z.string().email("Email không hợp lệ").optional(),
    creatorUsername: z.string().optional(),
    organizerId: z.string().uuid().optional(),
    slug: z.string().trim().min(1, "Slug không được rỗng").optional(),
    xpReward: z.number().int().min(0, "XP reward phải >= 0").optional(),
    type: z.string().trim().min(1, "Type không được rỗng").optional(),
    complexity: z.string().trim().min(1, "Complexity không được rỗng").optional(),
    winnersCount: z.number().int().min(1, "Winners count phải >= 1").optional(),
    submissionTemplate: z.string().trim().min(1, "Submission template không được rỗng").optional(),
  })
  .refine(data => Object.values(data).some(value => value !== undefined), {
    message: "Không có trường nào để cập nhật",
  });

const putSchema = z.object({
  title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự"),
  description: z.string().trim().min(10, "Description quá ngắn"),
  category: categoryEnum,
  rewardAmount: z.number().positive("Reward amount phải > 0"),
  rewardToken: z.string().trim().min(1, "Reward token không được rỗng"),
  deadline: z.string().datetime(),
  status: statusEnum,
  creatorEmail: z.string().email("Email không hợp lệ").optional(),
  creatorUsername: z.string().optional(),
  organizerId: z.string().uuid().optional(),
  slug: z.string().trim().min(1, "Slug không được rỗng").optional(),
  xpReward: z.number().int().min(0, "XP reward phải >= 0").optional(),
  type: z.string().trim().min(1, "Type không được rỗng").optional(),
  complexity: z.string().trim().min(1, "Complexity không được rỗng").optional(),
  winnersCount: z.number().int().min(1, "Winners count phải >= 1").optional(),
  submissionTemplate: z.string().trim().min(1, "Submission template không được rỗng").optional(),
});

function mapBounty(row: BountyRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    rewardAmount: Number(row.reward_amount),
    rewardToken: row.reward_token,
    deadline: row.deadline,
    status: row.status,
    createdBy: row.created_by,
    creatorEmail: row.creator_email,
    creatorUsername: row.creator_username,
    organizerId: row.organizer_id,
    slug: row.slug,
    xpReward: row.xp_reward ?? 0,
    type: row.type,
    complexity: row.complexity,
    winnersCount: row.winners_count ?? 1,
    submissionTemplate: row.submission_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const sanitizeOptional = (value?: string | null) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

async function getBountyOr404(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("bounties").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch bounty: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return data as BountyRow;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bounty = await getBountyOr404(id);
    if (!bounty) {
      return jsonWithCors(req, { ok: false, error: "Bounty not found" }, { status: 404 });
    }
    return jsonWithCors(req, { ok: true, bounty: mapBounty(bounty) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to fetch bounty" }, { status: 500 });
  }
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return handleOptions(req);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession();
    const authBypass = isAuthBypassEnabled();
    if (!session && !authBypass) {
      return jsonWithCors(req, { ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getBountyOr404(id);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Bounty not found" }, { status: 404 });
    }

    if (!authBypass && (!session || existing.created_by !== session.userId)) {
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

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.category !== undefined) updates.category = parsed.data.category;
    if (parsed.data.rewardAmount !== undefined) updates.reward_amount = parsed.data.rewardAmount;
    if (parsed.data.rewardToken !== undefined) updates.reward_token = parsed.data.rewardToken;
    if (parsed.data.deadline !== undefined) updates.deadline = new Date(parsed.data.deadline).toISOString();
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.creatorEmail !== undefined) updates.creator_email = parsed.data.creatorEmail;
    if (parsed.data.creatorUsername !== undefined) updates.creator_username = parsed.data.creatorUsername;
    if (parsed.data.organizerId !== undefined) updates.organizer_id = parsed.data.organizerId;

    if (parsed.data.slug !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.slug);
      updates.slug = sanitized ?? null;
    }

    if (parsed.data.xpReward !== undefined) updates.xp_reward = parsed.data.xpReward;

    if (parsed.data.type !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.type);
      updates.type = sanitized ?? null;
    }

    if (parsed.data.complexity !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.complexity);
      updates.complexity = sanitized ?? null;
    }

    if (parsed.data.winnersCount !== undefined) updates.winners_count = parsed.data.winnersCount;

    if (parsed.data.submissionTemplate !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.submissionTemplate);
      updates.submission_template = sanitized ?? null;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("bounties")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update bounty: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, bounty: mapBounty(data as BountyRow) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to update bounty" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequestSession();
    const authBypass = isAuthBypassEnabled();
    if (!session && !authBypass) {
      return jsonWithCors(req, { ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getBountyOr404(id);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Bounty not found" }, { status: 404 });
    }

    if (!authBypass && (!session || existing.created_by !== session.userId)) {
      return jsonWithCors(req, { ok: false, error: "Forbidden" }, { status: 403 });
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

    const updates: Record<string, unknown> = {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      reward_amount: parsed.data.rewardAmount,
      reward_token: parsed.data.rewardToken,
      deadline: new Date(parsed.data.deadline).toISOString(),
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    };
    
    if (parsed.data.creatorEmail) {
      updates.creator_email = parsed.data.creatorEmail;
    }
    
    if (parsed.data.creatorUsername !== undefined) {
      updates.creator_username = parsed.data.creatorUsername;
    }

    if (parsed.data.organizerId !== undefined) {
      updates.organizer_id = parsed.data.organizerId;
    }

    if (parsed.data.slug !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.slug);
      updates.slug = sanitized ?? null;
    }

    if (parsed.data.xpReward !== undefined) {
      updates.xp_reward = parsed.data.xpReward;
    }

    if (parsed.data.type !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.type);
      updates.type = sanitized ?? null;
    }

    if (parsed.data.complexity !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.complexity);
      updates.complexity = sanitized ?? null;
    }

    if (parsed.data.winnersCount !== undefined) {
      updates.winners_count = parsed.data.winnersCount;
    }

    if (parsed.data.submissionTemplate !== undefined) {
      const sanitized = sanitizeOptional(parsed.data.submissionTemplate);
      updates.submission_template = sanitized ?? null;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("bounties")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update bounty: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, bounty: mapBounty(data as BountyRow) });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to update bounty" }, { status: 500 });
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
    const existing = await getBountyOr404(id);
    if (!existing) {
      return jsonWithCors(req, { ok: false, error: "Bounty not found" }, { status: 404 });
    }

    if (!authBypass && (!session || existing.created_by !== session.userId)) {
      return jsonWithCors(req, { ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("bounties").delete().eq("id", id);
    if (error) {
      throw new Error(`Failed to delete bounty: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to delete bounty" }, { status: 500 });
  }
}
