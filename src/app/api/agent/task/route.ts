// src/app/api/agent/task/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'This endpoint is for task operations. Use POST to create a task.' }, { status: 200 });
}

// TODO: Implement POST handler for creating tasks
// export async function POST(request: NextRequest) {
//   // ... logic to create a task ...
//   return NextResponse.json({ message: 'Task created (not really)' }, { status: 201 });
// }
