import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Construct path to the .env file in the project root
    // process.cwd() should give the root directory of the Next.js project
    const envPath = path.join(process.cwd(), '.env');

    // Read the .env file
    const fileContent = fs.readFileSync(envPath, { encoding: 'utf-8' });

    // Parse the .env file content
    const settings: { [key: string]: string } = {};
    const lines = fileContent.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Ignore empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('#')) {
        continue;
      }

      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').trim(); // Handle values that might contain '='

      if (key) {
        if (key === 'PASSWORD') {
          settings[key] = '********';
        } else {
          settings[key] = value;
        }
      }
    }

    return NextResponse.json(settings);

  } catch (error: any) {
    // Handle errors, e.g., file not found
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: '.env file not found' }, { status: 404 });
    }
    // Log other errors for debugging, but return a generic error message
    console.error('Error reading .env file:', error);
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const envPath = path.join(process.cwd(), '.env');
    let newEnvContent = '';

    // Read existing .env file or initialize if not found
    let lines: string[] = [];
    if (fs.existsSync(envPath)) {
      lines = fs.readFileSync(envPath, { encoding: 'utf-8' }).split('\n');
    }

    const newEnvLines: string[] = [];
    const requestKeys = new Set(Object.keys(body));

    // Process existing lines
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        newEnvLines.push(line);
        continue;
      }

      const [key, ...valueParts] = trimmedLine.split('=');
      const originalValue = valueParts.join('='); // Preserve original value formatting if needed

      if (requestKeys.has(key)) {
        if (key === 'PASSWORD' && body[key] === '********') {
          newEnvLines.push(line); // Preserve existing password
        } else {
          newEnvLines.push(`${key}=${body[key]}`);
        }
        requestKeys.delete(key); // Mark as processed
      } else {
        newEnvLines.push(line); // Key not in request, preserve original line
      }
    }

    // Add new keys from the request that were not in the original file
    for (const key of Array.from(requestKeys)) { // Iterate remaining keys
      if (key === 'PASSWORD' && body[key] === '********') {
        // Do not add a new PASSWORD entry if it's the masked value
        continue;
      }
      newEnvLines.push(`${key}=${body[key]}`);
    }

    newEnvContent = newEnvLines.join('\n');

    // Ensure the file ends with a newline if it's not empty
    // and the content itself doesn't already end with one (e.g. if newEnvLines was empty)
    if (newEnvContent.length > 0 && !newEnvContent.endsWith('\n')) {
      newEnvContent += '\n';
    }
    // If the file is completely empty (all lines removed, no new lines added),
    // newEnvContent will be empty. fs.writeFileSync will create/truncate the file.

    fs.writeFileSync(envPath, newEnvContent, { encoding: 'utf-8' });

    return NextResponse.json({ message: 'Settings updated successfully' });

  } catch (error: any) {
    console.error('Error updating .env file:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
