import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";

const categoryEnum = z.enum(["dev", "content", "design", "research"]);
const statusEnum = z.enum(["open", "in_review", "in-progress", "closed"]);

const filterSchema = z.object({
  createdBy: z.string().uuid({ message: "createdBy không hợp lệ" }),
  status: statusEnum.optional(),
  category: categoryEnum.optional(),
});

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
  creator_email: string | null;
  creator_username: string | null;
  organizer_id: string | null;
  slug: string | null;
  xp_reward: number | null;
  type: string | null;
  complexity: string | null;
  winners_count: number | null;
  submission_template: string | null;
  created_at: string;
  updated_at: string;
};

const mapBounty = (row: BountyRow) => ({
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
});

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const parseFilters = filterSchema.safeParse({
      createdBy: req.nextUrl.searchParams.get("createdBy") ?? undefined,
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      category: req.nextUrl.searchParams.get("category") ?? undefined,
    });

    if (!parseFilters.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parseFilters.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const ownerId = parseFilters.data.createdBy;

    const supabase = getSupabaseClient();
    let query = supabase.from("bounties").select("*").eq("created_by", ownerId).order("created_at", { ascending: false });

    if (parseFilters.data.status) {
      query = query.eq("status", parseFilters.data.status);
    }
    if (parseFilters.data.category) {
      query = query.eq("category", parseFilters.data.category);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch my bounties: ${error.message}`);
    }

    return jsonWithCors(req, {
      ok: true,
      bounties: (data ?? []).map(row => mapBounty(row as BountyRow)),
    });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to fetch bounties" }, { status: 500 });
  }
}
