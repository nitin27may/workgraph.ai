import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { 
  getAllUsageRecords, 
  getUsageStats, 
  exportUsageToCsv, 
  importUsageFromCsv,
  deleteUsageRecord,
  clearAllUsage,
  PRICING,
  isAdmin,
} from "@/lib/db";

// GET /api/usage - Get all usage records or stats (admin only)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin can access usage data
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const type = searchParams.get("type");

  try {
    // Export as CSV
    if (format === "csv") {
      const csv = exportUsageToCsv();
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="usage-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Get stats only
    if (type === "stats") {
      const stats = getUsageStats();
      return NextResponse.json({
        ...stats,
        pricing: PRICING,
      });
    }

    // Get all records with stats
    const records = getAllUsageRecords();
    const stats = getUsageStats();
    
    return NextResponse.json({
      records,
      stats,
      pricing: PRICING,
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage data" },
      { status: 500 }
    );
  }
}

// POST /api/usage - Import CSV (admin only)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin can import usage data
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const contentType = request.headers.get("content-type");
    
    if (contentType?.includes("text/csv") || contentType?.includes("multipart/form-data")) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get("file") as File;
      
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      
      const csvContent = await file.text();
      const result = importUsageFromCsv(csvContent);
      
      return NextResponse.json({
        message: `Successfully imported ${result.imported} records`,
        imported: result.imported,
        errors: result.errors,
      });
    }
    
    // Handle raw CSV content
    const body = await request.text();
    const result = importUsageFromCsv(body);
    
    return NextResponse.json({
      message: `Successfully imported ${result.imported} records`,
      imported: result.imported,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error importing usage:", error);
    return NextResponse.json(
      { error: "Failed to import usage data" },
      { status: 500 }
    );
  }
}

// DELETE /api/usage - Delete a record or clear all (admin only)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admin can delete usage data
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const clearAll = searchParams.get("clearAll");

  try {
    if (clearAll === "true") {
      const deleted = clearAllUsage();
      return NextResponse.json({
        message: `Cleared ${deleted} usage records`,
        deleted,
      });
    }

    if (id) {
      const success = deleteUsageRecord(parseInt(id));
      if (success) {
        return NextResponse.json({ message: "Record deleted" });
      }
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "No id or clearAll parameter provided" }, { status: 400 });
  } catch (error) {
    console.error("Error deleting usage:", error);
    return NextResponse.json(
      { error: "Failed to delete usage data" },
      { status: 500 }
    );
  }
}
