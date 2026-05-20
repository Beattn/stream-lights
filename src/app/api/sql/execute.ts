import { pool } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Only allow in development or with proper authentication
const isDev = process.env.NODE_ENV === "development";
const SQL_EDITOR_KEY = process.env.SQL_EDITOR_KEY;

interface ExecuteRequest {
  query: string;
}

interface ExecuteResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  rowCount?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse<ExecuteResponse>> {
  try {
    // Authentication check
    if (!isDev && !SQL_EDITOR_KEY) {
      return NextResponse.json(
        { success: false, error: "SQL editor not enabled" },
        { status: 403 }
      );
    }

    // Check authorization header in production
    if (!isDev) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${SQL_EDITOR_KEY}`) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const { query } = (await req.json()) as ExecuteRequest;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid query" },
        { status: 400 }
      );
    }

    // Security: prevent dangerous operations in production
    if (!isDev) {
      const dangerousPatterns = [
        /DROP\s+TABLE/i,
        /DELETE\s+FROM/i,
        /TRUNCATE/i,
      ];
      if (dangerousPatterns.some((p) => p.test(query))) {
        return NextResponse.json(
          { success: false, error: "This operation is not allowed" },
          { status: 403 }
        );
      }
    }

    const result = await pool.query(query);

    return NextResponse.json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("[SQL Executor] Error:", error);
    return NextResponse.json(
      { success: false, error },
      { status: 500 }
    );
  }
}
