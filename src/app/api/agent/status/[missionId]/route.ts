// src/app/api/agent/status/[missionId]/route.ts
import { NextResponse } from 'next/server';
import { getMissionById } from '@/lib/database/services';
import { Mission } from '@prisma/client';

export async function GET(
  request: Request,
  { params }: { params: { missionId: string } }
) {
  const missionId = params.missionId;

  if (!missionId) {
    return NextResponse.json({ error: 'Mission ID is required' }, { status: 400 });
  }

  try {
    const mission = await getMissionById(missionId);

    if (!mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    return NextResponse.json(mission);
  } catch (error) {
    console.error(`Error fetching mission status for ID ${missionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch mission status', details: errorMessage }, { status: 500 });
  }
}
