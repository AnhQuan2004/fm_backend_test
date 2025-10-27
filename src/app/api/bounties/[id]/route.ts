import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { verifySession } from "@/lib/jwt";

const categoryEnum = z.enum(["dev", "content", "design", "research"]);
const statusEnum = z.enum(["open", "in_review", "closed"]);

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

const updateSchema = z
  .object({
    title: z.string().trim().min(3, "Title phải có ít nhất 3 ký tự").optional(),
    description: z.string().trim().min(10, "Description quá ngắn").optional(),
    category: categoryEnum.optional(),
    rewardAmount: z.number().positive("Reward amount phải > 0").optional(),
    rewardToken: z.string().trim().min(1, "Reward token không được rỗng").optional(),
    deadline: z.string().datetime().optional(),
    status: statusEnum.optional(),
  })
  .refine(data => Object.values(data).some(value => value !== undefined), {
    message: "Không có trường nào để cập nhật",
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

// export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
//   try {
//     const bounty = await getBountyOr404(params.id);
//     if (!bounty) {
//       return NextResponse.json({ ok: false, error: "Bounty not found" }, { status: 404 });
//     }
//     return NextResponse.json({ ok: true, bounty: mapBounty(bounty) });
//   } catch (error) {
//     console.error(error);
//     return NextResponse.json({ ok: false, error: "Failed to fetch bounty" }, { status: 500 });
//   }
// }

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const session = verifySession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getBountyOr404(params.id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Bounty not found" }, { status: 404 });
    }

    if (existing.created_by !== session.userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
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

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("bounties")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update bounty: ${error.message}`);
    }

    return NextResponse.json({ ok: true, bounty: mapBounty(data as BountyRow) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Failed to update bounty" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");
    if (!sessionCookie) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const session = verifySession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getBountyOr404(params.id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Bounty not found" }, { status: 404 });
    }

    if (existing.created_by !== session.userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("bounties").delete().eq("id", params.id);
    if (error) {
      throw new Error(`Failed to delete bounty: ${error.message}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Failed to delete bounty" }, { status: 500 });
  }
}
