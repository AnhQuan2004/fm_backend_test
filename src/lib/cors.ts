import { NextRequest, NextResponse } from "next/server";

const DEFAULT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "Accept",
  "Origin",
];

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

type CorsOptions = {
  allowMethods?: string[];
  allowHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
};

function resolveOrigin(requestOrigin: string | null) {
  if (!requestOrigin) {
    return null;
  }
  if (allowedOrigins.length === 0) {
    return requestOrigin;
  }
  if (allowedOrigins.includes("*")) {
    return requestOrigin ?? "*";
  }
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
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
