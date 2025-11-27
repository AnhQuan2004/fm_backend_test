import { NextRequest, NextResponse } from "next/server";

const DEFAULT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "Accept",
  "Origin",
];

// Read allowed origins from environment variables
// Format: CORS_ALLOWED_ORIGINS=http://localhost:8080,https://your-fe-domain.com
// Separate multiple origins with commas
const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  
  if (!envOrigins) {
    // If no env is set, allow localhost in development, deny all in production
    if (process.env.NODE_ENV === "production") {
      console.warn("⚠️  CORS_ALLOWED_ORIGINS not set in production! All requests will be blocked.");
      return [];
    }
    // Development: allow localhost
    return ["*"];
  }

  // Parse comma-separated origins from env
  const origins = envOrigins
        .split(",")
        .map(origin => origin.trim())
    .filter(Boolean);

  return origins;
};

const allowedOrigins = getAllowedOrigins();
const isDevelopment = process.env.NODE_ENV !== "production";

type CorsOptions = {
  allowMethods?: string[];
  allowHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
};

function resolveOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) {
    return null;
  }
  
  // Always allow localhost in development (for local testing)
  if (isDevelopment && (
    requestOrigin.startsWith("http://localhost:") ||
    requestOrigin.startsWith("http://127.0.0.1:") ||
    requestOrigin.startsWith("https://localhost:")
  )) {
    return requestOrigin;
  }

  // If wildcard is allowed (development mode), accept any origin
  if (allowedOrigins.includes("*")) {
    return requestOrigin;
  }

  // Check if origin is in allowed list
  if (allowedOrigins.length === 0) {
    // No origins configured - deny all (except localhost in dev which is handled above)
    console.warn(`🚫 CORS blocked: ${requestOrigin} - not in allowed origins`);
    return null;
  }

  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  // Origin not allowed
  console.warn(`🚫 CORS blocked: ${requestOrigin} - not in allowed origins: ${allowedOrigins.join(", ")}`);
  return null;
}

export function withCors(
  request: NextRequest,
  response: NextResponse,
  options?: CorsOptions,
) {
  const origin = resolveOrigin(request.headers.get("origin"));
  const allowMethods = options?.allowMethods ?? DEFAULT_METHODS;
  const allowHeaders = options?.allowHeaders ?? DEFAULT_HEADERS;
  const credentials = options?.credentials ?? true;
  const requestedHeaders = request.headers.get("access-control-request-headers");

  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.append("Vary", "Origin");
  }

  response.headers.set("Access-Control-Allow-Methods", allowMethods.join(","));
  response.headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders ?? allowHeaders.join(","),
  );

  if (credentials && origin !== "*") {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  if (options?.maxAge) {
    response.headers.set("Access-Control-Max-Age", options.maxAge.toString());
  }

  return response;
}

export function handleOptions(request: NextRequest, options?: CorsOptions) {
  const response = new NextResponse(null, { status: 204 });
  return withCors(request, response, options);
}

export function jsonWithCors(request: NextRequest, body: unknown, init?: ResponseInit) {
  return withCors(request, NextResponse.json(body, init));
}
