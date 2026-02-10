import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { clearAllCachedData, isAdmin } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can clear cache
  const adminCheck = isAdmin(session.user?.email || '');
  if (!adminCheck) {
    return NextResponse.json(
      { error: "Forbidden - Only administrators can clear cache" },
      { status: 403 }
    );
  }

  try {
    const result = clearAllCachedData();
    
    console.log('🗑️ Cache cleared:', result);
    
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
}
