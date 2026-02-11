import { NextRequest, NextResponse } from 'next/server';
import { appendFileSync } from 'fs';
import { join } from 'path';

const LOG_PATH = join(process.cwd(), '..', '.cursor', 'debug.log');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const line = JSON.stringify({ ...body, timestamp: body.timestamp || Date.now() }) + '\n';
    appendFileSync(LOG_PATH, line, 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[debug-log] Write failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
