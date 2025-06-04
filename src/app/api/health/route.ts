// src/app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const timestamp = new Date().toISOString();
    const responseBody = {
      status: "ok",
      timestamp: timestamp,
    };
    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    // In case generating timestamp or structuring response fails, though unlikely for this simple case.
    console.error('[API HEALTH] Error creating health check response:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to generate health check response",
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
