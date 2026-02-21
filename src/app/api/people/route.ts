import { NextRequest, NextResponse } from "next/server";
import { searchPeople } from "@/lib/graph";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (request: NextRequest, session) => {
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
});
