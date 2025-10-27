import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { handleOptions, jsonWithCors } from "@/lib/cors";
import { getRequestSession, isAuthBypassEnabled } from "@/lib/auth";

const categoryEnum = z.enum(["dev", "content", "design", "research"]);
const statusEnum = z.enum(["open", "in_review", "closed"]);

const listQuerySchema = z.object({
  status: statusEnum.optional(),
  category: categoryEnum.optional(),
  createdBy: z.string().uuid().optional(),
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
  created_at: string;
  updated_at: string;
};

const createSchema = z.object({
  title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự"),
  description: z.string().trim().min(10, "Description quá ngắn"),
  category: categoryEnum,
  rewardAmount: z.number().positive("Reward amount phải > 0"),
  rewardToken: z.string().trim().min(1, "Reward token không được rỗng"),
  deadline: z.string().datetime(),
  status: statusEnum.optional(),
  createdBy: z.string().uuid().optional(),
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
    if (!session && !isAuthBypassEnabled()) {
      return jsonWithCors(req, { ok: false, error: "Unauthorized" }, { status: 401 });
    }

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

    const supabase = getSupabaseClient();
    const deadlineISO = new Date(parsed.data.deadline).toISOString();

    const insertPayload = {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      reward_amount: parsed.data.rewardAmount,
      reward_token: parsed.data.rewardToken,
      deadline: deadlineISO,
      status: parsed.data.status ?? "open",
      created_by: ownerId,
      updated_at: new Date().toISOString(),
    };

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
