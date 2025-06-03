// src/app/api/agent/status/route.ts
import { NextResponse } from 'next/server';
import { getMissionsByStatus } from '@/lib/database/services';
import { Mission } from '@prisma/client'; // Assuming Mission type is needed for type safety

// Define the expected status string for in-progress missions.
// This should match the status string used in the database.
const IN_PROGRESS_STATUS = 'in_progress'; // Common convention

export async function GET(request: Request) {
  try {
    const inProgressMissions: Mission[] = await getMissionsByStatus(IN_PROGRESS_STATUS);

    const activeMissionIds = inProgressMissions.map(mission => mission.id);
    const activeMissionsCount = inProgressMissions.length;
    const isActive = activeMissionsCount > 0;

    const responseBody = {
      isActive,
      activeMissionIds,
      activeMissionsCount,
      // Optionally, you could include a timestamp or other metadata
      // checkedAt: new Date().toISOString(),
    };

    return NextResponse.json(responseBody);

  } catch (error) {
    console.error('[API AGENT STATUS] Failed to fetch agent status:', error);

    // Avoid sending detailed internal error messages to the client.
    let errorMessage = 'An error occurred while fetching agent status.';
    // In a real application, you might have more sophisticated error handling
    // or logging that captures more details from the error object safely.

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Note: The `request: Request` parameter is part of the Next.js API route signature for GET handlers,
// even if not explicitly used to read data from the request itself in this particular simple GET route.
// For more complex scenarios (e.g., reading query parameters), you might use `NextRequest` from `next/server`.
// For this route, `Request` is sufficient.
// No OPTIONS handler is explicitly added here; Next.js handles basic CORS, but more complex needs might require it.
