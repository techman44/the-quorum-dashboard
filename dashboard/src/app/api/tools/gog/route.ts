import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/tools/gog - Tool endpoint for agents to call GOG services
 *
 * This is a MCP-style tool endpoint that agents can invoke to use Google Workspace services.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, params } = body;

    // Forward to the GOG API
    const gogResponse = await fetch('http://localhost:3000/api/gog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: operation, ...params }),
    });

    const data = await gogResponse.json();

    if (!gogResponse.ok) {
      return NextResponse.json({
        success: false,
        error: data.error || 'GOG operation failed',
      }, { status: gogResponse.status });
    }

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('GOG tool error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/tools/gog - List available GOG tools
 */
export async function GET() {
  const tools = [
    {
      name: 'gmail_search',
      description: 'Search Gmail messages',
      parameters: {
        query: { type: 'string', description: 'Search query (e.g., "newer_than:7d", "from:example.com")', required: true },
        account: { type: 'string', description: 'Google account email', required: false },
        max: { type: 'number', description: 'Maximum results', default: 10 },
      },
    },
    {
      name: 'gmail_send',
      description: 'Send an email via Gmail',
      parameters: {
        to: { type: 'string', description: 'Recipient email', required: true },
        subject: { type: 'string', description: 'Email subject', required: true },
        body: { type: 'string', description: 'Email body (plain text)', required: false },
        bodyHtml: { type: 'string', description: 'Email body (HTML)', required: false },
        account: { type: 'string', description: 'Google account email', required: false },
      },
    },
    {
      name: 'calendar_events_list',
      description: 'List calendar events',
      parameters: {
        calendarId: { type: 'string', description: 'Calendar ID (default: primary)', default: 'primary' },
        from: { type: 'string', description: 'Start date (ISO format)', required: false },
        to: { type: 'string', description: 'End date (ISO format)', required: false },
        account: { type: 'string', description: 'Google account email', required: false },
        max: { type: 'number', description: 'Maximum results', default: 20 },
      },
    },
    {
      name: 'calendar_create',
      description: 'Create a calendar event',
      parameters: {
        calendarId: { type: 'string', description: 'Calendar ID (default: primary)', default: 'primary' },
        summary: { type: 'string', description: 'Event title', required: true },
        from: { type: 'string', description: 'Start time (ISO format)', required: true },
        to: { type: 'string', description: 'End time (ISO format)', required: true },
        eventColor: { type: 'number', description: 'Event color ID (1-11)', required: false },
      },
    },
    {
      name: 'drive_search',
      description: 'Search Google Drive files',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        account: { type: 'string', description: 'Google account email', required: false },
        max: { type: 'number', description: 'Maximum results', default: 10 },
      },
    },
    {
      name: 'contacts_list',
      description: 'List Google contacts',
      parameters: {
        account: { type: 'string', description: 'Google account email', required: false },
        max: { type: 'number', description: 'Maximum results', default: 20 },
      },
    },
    {
      name: 'sheets_get',
      description: 'Get sheet data',
      parameters: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID', required: true },
        range: { type: 'string', description: 'Cell range (e.g., "Sheet1!A1:D10")', required: true },
        account: { type: 'string', description: 'Google account email', required: false },
      },
    },
    {
      name: 'docs_cat',
      description: 'Get Google Doc content',
      parameters: {
        docId: { type: 'string', description: 'Document ID', required: true },
        account: { type: 'string', description: 'Google account email', required: false },
      },
    },
  ];

  return NextResponse.json({
    name: 'gog',
    description: 'Google Workspace integration via gogcli',
    version: '1.0.0',
    tools,
  });
}
