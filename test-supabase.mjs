import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const HARDCODED_ENV_PATH = "/Users/vbi2/Documents/sui/back_test/fm_backend_test/.env";

function loadEnvFile() {
  try {
    const content = readFileSync(HARDCODED_ENV_PATH, "utf-8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) return;

      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.warn(`无法读取 .env 文件 ${HARDCODED_ENV_PATH}，请检查路径或权限。`);
  }
}

/**
 * Simple CLI helper to fetch sample rows from Supabase using env credentials.
 *
 * Usage examples:
 *   node scripts/test-supabase.mjs
 *   node scripts/test-supabase.mjs users 3 id,username,email
 */
async function main() {
  loadEnvFile();
  
  const supabaseUrl = "https://ktmhfpjligouqoqxqkgq.supabase.co";  // <- thay URL thật vào đây
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bWhmcGpsaWdvdXFvcXhxa2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0ODM3NjYsImV4cCI6MjA3NzA1OTc2Nn0.TVETf_CWBqBiqOpGQZ2RrV1por_p1GYcHbr-vDNYMbg"; 
  if (!supabaseUrl || !supabaseKey) {
    console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY/ANON_KEY 环境变量。");
    process.exit(1);
  }

  const [tableArg, limitArg, columnsArg] = process.argv.slice(2);
  const table = tableArg ?? "users";
  const limit = Number.isNaN(Number(limitArg)) ? 5 : Number(limitArg);
  const columns = columnsArg ?? "*";

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  console.log(`查询表 "${table}"，列 "${columns}"，limit=${limit}`);

  const { data, error } = await supabase.from(table).select(columns).limit(limit);
  if (error) {
    console.error("查询失败：", error.message);
    process.exit(1);
  }

  console.log("查询结果：");
  console.dir(data, { depth: null });
}

main().catch((err) => {
  console.error("执行脚本时出错：", err);
  process.exit(1);
});

