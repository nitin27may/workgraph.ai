import { NextRequest, NextResponse } from "next/server";
import { clearAllCachedData } from "@/lib/db";
import { withAdminAuth } from "@/lib/api-auth";

export const POST = withAdminAuth(async (_request: NextRequest) => {
  try {
    const result = clearAllCachedData();

    console.log('Cache cleared:', result);

    return NextResponse.json({
      success: true,
      message: "Cache cleared successfully",
      ...result
    });
  } catch (error) {
    console.error("Error clearing cache:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear cache" },
      { status: 500 }
    );
  }
});
