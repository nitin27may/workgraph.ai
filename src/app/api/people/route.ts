import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchPeople } from "@/lib/graph";
import { isUserAuthorized } from "@/lib/db";

// GET /api/people?q=search_query - Search for people in the organization
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is authorized
  const { authorized } = isUserAuthorized(session.user?.email);
  if (!authorized) {
    return NextResponse.json(
      { error: "Forbidden - You are not authorized to use this application" },
      { status: 403 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json({ people: [] });
  }

  try {
    const people = await searchPeople(session.accessToken, query, 10);
    return NextResponse.json({ people });
  } catch (error) {
    console.error("Error searching people:", error);
    return NextResponse.json(
      { error: "Failed to search people" },
      { status: 500 }
    );
  }
}
