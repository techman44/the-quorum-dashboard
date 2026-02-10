import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

interface GogAccount {
  email: string;
  services: string[];
}

interface GogConfig {
  credentialsPath: string;
  configDir: string;
  accounts: string[];
  defaultAccount: string;
  enabledServices: string[];
}

// Get the GOG config directory
function getGogConfigDir(configDir?: string): string {
  if (configDir) {
    return configDir.replace('~', os.homedir());
  }
  return path.join(os.homedir(), '.config', 'gog');
}

/**
 * GET /api/gog - Check GOG status and list accounts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Check if gog is installed
    try {
      await execAsync('which gog');
    } catch {
      return NextResponse.json({
        installed: false,
        error: 'gog CLI is not installed. Install with: brew install steipete/tap/gogcli',
      });
    }

    if (action === 'accounts') {
      // List configured accounts
      const configDir = getGogConfigDir(searchParams.get('configDir') || undefined);

      try {
        // Check if accounts file exists
        const accountsPath = path.join(configDir, 'accounts.json');
        const accountsData = await fs.readFile(accountsPath, 'utf-8');
        const accounts = JSON.parse(accountsData);

        return NextResponse.json({
          installed: true,
          accounts: accounts.accounts || [],
          configDir,
        });
      } catch {
        // Try using gog auth list command
        const { stdout } = await execAsync('gog auth list --json 2>/dev/null || echo "[]"');
        try {
          const accounts = JSON.parse(stdout);
          return NextResponse.json({
            installed: true,
            accounts,
          });
        } catch {
          return NextResponse.json({
            installed: true,
            accounts: [],
            message: 'No accounts configured',
          });
        }
      }
    }

    if (action === 'test') {
      // Test gog connection
      const account = searchParams.get('account');
      const service = searchParams.get('service') || 'gmail';

      if (!account) {
        return NextResponse.json({
          installed: true,
          error: 'Account parameter required',
        }, { status: 400 });
      }

      try {
        const cmd = `gog ${service} search 'subject:test' --max 1 --account ${account} --json --no-input 2>&1`;
        const { stdout, stderr } = await execAsync(cmd);

        if (stderr.includes('ERROR') || stderr.includes('not authenticated')) {
          return NextResponse.json({
            installed: true,
            connected: false,
            error: stderr,
          });
        }

        return NextResponse.json({
          installed: true,
          connected: true,
          service,
          account,
        });
      } catch (error) {
        return NextResponse.json({
          installed: true,
          connected: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        });
      }
    }

    // Default: return installation status
    const { stdout } = await execAsync('gog --version 2>/dev/null || echo "unknown"');
    return NextResponse.json({
      installed: true,
      version: stdout.trim(),
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check GOG status',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST /api/gog - Execute GOG commands
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    // Check if gog is installed
    try {
      await execAsync('which gog');
    } catch {
      return NextResponse.json({
        error: 'gog CLI is not installed',
      }, { status: 400 });
    }

    switch (action) {
      case 'auth_setup': {
        // Set up credentials
        const { credentialsPath, account, services } = params as {
          credentialsPath: string;
          account?: string;
          services?: string;
        };

        if (!credentialsPath) {
          return NextResponse.json({
            error: 'credentialsPath is required',
          }, { status: 400 });
        }

        // Check credentials file exists
        try {
          await fs.access(credentialsPath);
        } catch {
          return NextResponse.json({
            error: 'Credentials file not found',
            details: `${credentialsPath} does not exist`,
          }, { status: 404 });
        }

        // Set up credentials
        try {
          await execAsync(`gog auth credentials "${credentialsPath}"`);

          // If account provided, add it
          if (account) {
            const servicesList = services || 'gmail,calendar,drive,contacts,docs,sheets';
            const cmd = `gog auth add ${account} --services ${servicesList}`;
            const { stdout, stderr } = await execAsync(cmd);

            if (stderr.includes('ERROR')) {
              return NextResponse.json({
                error: 'Failed to add account',
                details: stderr,
              }, { status: 400 });
            }

            return NextResponse.json({
              success: true,
              message: `Account ${account} added successfully`,
              output: stdout,
            });
          }

          return NextResponse.json({
            success: true,
            message: 'Credentials configured. Now run: gog auth add <email> --services <services>',
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Authentication setup failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      case 'auth_add': {
        // Add a Google account
        const { email, services = 'gmail,calendar,drive,contacts,docs,sheets' } = params as {
          email: string;
          services?: string;
        };

        if (!email) {
          return NextResponse.json({
            error: 'email is required',
          }, { status: 400 });
        }

        try {
          const cmd = `gog auth add ${email} --services ${services}`;
          const { stdout, stderr } = await execAsync(cmd);

          // This command requires interactive OAuth, so we return instructions
          return NextResponse.json({
            success: true,
            message: 'OAuth flow initiated',
            instructions: `Complete the OAuth flow in your browser. Then verify with: gog auth list`,
            output: stdout + stderr,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Failed to add account',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      case 'auth_list': {
        // List accounts
        try {
          const { stdout } = await execAsync('gog auth list --json 2>/dev/null || echo "[]"');
          const accounts = JSON.parse(stdout);

          return NextResponse.json({
            success: true,
            accounts,
          });
        } catch (error) {
          return NextResponse.json({
            success: true,
            accounts: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Gmail operations
      case 'gmail_search': {
        const { query, account, max = 10 } = params as {
          query: string;
          account?: string;
          max?: number;
        };

        if (!query) {
          return NextResponse.json({
            error: 'query is required',
          }, { status: 400 });
        }

        const accountFlag = account ? `--account ${account}` : '';
        const cmd = `gog gmail search '${query}' --max ${max} ${accountFlag} --json --no-input`;

        try {
          const { stdout } = await execAsync(cmd);
          const results = JSON.parse(stdout);

          return NextResponse.json({
            success: true,
            results,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Gmail search failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      case 'gmail_send': {
        const { to, subject, body, account, bodyHtml } = params as {
          to: string;
          subject: string;
          body: string;
          account?: string;
          bodyHtml?: string;
        };

        if (!to || !subject) {
          return NextResponse.json({
            error: 'to and subject are required',
          }, { status: 400 });
        }

        const accountFlag = account ? `--account ${account}` : '';
        let cmd = `gog gmail send --to ${to} --subject '${subject.replace(/'/g, "'\\''")}' ${accountFlag}`;

        if (bodyHtml) {
          cmd += ` --body-html '${bodyHtml.replace(/'/g, "'\\''")}'`;
        } else if (body) {
          cmd += ` --body '${body.replace(/'/g, "'\\''")}'`;
        }

        try {
          const { stdout, stderr } = await execAsync(cmd);

          if (stderr.includes('ERROR')) {
            return NextResponse.json({
              error: 'Failed to send email',
              details: stderr,
            }, { status: 500 });
          }

          return NextResponse.json({
            success: true,
            message: 'Email sent successfully',
            output: stdout,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Failed to send email',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      // Calendar operations
      case 'calendar_events': {
        const { calendarId = 'primary', from, to, account, max = 20 } = params as {
          calendarId?: string;
          from?: string;
          to?: string;
          account?: string;
          max?: number;
        };

        const accountFlag = account ? `--account ${account}` : '';
        let cmd = `gog calendar events ${calendarId} --max ${max} ${accountFlag} --json`;

        if (from) cmd += ` --from ${from}`;
        if (to) cmd += ` --to ${to}`;

        try {
          const { stdout } = await execAsync(cmd);
          const events = JSON.parse(stdout);

          return NextResponse.json({
            success: true,
            events,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Failed to fetch calendar events',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      case 'calendar_create': {
        const { calendarId = 'primary', summary, from, to, eventColor } = params as {
          calendarId?: string;
          summary: string;
          from: string;
          to: string;
          eventColor?: number;
        };

        if (!summary || !from || !to) {
          return NextResponse.json({
            error: 'summary, from, and to are required',
          }, { status: 400 });
        }

        let cmd = `gog calendar create ${calendarId} --summary '${summary.replace(/'/g, "'\\''")}' --from ${from} --to ${to}`;

        if (eventColor !== undefined) {
          cmd += ` --event-color ${eventColor}`;
        }

        cmd += ' --json';

        try {
          const { stdout } = await execAsync(cmd);
          const event = JSON.parse(stdout);

          return NextResponse.json({
            success: true,
            event,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Failed to create calendar event',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      // Drive operations
      case 'drive_search': {
        const { query, account, max = 10 } = params as {
          query: string;
          account?: string;
          max?: number;
        };

        if (!query) {
          return NextResponse.json({
            error: 'query is required',
          }, { status: 400 });
        }

        const accountFlag = account ? `--account ${account}` : '';
        const cmd = `gog drive search '${query.replace(/'/g, "'\\''")}' --max ${max} ${accountFlag} --json`;

        try {
          const { stdout } = await execAsync(cmd);
          const results = JSON.parse(stdout);

          return NextResponse.json({
            success: true,
            results,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Drive search failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      // Sheets operations
      case 'sheets_get': {
        const { spreadsheetId, range, account } = params as {
          spreadsheetId: string;
          range: string;
          account?: string;
        };

        if (!spreadsheetId || !range) {
          return NextResponse.json({
            error: 'spreadsheetId and range are required',
          }, { status: 400 });
        }

        const accountFlag = account ? `--account ${account}` : '';
        const cmd = `gog sheets get ${spreadsheetId} '${range.replace(/'/g, "'\\''")}' ${accountFlag} --json`;

        try {
          const { stdout } = await execAsync(cmd);
          const data = JSON.parse(stdout);

          return NextResponse.json({
            success: true,
            data,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Failed to get sheet data',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      // Docs operations
      case 'docs_cat': {
        const { docId, account } = params as {
          docId: string;
          account?: string;
        };

        if (!docId) {
          return NextResponse.json({
            error: 'docId is required',
          }, { status: 400 });
        }

        const accountFlag = account ? `--account ${account}` : '';
        const cmd = `gog docs cat ${docId} ${accountFlag}`;

        try {
          const { stdout } = await execAsync(cmd);

          return NextResponse.json({
            success: true,
            content: stdout,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Failed to get doc content',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      case 'contacts_list': {
        const { account, max = 20 } = params as {
          account?: string;
          max?: number;
        };

        const accountFlag = account ? `--account ${account}` : '';
        const cmd = `gog contacts list --max ${max} ${accountFlag} --json`;

        try {
          const { stdout } = await execAsync(cmd);
          const contacts = JSON.parse(stdout);

          return NextResponse.json({
            success: true,
            contacts,
          });
        } catch (error) {
          return NextResponse.json({
            error: 'Failed to list contacts',
            details: error instanceof Error ? error.message : 'Unknown error',
          }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({
          error: 'Unknown action',
          availableActions: [
            'auth_setup',
            'auth_add',
            'auth_list',
            'gmail_search',
            'gmail_send',
            'calendar_events',
            'calendar_create',
            'drive_search',
            'sheets_get',
            'docs_cat',
            'contacts_list',
          ],
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      error: 'GOG request failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
