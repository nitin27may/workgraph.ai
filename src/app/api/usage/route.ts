import { NextRequest, NextResponse } from "next/server";
import {
  getAllUsageRecords,
  getUsageStats,
  exportUsageToCsv,
  importUsageFromCsv,
  deleteUsageRecord,
  clearAllUsage,
  getAllPrepUsageRecords,
  getPrepUsageStats,
  exportPrepUsageToCsv,
  deletePrepUsageRecord,
  clearAllPrepUsage,
  PRICING,
} from "@/lib/db";
import { withAdminAuth } from "@/lib/api-auth";

export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const type = searchParams.get("type");
  const tab = searchParams.get("tab");

  try {
    // Prep usage tab
    if (tab === "prep") {
      if (format === "csv") {
        const csv = exportPrepUsageToCsv();
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="prep-usage-export-${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      if (type === "stats") {
        const stats = getPrepUsageStats();
        return NextResponse.json({ ...stats, pricing: PRICING });
      }

      const records = getAllPrepUsageRecords();
      const stats = getPrepUsageStats();
      return NextResponse.json({ records, stats, pricing: PRICING });
    }

    // Default: summarization usage
    if (format === "csv") {
      const csv = exportUsageToCsv();
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="usage-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (type === "stats") {
      const stats = getUsageStats();
      return NextResponse.json({
        ...stats,
        pricing: PRICING,
      });
    }

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
});

export const POST = withAdminAuth(async (request: NextRequest) => {
  try {
    const contentType = request.headers.get("content-type");

    if (contentType?.includes("text/csv") || contentType?.includes("multipart/form-data")) {
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
});

export const DELETE = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const clearAll = searchParams.get("clearAll");
  const tab = searchParams.get("tab");

  try {
    // Prep usage tab
    if (tab === "prep") {
      if (clearAll === "true") {
        const deleted = clearAllPrepUsage();
        return NextResponse.json({ message: `Cleared ${deleted} prep usage records`, deleted });
      }
      if (id) {
        const success = deletePrepUsageRecord(parseInt(id));
        if (success) {
          return NextResponse.json({ message: "Record deleted" });
        }
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "No id or clearAll parameter provided" }, { status: 400 });
    }

    // Default: summarization usage
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
});
