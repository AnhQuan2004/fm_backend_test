import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/auth";

const categoryEnum = z.enum(["dev", "content", "design", "research"]);
const statusEnum = z.enum(["open", "in_review", "in-progress", "closed"]);

const listQuerySchema = z.object({
  status: statusEnum.optional(),
  category: categoryEnum.optional(),
  createdBy: z.string().uuid().optional(),
  creatorUsername: z.string().optional(),
  organizerId: z.string().uuid().optional(),
  slug: z.string().optional(),
  type: z.string().optional(),
  complexity: z.string().optional(),
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

const createSchema = z.object({
  title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự"),
  description: z.string().trim().min(10, "Description quá ngắn"),
  category: categoryEnum,
  rewardAmount: z.number().min(0, "Reward amount phải >= 0"),
  rewardToken: z.string().trim().min(1, "Reward token không được rỗng"),
  deadline: z.string().datetime(),
  status: statusEnum.optional(),
  createdBy: z.string().uuid().optional(),
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

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = listQuerySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      createdBy: searchParams.get("createdBy") ?? undefined,
      creatorUsername: searchParams.get("creatorUsername") ?? undefined,
      organizerId: searchParams.get("organizerId") ?? undefined,
      slug: searchParams.get("slug") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      complexity: searchParams.get("complexity") ?? undefined,
    });

    if (!parsed.success) {
      return jsonWithCors(req, { ok: false, error: "Invalid filters" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    let query = supabase.from("bounties").select("*").order("created_at", { ascending: false });

    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }

    if (parsed.data.category) {
      query = query.eq("category", parsed.data.category);
    }

    if (parsed.data.createdBy) {
      query = query.eq("created_by", parsed.data.createdBy);
    }
    
    if (parsed.data.creatorUsername) {
      query = query.eq("creator_username", parsed.data.creatorUsername);
    }

    if (parsed.data.organizerId) {
      query = query.eq("organizer_id", parsed.data.organizerId);
    }

    if (parsed.data.slug) {
      query = query.eq("slug", parsed.data.slug);
    }

    if (parsed.data.type) {
      query = query.eq("type", parsed.data.type);
    }

    if (parsed.data.complexity) {
      query = query.eq("complexity", parsed.data.complexity);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load bounties: ${error.message}`);
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

export async function POST(req: NextRequest) {
  try {
    const session = await getRequestSession();

    const json = await req.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithCors(
        req,
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const ownerId =
      session?.userId ??
      parsed.data.createdBy ??
      process.env.BYPASS_USER_ID ??
      process.env.TEST_USER_ID ??
      null;

    if (!ownerId) {
      return jsonWithCors(
        req,
        { ok: false, error: "Missing creator identity for bounty" },
        { status: 400 },
      );
    }

    // Get the creator's email from the request, session, or fetch it from the database
    let creatorEmail = parsed.data.creatorEmail ?? session?.email ?? process.env.BYPASS_USER_EMAIL ?? process.env.TEST_USER_EMAIL;
    let creatorUsername = parsed.data.creatorUsername ?? null;
    
    // If we don't have the email but have the userId, fetch it from the database
    if (ownerId) {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("email, username")
        .eq("id", ownerId)
        .maybeSingle();
        
      if (userError) {
        console.error("Failed to fetch user data:", userError);
      } else if (userData) {
        if (!creatorEmail) creatorEmail = userData.email;
        if (!creatorUsername) creatorUsername = userData.username;
      }
    }

    if (!creatorEmail) {
      return jsonWithCors(
        req,
        { ok: false, error: "Missing creator email for bounty" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();
    const deadlineISO = new Date(parsed.data.deadline).toISOString();

    const sanitizeOptional = (value?: string | null) => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const insertPayload: Record<string, unknown> = {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      reward_amount: parsed.data.rewardAmount,
      reward_token: parsed.data.rewardToken,
      deadline: deadlineISO,
      status: parsed.data.status ?? "open",
      created_by: ownerId,
      creator_email: creatorEmail,
      creator_username: creatorUsername,
      updated_at: new Date().toISOString(),
    };

    const sanitizedSlug = sanitizeOptional(parsed.data.slug);
    const sanitizedType = sanitizeOptional(parsed.data.type);
    const sanitizedComplexity = sanitizeOptional(parsed.data.complexity);
    const sanitizedSubmissionTemplate = sanitizeOptional(parsed.data.submissionTemplate);

    if (parsed.data.organizerId !== undefined) {
      insertPayload.organizer_id = parsed.data.organizerId;
    }
    if (sanitizedSlug !== null) {
      insertPayload.slug = sanitizedSlug;
    }
    if (parsed.data.xpReward !== undefined) {
      insertPayload.xp_reward = parsed.data.xpReward;
    }
    if (sanitizedType !== null) {
      insertPayload.type = sanitizedType;
    }
    if (sanitizedComplexity !== null) {
      insertPayload.complexity = sanitizedComplexity;
    }
    if (parsed.data.winnersCount !== undefined) {
      insertPayload.winners_count = parsed.data.winnersCount;
    }
    if (sanitizedSubmissionTemplate !== null) {
      insertPayload.submission_template = sanitizedSubmissionTemplate;
    }

    const { data, error } = await supabase
      .from("bounties")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create bounty: ${error.message}`);
    }

    return jsonWithCors(req, { ok: true, bounty: mapBounty(data) }, { status: 201 });
  } catch (error) {
    console.error(error);
    return jsonWithCors(req, { ok: false, error: "Failed to create bounty" }, { status: 500 });
  }
}
